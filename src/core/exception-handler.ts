import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  GoalAdapterObservationRecord,
  GoalDagNode,
  GoalNodePreparedResources,
  GoalRecoveryDecisionRecord,
  GoalRecoveryDecisionAction,
  GoalSubagentRecord,
} from "./types.js";

export type RecoveryRuleActivationState = "proposed" | "enabled" | "disabled" | "awaiting-review";

export interface RecoveryRuleValidationResult {
  status: "pending" | "passed" | "failed";
  at: string;
  summary?: string;
  evidence?: Record<string, unknown>;
}

export interface RecoveryRuleProvenance {
  goalId?: string;
  nodeId?: string;
  subagentId?: string;
  observationAt?: string;
}

export interface RecoveryRuleDraft {
  ruleId: string;
  version: number;
  adapterId: string;
  observationKind: GoalAdapterObservationRecord["kind"];
  signature: string;
  proposedDecision: GoalRecoveryDecisionRecord;
  confidence: "low" | "medium" | "high";
  evidenceSamples: Array<Record<string, unknown>>;
  provenance: RecoveryRuleProvenance[];
  activationState: RecoveryRuleActivationState;
  validationRequirements: string[];
  lastValidationResult?: RecoveryRuleValidationResult;
  rollbackPlan?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryRuleStore {
  listRecoveryRules(): Promise<RecoveryRuleDraft[]> | RecoveryRuleDraft[];
  getRecoveryRule?(ruleId: string): Promise<RecoveryRuleDraft | undefined> | RecoveryRuleDraft | undefined;
  upsertRecoveryRule(rule: RecoveryRuleDraft): Promise<RecoveryRuleDraft> | RecoveryRuleDraft;
}

export interface RecoveryRuleActivationPolicy {
  /** Defaults to true. Enabled generated rules must have passed validation before automatic use. */
  requireValidationPassed?: boolean;
  /** Defaults to safe bounded actions that reuse resources or block/ask. */
  allowedActions?: GoalRecoveryDecisionAction[];
}

export interface RecoveryRuleActivationDecision {
  eligible: boolean;
  reasons: string[];
}

export interface ControllerModelDiagnosticRequest extends ExceptionHandlingRequest {
  signature: string;
  deterministicDecision: GoalRecoveryDecisionRecord;
  pendingRule?: RecoveryRuleDraft;
}

export type ControllerModelDiagnostic = (
  request: ControllerModelDiagnosticRequest,
) => Promise<GoalRecoveryDecisionRecord> | GoalRecoveryDecisionRecord;

export interface ExceptionHandlingRequest {
  goalId: string;
  node: GoalDagNode;
  subagent?: GoalSubagentRecord;
  resources?: GoalNodePreparedResources;
  observation: GoalAdapterObservationRecord;
  recentMatchingFailures?: number;
  previousDecisions?: GoalRecoveryDecisionRecord[];
  maxRetries?: number;
  retryCount?: number;
  now?: Date | string;
}

export type ControllerExceptionHandler = (
  request: ExceptionHandlingRequest,
) => Promise<GoalRecoveryDecisionRecord> | GoalRecoveryDecisionRecord;

export interface DefaultControllerExceptionHandlerOptions {
  repeatedFailureRuleThreshold?: number;
  recoveryRules?: RecoveryRuleDraft[] | (() => Promise<RecoveryRuleDraft[]> | RecoveryRuleDraft[]);
  recoveryRuleStore?: RecoveryRuleStore;
  activationPolicy?: RecoveryRuleActivationPolicy;
  controllerModelDiagnostic?: ControllerModelDiagnostic;
  now?: () => Date;
}

const DEFAULT_ALLOWED_RULE_ACTIONS: GoalRecoveryDecisionAction[] = [
  "sendPromptToSameSession",
  "restartRunnerSameSession",
  "restartRunnerSameWorktreeNewSession",
  "markNodeBlocked",
  "askUser",
];

export function createDefaultControllerExceptionHandler(
  options: DefaultControllerExceptionHandlerOptions = {},
): ControllerExceptionHandler {
  return async (request) => {
    const signature = normalizeExceptionSignature(request.observation);
    const rules = await loadRecoveryRules(options);
    const matchingRule = findMatchingRecoveryRule(rules, request.observation, options.activationPolicy);
    if (matchingRule) return decisionFromRecoveryRule(matchingRule, request, options);

    let decision = defaultControllerExceptionDecision(request, options);
    let pendingRule: RecoveryRuleDraft | undefined;
    if (decision.action === "proposeRecoveryRule") {
      pendingRule = buildRecoveryRuleDraft(request, decision, { now: request.now ?? options.now?.() ?? new Date() });
      if (options.recoveryRuleStore) pendingRule = await options.recoveryRuleStore.upsertRecoveryRule(pendingRule);
    }

    if (decision.action === "invokeControllerModel" && options.controllerModelDiagnostic) {
      decision = await options.controllerModelDiagnostic({
        ...request,
        signature,
        deterministicDecision: decision,
        pendingRule,
      });
    }

    return decision;
  };
}

export function defaultControllerExceptionDecision(
  request: ExceptionHandlingRequest,
  options: DefaultControllerExceptionHandlerOptions = {},
): GoalRecoveryDecisionRecord {
  const at = toIso(request.now ?? options.now?.() ?? new Date());
  const retryCount = request.retryCount ?? request.subagent?.retryCount ?? 0;
  const maxRetries = request.maxRetries ?? 2;
  const reason = request.observation.error ?? request.observation.summary ?? `${request.observation.kind} observed`;
  const evidence = compactEvidence({
    adapterId: request.observation.adapterId,
    observationKind: request.observation.kind,
    nodeId: request.node.nodeId,
    subagentId: request.subagent?.subagentId,
    resources: request.resources,
    observationEvidence: request.observation.evidence,
    signature: normalizeExceptionSignature(request.observation),
  });

  const repeatedThreshold = options.repeatedFailureRuleThreshold ?? 3;
  if ((request.recentMatchingFailures ?? 0) >= repeatedThreshold) {
    return {
      action: "proposeRecoveryRule",
      ruleId: `recovery-${request.observation.adapterId}-${request.observation.kind}-${hashLite(normalizeExceptionSignature(request.observation))}`,
      reason: `repeated abnormal observation signature reached threshold (${request.recentMatchingFailures}/${repeatedThreshold}): ${reason}`,
      at,
      confidence: "medium",
      retryCount,
      maxRetries,
      evidence,
    };
  }

  switch (request.observation.kind) {
    case "protocolViolation":
      return {
        action: "sendPromptToSameSession",
        reason: `subagent protocol violation requires same-session follow-up: ${reason}`,
        at,
        confidence: "high",
        prompt: buildProtocolViolationPrompt(request.node.nodeId, reason),
        retryCount,
        maxRetries,
        evidence,
      };
    case "runnerLost":
      return {
        action: "restartRunnerSameSession",
        reason: `runner is not live; restart runner against prepared session/resources: ${reason}`,
        at,
        confidence: "medium",
        retryCount,
        maxRetries,
        evidence,
      };
    case "runnerError": {
      if (isProviderLimit(reason)) {
        return {
          action: "markNodeBlocked",
          reason: `provider/model quota or billing limit reached: ${reason}`,
          at,
          confidence: "high",
          retryCount,
          maxRetries,
          evidence,
        };
      }
      if (isMissingSession(reason)) {
        return {
          action: "restartRunnerSameWorktreeNewSession",
          reason: `session record is missing or stale; reuse prepared worktree and start a new session: ${reason}`,
          at,
          confidence: "high",
          retryCount,
          maxRetries,
          evidence,
        };
      }
      if (isTerminated(reason) && retryCount >= maxRetries) {
        return {
          action: "restartRunnerSameWorktreeNewSession",
          reason: `terminated session exhausted same-session retries; start a new session on the same prepared worktree: ${reason}`,
          at,
          confidence: "medium",
          retryCount,
          maxRetries,
          evidence,
        };
      }
      if (isContextExceeded(reason)) {
        return {
          action: "invokeControllerModel",
          reason: `context window pressure needs controller diagnosis/model-routing decision: ${reason}`,
          at,
          confidence: "medium",
          retryCount,
          maxRetries,
          evidence,
        };
      }
      if (retryCount >= maxRetries) {
        return {
          action: "invokeControllerModel",
          reason: `runner error exceeded deterministic retries; controller model diagnosis required: ${reason}`,
          at,
          confidence: "medium",
          retryCount,
          maxRetries,
          evidence,
        };
      }
      const transient = isTransient(reason) || isTerminated(reason);
      return {
        action: "sendPromptToSameSession",
        reason: `${transient ? "transient" : "unclassified"} runner error recovery should preserve session/workspace context: ${reason}`,
        at,
        confidence: transient ? "high" : "medium",
        prompt: buildRunnerErrorPrompt(request.node.objective, reason, retryCount, maxRetries),
        retryCount,
        maxRetries,
        evidence,
      };
    }
    case "selfReportedBlocked":
      return {
        action: "invokeControllerModel",
        reason: `subagent reported blocked; controller should judge recoverability: ${reason}`,
        at,
        confidence: "medium",
        retryCount,
        maxRetries,
        evidence,
      };
    case "stopped":
      return {
        action: "restartRunnerSameWorktreeNewSession",
        reason: `runner stopped before controller terminal closeout: ${reason}`,
        at,
        confidence: "low",
        retryCount,
        maxRetries,
        evidence,
      };
    default:
      return {
        action: "delegateToLegacyRecovery",
        reason: `formal observation does not require exception handling: ${request.observation.kind}`,
        at,
        confidence: "high",
        retryCount,
        maxRetries,
        evidence,
      };
  }
}

export function normalizeExceptionSignature(observation: GoalAdapterObservationRecord): string {
  const text = [observation.adapterId, observation.kind, observation.error ?? observation.summary ?? ""]
    .join("\n")
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/g, "<hex>")
    .replace(/\b\d+\b/g, "<num>")
    .replace(/\s+/g, " ")
    .trim();
  return text || `${observation.adapterId}:${observation.kind}`;
}

export function buildRecoveryRuleDraft(
  request: ExceptionHandlingRequest,
  decision: GoalRecoveryDecisionRecord,
  options: { ruleId?: string; now?: Date | string; activationState?: RecoveryRuleDraft["activationState"] } = {},
): RecoveryRuleDraft {
  const now = toIso(options.now ?? request.now ?? new Date());
  const ruleId = options.ruleId ?? decision.ruleId ?? `recovery-${request.observation.adapterId}-${request.observation.kind}-${hashLite(normalizeExceptionSignature(request.observation))}`;
  return {
    ruleId,
    version: 1,
    adapterId: request.observation.adapterId,
    observationKind: request.observation.kind,
    signature: normalizeExceptionSignature(request.observation),
    proposedDecision: { ...decision, ruleId },
    confidence: decision.confidence ?? "low",
    evidenceSamples: [compactEvidence({ observation: request.observation, nodeId: request.node.nodeId, subagentId: request.subagent?.subagentId })],
    provenance: [{ goalId: request.goalId, nodeId: request.node.nodeId, subagentId: request.subagent?.subagentId, observationAt: request.observation.at }],
    activationState: options.activationState ?? "proposed",
    validationRequirements: ["review-generated-recovery-rule", "validate-bounded-recovery-action", "verify-no-resource-duplication"],
    lastValidationResult: {
      status: "pending",
      at: now,
      summary: "generated recovery rule requires validation/review before activation",
    },
    rollbackPlan: "Set activationState to disabled or delete this rule artifact; controller falls back to deterministic/model diagnosis.",
    createdAt: now,
    updatedAt: now,
  };
}

export function recoveryRuleActivationDecision(
  rule: RecoveryRuleDraft,
  policy: RecoveryRuleActivationPolicy = {},
): RecoveryRuleActivationDecision {
  const reasons: string[] = [];
  if (rule.activationState !== "enabled") reasons.push(`activationState is ${rule.activationState}`);
  const allowedActions = policy.allowedActions ?? DEFAULT_ALLOWED_RULE_ACTIONS;
  if (!allowedActions.includes(rule.proposedDecision.action)) reasons.push(`action ${rule.proposedDecision.action} is not enabled by policy`);
  if ((policy.requireValidationPassed ?? true) && rule.lastValidationResult?.status !== "passed") {
    reasons.push("validation has not passed");
  }
  return { eligible: reasons.length === 0, reasons };
}

export function activateRecoveryRule(
  rule: RecoveryRuleDraft,
  options: { now?: Date | string; validation?: RecoveryRuleValidationResult; policy?: RecoveryRuleActivationPolicy } = {},
): RecoveryRuleDraft {
  const now = toIso(options.now ?? new Date());
  const activated: RecoveryRuleDraft = {
    ...rule,
    activationState: "enabled",
    lastValidationResult: options.validation ?? rule.lastValidationResult,
    updatedAt: now,
  };
  const decision = recoveryRuleActivationDecision(activated, options.policy);
  if (!decision.eligible) {
    return {
      ...activated,
      activationState: "awaiting-review",
      lastValidationResult: activated.lastValidationResult ?? { status: "pending", at: now, summary: decision.reasons.join("; ") },
    };
  }
  return activated;
}

export function findMatchingRecoveryRule(
  rules: RecoveryRuleDraft[],
  observation: GoalAdapterObservationRecord,
  policy: RecoveryRuleActivationPolicy = {},
): RecoveryRuleDraft | undefined {
  const signature = normalizeExceptionSignature(observation);
  return rules.find((rule) =>
    rule.adapterId === observation.adapterId &&
    rule.observationKind === observation.kind &&
    rule.signature === signature &&
    recoveryRuleActivationDecision(rule, policy).eligible,
  );
}

export class MemoryRecoveryRuleStore implements RecoveryRuleStore {
  private readonly rules = new Map<string, RecoveryRuleDraft>();

  constructor(rules: RecoveryRuleDraft[] = []) {
    for (const rule of rules) this.rules.set(rule.ruleId, cloneJson(rule));
  }

  listRecoveryRules(): RecoveryRuleDraft[] {
    return [...this.rules.values()].map(cloneJson).sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  }

  getRecoveryRule(ruleId: string): RecoveryRuleDraft | undefined {
    const rule = this.rules.get(ruleId);
    return rule ? cloneJson(rule) : undefined;
  }

  upsertRecoveryRule(rule: RecoveryRuleDraft): RecoveryRuleDraft {
    const merged = mergeRecoveryRule(this.rules.get(rule.ruleId), rule);
    this.rules.set(rule.ruleId, cloneJson(merged));
    return cloneJson(merged);
  }
}

export class FileRecoveryRuleStore implements RecoveryRuleStore {
  constructor(private readonly rootDir: string) {}

  async listRecoveryRules(): Promise<RecoveryRuleDraft[]> {
    await mkdir(this.rootDir, { recursive: true });
    const entries = await readdir(this.rootDir, { withFileTypes: true });
    const rules: RecoveryRuleDraft[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      try {
        const parsed = JSON.parse(await readFile(join(this.rootDir, entry.name), "utf8")) as RecoveryRuleDraft;
        if (parsed.ruleId) rules.push(parsed);
      } catch {
        // Ignore malformed rule artifacts; validation/review tooling can report them separately.
      }
    }
    return rules.sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  }

  async getRecoveryRule(ruleId: string): Promise<RecoveryRuleDraft | undefined> {
    try {
      return JSON.parse(await readFile(this.filePath(ruleId), "utf8")) as RecoveryRuleDraft;
    } catch {
      return undefined;
    }
  }

  async upsertRecoveryRule(rule: RecoveryRuleDraft): Promise<RecoveryRuleDraft> {
    await mkdir(this.rootDir, { recursive: true });
    const existing = await this.getRecoveryRule(rule.ruleId);
    const merged = mergeRecoveryRule(existing, rule);
    await writeFile(this.filePath(rule.ruleId), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
    return merged;
  }

  private filePath(ruleId: string): string {
    return join(this.rootDir, `${safeRuleFileName(ruleId)}.json`);
  }
}

function decisionFromRecoveryRule(
  rule: RecoveryRuleDraft,
  request: ExceptionHandlingRequest,
  options: DefaultControllerExceptionHandlerOptions,
): GoalRecoveryDecisionRecord {
  const at = toIso(request.now ?? options.now?.() ?? new Date());
  const evidence = compactEvidence({
    ...(rule.proposedDecision.evidence ?? {}),
    matchedRuleId: rule.ruleId,
    activationState: rule.activationState,
    signature: rule.signature,
    validation: rule.lastValidationResult,
  });
  return {
    ...rule.proposedDecision,
    ruleId: rule.ruleId,
    at,
    evidence,
  };
}

async function loadRecoveryRules(options: DefaultControllerExceptionHandlerOptions): Promise<RecoveryRuleDraft[]> {
  const configured = typeof options.recoveryRules === "function" ? await options.recoveryRules() : options.recoveryRules ?? [];
  const stored = options.recoveryRuleStore ? await options.recoveryRuleStore.listRecoveryRules() : [];
  const byId = new Map<string, RecoveryRuleDraft>();
  for (const rule of [...configured, ...stored]) byId.set(rule.ruleId, rule);
  return [...byId.values()];
}

function mergeRecoveryRule(existing: RecoveryRuleDraft | undefined, next: RecoveryRuleDraft): RecoveryRuleDraft {
  if (!existing) return cloneJson(next);
  return {
    ...existing,
    ...next,
    createdAt: existing.createdAt,
    evidenceSamples: mergeEvidenceSamples(existing.evidenceSamples, next.evidenceSamples),
    provenance: mergeProvenance(existing.provenance, next.provenance),
    updatedAt: next.updatedAt,
  };
}

function mergeEvidenceSamples(left: Array<Record<string, unknown>>, right: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const merged: Array<Record<string, unknown>> = [];
  for (const item of [...left, ...right]) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.slice(-10);
}

function mergeProvenance(left: RecoveryRuleProvenance[], right: RecoveryRuleProvenance[]): RecoveryRuleProvenance[] {
  const seen = new Set<string>();
  const merged: RecoveryRuleProvenance[] = [];
  for (const item of [...left, ...right]) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.slice(-20);
}

function buildProtocolViolationPrompt(nodeId: string, reason: string): string {
  return [
    `[SYSTEM FOLLOW-UP: PROTOCOL_VIOLATION]`,
    `Your latest response for node "${nodeId}" did not satisfy the required subagent reporting protocol.`,
    `Observed issue: ${reason}`,
    `If the node is complete, reply with exactly: SUBAGENT_RESULT: <summary of changes, verification, and remaining risks>`,
    `If blocked, reply with exactly: SUBAGENT_BLOCKED: <specific blocker and needed input/state change>`,
  ].join("\n");
}

function buildRunnerErrorPrompt(objective: string, reason: string, retryCount: number, maxRetries: number): string {
  return [
    `[SYSTEM RECOVERY: CONTROLLER_EXCEPTION_HANDLER]`,
    `The controller observed a runner error but is preserving this session/workspace.`,
    `Observed issue: ${reason}`,
    `Continue the node objective: ${objective}`,
    `Report SUBAGENT_RESULT when done or SUBAGENT_BLOCKED if truly blocked.`,
    `Recovery attempt ${retryCount + 1}/${maxRetries}.`,
  ].join("\n");
}

function isProviderLimit(message: string): boolean {
  return /GoUsageLimitError|FreeUsageLimitError|Monthly usage limit reached|available balance|insufficient_quota|out of budget|quota exceeded|billing|usage limit|credit limit/i.test(message);
}

function isTransient(message: string): boolean {
  return /server_error|timeout|rate.?limit|too many requests|service unavailable|temporarily unavailable|internal server error|bad gateway|gateway timeout|connection reset|econnrefused|econnreset|etimedout|enotfound|eai_again|network error|websocket|An error occurred while processing your request/i.test(message);
}

function isContextExceeded(message: string): boolean {
  return /context_length_exceeded|context window|input exceeds|too many tokens|maximum context length|reduce the length/i.test(message);
}

function isMissingSession(message: string): boolean {
  return /session file not found|has no sessionFile|no sessionFile to resume|missing .*session|session .*missing/i.test(message);
}

function isTerminated(message: string): boolean {
  return /^terminated$|assistant error:\s*terminated|\bterminated\b/i.test(message);
}

function compactEvidence(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function hashLite(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash.toString(36);
}

function safeRuleFileName(ruleId: string): string {
  return ruleId.replace(/[^a-zA-Z0-9_.-]/g, "-").replace(/-{2,}/g, "-").slice(0, 160) || "recovery-rule";
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toIso(value: Date | string): string {
  return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}

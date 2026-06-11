import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const DEFAULT_ALLOWED_RULE_ACTIONS = [
    "sendPromptToSameSession",
    "restartRunnerSameSession",
    "restartRunnerSameWorktreeNewSession",
    "markNodeBlocked",
    "askUser",
];
export function createDefaultControllerExceptionHandler(options = {}) {
    return async (request) => {
        const signature = normalizeExceptionSignature(request.observation);
        const rules = await loadRecoveryRules(options);
        const matchingRule = findMatchingRecoveryRule(rules, request.observation, options.activationPolicy);
        if (matchingRule)
            return decisionFromRecoveryRule(matchingRule, request, options);
        let decision = defaultControllerExceptionDecision(request, options);
        let pendingRule;
        if (decision.action === "proposeRecoveryRule") {
            pendingRule = buildRecoveryRuleDraft(request, decision, { now: request.now ?? options.now?.() ?? new Date() });
            if (options.recoveryRuleStore)
                pendingRule = await options.recoveryRuleStore.upsertRecoveryRule(pendingRule);
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
export function defaultControllerExceptionDecision(request, options = {}) {
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
export function normalizeExceptionSignature(observation) {
    const text = [observation.adapterId, observation.kind, observation.error ?? observation.summary ?? ""]
        .join("\n")
        .toLowerCase()
        .replace(/[0-9a-f]{8,}/g, "<hex>")
        .replace(/\b\d+\b/g, "<num>")
        .replace(/\s+/g, " ")
        .trim();
    return text || `${observation.adapterId}:${observation.kind}`;
}
export function buildRecoveryRuleDraft(request, decision, options = {}) {
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
export function recoveryRuleActivationDecision(rule, policy = {}) {
    const reasons = [];
    if (rule.activationState !== "enabled")
        reasons.push(`activationState is ${rule.activationState}`);
    const allowedActions = policy.allowedActions ?? DEFAULT_ALLOWED_RULE_ACTIONS;
    if (!allowedActions.includes(rule.proposedDecision.action))
        reasons.push(`action ${rule.proposedDecision.action} is not enabled by policy`);
    if ((policy.requireValidationPassed ?? true) && rule.lastValidationResult?.status !== "passed") {
        reasons.push("validation has not passed");
    }
    return { eligible: reasons.length === 0, reasons };
}
export function activateRecoveryRule(rule, options = {}) {
    const now = toIso(options.now ?? new Date());
    const activated = {
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
export function findMatchingRecoveryRule(rules, observation, policy = {}) {
    const signature = normalizeExceptionSignature(observation);
    return rules.find((rule) => rule.adapterId === observation.adapterId &&
        rule.observationKind === observation.kind &&
        rule.signature === signature &&
        recoveryRuleActivationDecision(rule, policy).eligible);
}
export class MemoryRecoveryRuleStore {
    rules = new Map();
    constructor(rules = []) {
        for (const rule of rules)
            this.rules.set(rule.ruleId, cloneJson(rule));
    }
    listRecoveryRules() {
        return [...this.rules.values()].map(cloneJson).sort((a, b) => a.ruleId.localeCompare(b.ruleId));
    }
    getRecoveryRule(ruleId) {
        const rule = this.rules.get(ruleId);
        return rule ? cloneJson(rule) : undefined;
    }
    upsertRecoveryRule(rule) {
        const merged = mergeRecoveryRule(this.rules.get(rule.ruleId), rule);
        this.rules.set(rule.ruleId, cloneJson(merged));
        return cloneJson(merged);
    }
}
export class FileRecoveryRuleStore {
    rootDir;
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    async listRecoveryRules() {
        await mkdir(this.rootDir, { recursive: true });
        const entries = await readdir(this.rootDir, { withFileTypes: true });
        const rules = [];
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith(".json"))
                continue;
            try {
                const parsed = JSON.parse(await readFile(join(this.rootDir, entry.name), "utf8"));
                if (parsed.ruleId)
                    rules.push(parsed);
            }
            catch {
                // Ignore malformed rule artifacts; validation/review tooling can report them separately.
            }
        }
        return rules.sort((a, b) => a.ruleId.localeCompare(b.ruleId));
    }
    async getRecoveryRule(ruleId) {
        try {
            return JSON.parse(await readFile(this.filePath(ruleId), "utf8"));
        }
        catch {
            return undefined;
        }
    }
    async upsertRecoveryRule(rule) {
        await mkdir(this.rootDir, { recursive: true });
        const existing = await this.getRecoveryRule(rule.ruleId);
        const merged = mergeRecoveryRule(existing, rule);
        await writeFile(this.filePath(rule.ruleId), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
        return merged;
    }
    filePath(ruleId) {
        return join(this.rootDir, `${safeRuleFileName(ruleId)}.json`);
    }
}
function decisionFromRecoveryRule(rule, request, options) {
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
async function loadRecoveryRules(options) {
    const configured = typeof options.recoveryRules === "function" ? await options.recoveryRules() : options.recoveryRules ?? [];
    const stored = options.recoveryRuleStore ? await options.recoveryRuleStore.listRecoveryRules() : [];
    const byId = new Map();
    for (const rule of [...configured, ...stored])
        byId.set(rule.ruleId, rule);
    return [...byId.values()];
}
function mergeRecoveryRule(existing, next) {
    if (!existing)
        return cloneJson(next);
    return {
        ...existing,
        ...next,
        createdAt: existing.createdAt,
        evidenceSamples: mergeEvidenceSamples(existing.evidenceSamples, next.evidenceSamples),
        provenance: mergeProvenance(existing.provenance, next.provenance),
        updatedAt: next.updatedAt,
    };
}
function mergeEvidenceSamples(left, right) {
    const seen = new Set();
    const merged = [];
    for (const item of [...left, ...right]) {
        const key = JSON.stringify(item);
        if (seen.has(key))
            continue;
        seen.add(key);
        merged.push(item);
    }
    return merged.slice(-10);
}
function mergeProvenance(left, right) {
    const seen = new Set();
    const merged = [];
    for (const item of [...left, ...right]) {
        const key = JSON.stringify(item);
        if (seen.has(key))
            continue;
        seen.add(key);
        merged.push(item);
    }
    return merged.slice(-20);
}
function buildProtocolViolationPrompt(nodeId, reason) {
    return [
        `[SYSTEM FOLLOW-UP: PROTOCOL_VIOLATION]`,
        `Your latest response for node "${nodeId}" did not satisfy the required subagent reporting protocol.`,
        `Observed issue: ${reason}`,
        `If the node is complete, reply with exactly: SUBAGENT_RESULT: <summary of changes, verification, and remaining risks>`,
        `If blocked, reply with exactly: SUBAGENT_BLOCKED: <specific blocker and needed input/state change>`,
    ].join("\n");
}
function buildRunnerErrorPrompt(objective, reason, retryCount, maxRetries) {
    return [
        `[SYSTEM RECOVERY: CONTROLLER_EXCEPTION_HANDLER]`,
        `The controller observed a runner error but is preserving this session/workspace.`,
        `Observed issue: ${reason}`,
        `Continue the node objective: ${objective}`,
        `Report SUBAGENT_RESULT when done or SUBAGENT_BLOCKED if truly blocked.`,
        `Recovery attempt ${retryCount + 1}/${maxRetries}.`,
    ].join("\n");
}
function isProviderLimit(message) {
    return /GoUsageLimitError|FreeUsageLimitError|Monthly usage limit reached|available balance|insufficient_quota|out of budget|quota exceeded|billing|usage limit|credit limit/i.test(message);
}
function isTransient(message) {
    return /server_error|timeout|rate.?limit|too many requests|service unavailable|temporarily unavailable|internal server error|bad gateway|gateway timeout|connection reset|econnrefused|econnreset|etimedout|enotfound|eai_again|network error|websocket|An error occurred while processing your request/i.test(message);
}
function isContextExceeded(message) {
    return /context_length_exceeded|context window|input exceeds|too many tokens|maximum context length|reduce the length/i.test(message);
}
function isMissingSession(message) {
    return /session file not found|has no sessionFile|no sessionFile to resume|missing .*session|session .*missing/i.test(message);
}
function isTerminated(message) {
    return /^terminated$|assistant error:\s*terminated|\bterminated\b/i.test(message);
}
function compactEvidence(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
function hashLite(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1)
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    return hash.toString(36);
}
function safeRuleFileName(ruleId) {
    return ruleId.replace(/[^a-zA-Z0-9_.-]/g, "-").replace(/-{2,}/g, "-").slice(0, 160) || "recovery-rule";
}
function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}
function toIso(value) {
    return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}
//# sourceMappingURL=exception-handler.js.map
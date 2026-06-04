import type { GoalDagSchedulingPolicy } from "./dag-scheduler.js";
import type { HarnessSubagentAdapter, StartGoalSubagentOptions } from "./subagent-adapter.js";
import type { GoalDagNode, GoalOrchestrationState, GoalSubagentRecord } from "./types.js";

export interface GoalControllerRuntimePort {
  getGoalOrchestrationState(goalId: string): Promise<GoalOrchestrationState>;
  getGoalDagReadyQueue(goalId: string, policy?: GoalDagSchedulingPolicy): Promise<{ ready: GoalDagNode[]; blocked: Array<{ node: GoalDagNode; reasons: string[] }> }>;
  saveGoalDagNode(node: GoalDagNode): Promise<void>;
  saveGoalSubagent(subagent: GoalSubagentRecord): Promise<void>;
  startGoalSubagent(adapter: HarnessSubagentAdapter, node: GoalDagNode, options: StartGoalSubagentOptions): Promise<GoalSubagentRecord>;
  sendGoalSubagentPrompt(
    adapter: HarnessSubagentAdapter,
    subagent: GoalSubagentRecord,
    prompt: string,
    options?: { metadata?: Record<string, unknown>; now?: Date | string },
  ): Promise<GoalSubagentRecord>;
  syncGoalSubagent(adapter: HarnessSubagentAdapter, subagent: GoalSubagentRecord): Promise<GoalSubagentRecord>;
}

export interface GoalControllerWorkspaceAllocation {
  subagentId?: string;
  cwd?: string;
  branch?: string;
  ref?: string;
  systemPrompt?: string;
  initialPrompt?: string;
  metadata?: Record<string, unknown>;
}

export interface GoalControllerWorkspaceAllocationRequest {
  goalId: string;
  node: GoalDagNode;
  state: GoalOrchestrationState;
  adapterId: string;
  tickStartedAt: string;
}

export type GoalControllerWorkspaceAllocator = (
  request: GoalControllerWorkspaceAllocationRequest,
) => Promise<GoalControllerWorkspaceAllocation | undefined> | GoalControllerWorkspaceAllocation | undefined;

export interface GoalControllerValidationRequest {
  goalId: string;
  node: GoalDagNode;
  subagent: GoalSubagentRecord;
  state: GoalOrchestrationState;
  tickStartedAt: string;
}

export type GoalControllerValidationStatus = "passed" | "failed" | "blocked";

export interface GoalControllerValidationResult {
  status: GoalControllerValidationStatus;
  summary?: string;
  followupPrompt?: string;
  validationSignals?: string[];
}

export type GoalControllerValidator = (
  request: GoalControllerValidationRequest,
) => Promise<GoalControllerValidationResult> | GoalControllerValidationResult;

export interface GoalControllerInitialPromptRequest {
  goalId: string;
  node: GoalDagNode;
  state: GoalOrchestrationState;
}

export interface GoalControllerTickOptions {
  adapter: HarnessSubagentAdapter;
  schedulingPolicy?: GoalDagSchedulingPolicy;
  workspaceAllocator?: GoalControllerWorkspaceAllocator;
  validator?: GoalControllerValidator;
  renderInitialPrompt?: (request: GoalControllerInitialPromptRequest) => string;
  maxStartsPerTick?: number;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
  now?: Date | string | (() => Date | string);
}

export interface GoalControllerTickResult {
  goalId: string;
  started: GoalSubagentRecord[];
  synced: GoalSubagentRecord[];
  validating: GoalDagNode[];
  completed: GoalDagNode[];
  followups: GoalSubagentRecord[];
  blocked: GoalDagNode[];
  failed: GoalDagNode[];
  ready: GoalDagNode[];
  queueBlocked: Array<{ node: GoalDagNode; reasons: string[] }>;
  changed: boolean;
}

export interface GoalControllerLoopOptions extends GoalControllerTickOptions {
  maxTicks?: number;
  intervalMs?: number;
  stopWhenIdle?: boolean;
  signal?: AbortSignal;
}

export interface GoalControllerLoopResult {
  goalId: string;
  ticks: GoalControllerTickResult[];
}

const SYNCABLE_SUBAGENT_STATUSES = new Set<GoalSubagentRecord["status"]>(["sessionStarted", "running", "idle"]);
const NON_TERMINAL_SUBAGENT_STATUSES = new Set<GoalSubagentRecord["status"]>([
  "planned",
  "workspaceCreated",
  "sessionStarted",
  "running",
  "idle",
  "selfReportedComplete",
  "controllerValidating",
  "needsFollowup",
]);

export async function runGoalControllerTick(
  runtime: GoalControllerRuntimePort,
  goalId: string,
  options: GoalControllerTickOptions,
): Promise<GoalControllerTickResult> {
  const tickStartedAt = toIso(resolveNow(options.now));
  const result: GoalControllerTickResult = {
    goalId,
    started: [],
    synced: [],
    validating: [],
    completed: [],
    followups: [],
    blocked: [],
    failed: [],
    ready: [],
    queueBlocked: [],
    changed: false,
  };

  const initialState = await runtime.getGoalOrchestrationState(goalId);
  await syncSubagents(runtime, options.adapter, initialState, result);
  await reconcileSubagentOutcomes(runtime, goalId, options, result, tickStartedAt);
  await startReadyNodes(runtime, goalId, options, result, tickStartedAt);

  result.changed =
    result.started.length > 0 ||
    result.synced.length > 0 ||
    result.validating.length > 0 ||
    result.completed.length > 0 ||
    result.followups.length > 0 ||
    result.blocked.length > 0 ||
    result.failed.length > 0;
  return result;
}

export async function runGoalControllerLoop(
  runtime: GoalControllerRuntimePort,
  goalId: string,
  options: GoalControllerLoopOptions,
): Promise<GoalControllerLoopResult> {
  const maxTicks = options.maxTicks ?? 1;
  const intervalMs = options.intervalMs ?? 1_000;
  const stopWhenIdle = options.stopWhenIdle ?? true;
  const ticks: GoalControllerTickResult[] = [];

  for (let index = 0; index < maxTicks; index += 1) {
    if (options.signal?.aborted) break;
    const tick = await runGoalControllerTick(runtime, goalId, options);
    ticks.push(tick);
    if (stopWhenIdle && !tick.changed && tick.ready.length === 0) break;
    if (index < maxTicks - 1) await sleep(intervalMs, options.signal);
  }

  return { goalId, ticks };
}

async function syncSubagents(
  runtime: GoalControllerRuntimePort,
  adapter: HarnessSubagentAdapter,
  state: GoalOrchestrationState,
  result: GoalControllerTickResult,
): Promise<void> {
  for (const subagent of state.subagents) {
    if (subagent.harnessAdapterId !== adapter.adapterId) continue;
    if (!SYNCABLE_SUBAGENT_STATUSES.has(subagent.status)) continue;
    try {
      const updated = await runtime.syncGoalSubagent(adapter, subagent);
      if (subagentChanged(subagent, updated)) result.synced.push(updated);
    } catch (error) {
      if (isTransientStoreLockError(error)) continue;
      const failed = withSubagentPatch(subagent, {
        status: "failed",
        integrationStatus: error instanceof Error ? error.message : String(error),
      });
      await runtime.saveGoalSubagent(failed);
      const node = state.nodes.find((item) => item.nodeId === subagent.nodeId);
      if (node) {
        const failedNode = withNodePatch(node, { status: "failed", lastValidationSummary: failed.integrationStatus });
        await runtime.saveGoalDagNode(failedNode);
        result.failed.push(failedNode);
      }
      result.synced.push(failed);
    }
  }
}

async function reconcileSubagentOutcomes(
  runtime: GoalControllerRuntimePort,
  goalId: string,
  options: GoalControllerTickOptions,
  result: GoalControllerTickResult,
  tickStartedAt: string,
): Promise<void> {
  const state = await runtime.getGoalOrchestrationState(goalId);
  const nodesById = new Map(state.nodes.map((node) => [node.nodeId, node]));
  for (const subagent of latestSubagentPerNode(state.subagents)) {
    const node = nodesById.get(subagent.nodeId);
    if (!node) continue;

    if (subagent.status === "blocked") {
      const blockedNode = withNodePatch(node, { status: "blocked", lastValidationSummary: subagent.selfReportedResult ?? subagent.integrationStatus });
      await runtime.saveGoalDagNode(blockedNode);
      result.blocked.push(blockedNode);
      continue;
    }

    if (subagent.status === "failed") {
      const failedNode = withNodePatch(node, { status: "failed", lastValidationSummary: subagent.integrationStatus ?? subagent.selfReportedResult });
      await runtime.saveGoalDagNode(failedNode);
      result.failed.push(failedNode);
      continue;
    }

    if (subagent.status === "selfReportedComplete" || (subagent.status === "complete" && node.status !== "complete")) {
      await validateOrHold(runtime, options, state, node, subagent, result, tickStartedAt);
      continue;
    }

    if (["sessionStarted", "running", "idle"].includes(subagent.status) && node.status !== "running") {
      await runtime.saveGoalDagNode(withNodePatch(node, { status: "running" }));
    }
  }
}

async function validateOrHold(
  runtime: GoalControllerRuntimePort,
  options: GoalControllerTickOptions,
  state: GoalOrchestrationState,
  node: GoalDagNode,
  subagent: GoalSubagentRecord,
  result: GoalControllerTickResult,
  tickStartedAt: string,
): Promise<void> {
  const validatingNode = withNodePatch(node, { status: "controllerValidating" });
  const validatingSubagent = withSubagentPatch(subagent, { status: "controllerValidating" });
  await runtime.saveGoalDagNode(validatingNode);
  await runtime.saveGoalSubagent(validatingSubagent);
  result.validating.push(validatingNode);

  if (!options.validator) return;

  const validation = await options.validator({ goalId: node.goalId, node: validatingNode, subagent: validatingSubagent, state, tickStartedAt });
  const validationSummary = validation.summary ?? validation.validationSignals?.join("; ");
  const validationResults = appendValidationResults(validatingSubagent, validation);

  if (validation.status === "passed") {
    const completedNode = withNodePatch(validatingNode, { status: "complete", lastValidationSummary: validationSummary });
    const completedSubagent = withSubagentPatch(validationResults, { status: "complete" });
    await runtime.saveGoalDagNode(completedNode);
    await runtime.saveGoalSubagent(completedSubagent);
    result.completed.push(completedNode);
    return;
  }

  if (validation.status === "blocked") {
    const blockedNode = withNodePatch(validatingNode, { status: "blocked", lastValidationSummary: validationSummary });
    const blockedSubagent = withSubagentPatch(validationResults, { status: "blocked" });
    await runtime.saveGoalDagNode(blockedNode);
    await runtime.saveGoalSubagent(blockedSubagent);
    result.blocked.push(blockedNode);
    return;
  }

  if (validation.followupPrompt) {
    const followed = await runtime.sendGoalSubagentPrompt(options.adapter, validationResults, validation.followupPrompt, {
      metadata: options.metadata,
      now: tickStartedAt,
    });
    const runningSubagent = withSubagentPatch(followed, { status: "running" });
    const runningNode = withNodePatch(validatingNode, { status: "running", lastValidationSummary: validationSummary });
    await runtime.saveGoalSubagent(runningSubagent);
    await runtime.saveGoalDagNode(runningNode);
    result.followups.push(runningSubagent);
    return;
  }

  const needsFollowupNode = withNodePatch(validatingNode, { status: "needsFollowup", lastValidationSummary: validationSummary });
  const needsFollowupSubagent = withSubagentPatch(validationResults, { status: "needsFollowup" });
  await runtime.saveGoalDagNode(needsFollowupNode);
  await runtime.saveGoalSubagent(needsFollowupSubagent);
  result.followups.push(needsFollowupSubagent);
}

async function startReadyNodes(
  runtime: GoalControllerRuntimePort,
  goalId: string,
  options: GoalControllerTickOptions,
  result: GoalControllerTickResult,
  tickStartedAt: string,
): Promise<void> {
  const state = await runtime.getGoalOrchestrationState(goalId);
  const queue = await runtime.getGoalDagReadyQueue(goalId, options.schedulingPolicy);
  result.ready = queue.ready;
  result.queueBlocked = queue.blocked;
  const maxStarts = options.maxStartsPerTick ?? queue.ready.length;
  let started = 0;
  for (const node of queue.ready) {
    if (started >= maxStarts) break;
    if (hasNonTerminalSubagentForNode(state.subagents, node.nodeId)) continue;
    const allocation = await options.workspaceAllocator?.({ goalId, node, state, adapterId: options.adapter.adapterId, tickStartedAt });
    const startOptions: StartGoalSubagentOptions = {
      subagentId: allocation?.subagentId,
      cwd: allocation?.cwd,
      branch: allocation?.branch,
      ref: allocation?.ref,
      systemPrompt: allocation?.systemPrompt ?? options.systemPrompt,
      initialPrompt: allocation?.initialPrompt ?? options.renderInitialPrompt?.({ goalId, node, state }) ?? renderDefaultInitialPrompt(node),
      metadata: { ...(options.metadata ?? {}), ...(allocation?.metadata ?? {}) },
      now: tickStartedAt,
    };
    const subagent = await runtime.startGoalSubagent(options.adapter, node, startOptions);
    result.started.push(subagent);
    started += 1;
  }
}

function latestSubagentPerNode(subagents: GoalSubagentRecord[]): GoalSubagentRecord[] {
  const latest = new Map<string, GoalSubagentRecord>();
  for (const subagent of subagents) {
    const current = latest.get(subagent.nodeId);
    if (!current || subagent.updatedAt > current.updatedAt) latest.set(subagent.nodeId, subagent);
  }
  return [...latest.values()];
}

function hasNonTerminalSubagentForNode(subagents: GoalSubagentRecord[], nodeId: string): boolean {
  return subagents.some((subagent) => subagent.nodeId === nodeId && NON_TERMINAL_SUBAGENT_STATUSES.has(subagent.status));
}

function isTransientStoreLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /database is locked|SQLITE_BUSY/i.test(message);
}

function appendValidationResults(subagent: GoalSubagentRecord, validation: GoalControllerValidationResult): GoalSubagentRecord {
  const additions = [validation.summary, ...(validation.validationSignals ?? [])].filter((item): item is string => Boolean(item?.trim()));
  if (additions.length === 0) return subagent;
  return { ...subagent, controllerValidationResults: [...(subagent.controllerValidationResults ?? []), ...additions] };
}

function withNodePatch(node: GoalDagNode, patch: Partial<GoalDagNode>): GoalDagNode {
  return { ...node, ...patch, updatedAt: new Date().toISOString() };
}

function withSubagentPatch(subagent: GoalSubagentRecord, patch: Partial<GoalSubagentRecord>): GoalSubagentRecord {
  return { ...subagent, ...patch, updatedAt: new Date().toISOString(), lastActivityAt: patch.lastActivityAt ?? subagent.lastActivityAt };
}

function subagentChanged(left: GoalSubagentRecord, right: GoalSubagentRecord): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

function renderDefaultInitialPrompt(node: GoalDagNode): string {
  return [
    `Implement DAG node ${node.nodeId}: ${node.objective}`,
    node.scope ? `Scope: ${node.scope}` : undefined,
    node.expectedOutputs.length ? `Expected outputs: ${node.expectedOutputs.join(", ")}` : undefined,
    node.validators.length ? `Validators: ${node.validators.join(", ")}` : undefined,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function resolveNow(now: GoalControllerTickOptions["now"]): Date | string {
  return typeof now === "function" ? now() : now ?? new Date();
}

function toIso(value: Date | string): string {
  return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

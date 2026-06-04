import type { GoalDagNode, GoalSubagentRecord, GoalSubagentStatus } from "./types.js";
export type HarnessSubagentSessionStatus = "starting" | "running" | "idle" | "selfReportedComplete" | "blocked" | "failed" | "stopped";
export interface HarnessSubagentStartRequest {
    goalId: string;
    node: GoalDagNode;
    subagentId: string;
    cwd?: string;
    branch?: string;
    ref?: string;
    systemPrompt?: string;
    initialPrompt: string;
    metadata?: Record<string, unknown>;
}
export interface HarnessSubagentStartResult {
    sessionId?: string;
    sessionFile?: string;
    workspacePath?: string;
    branch?: string;
    ref?: string;
    status?: HarnessSubagentSessionStatus;
    lastActivityAt?: string;
    metadata?: Record<string, unknown>;
}
export interface HarnessSubagentPromptRequest {
    subagent: GoalSubagentRecord;
    prompt: string;
    metadata?: Record<string, unknown>;
}
export interface HarnessSubagentStateRequest {
    subagent: GoalSubagentRecord;
    metadata?: Record<string, unknown>;
}
export interface HarnessSubagentSessionState {
    status: HarnessSubagentSessionStatus;
    lastActivityAt?: string;
    selfReportedResult?: string;
    validationSignals?: string[];
    error?: string;
    metadata?: Record<string, unknown>;
}
export interface HarnessSubagentAbortRequest {
    subagent: GoalSubagentRecord;
    reason?: string;
    metadata?: Record<string, unknown>;
}
export type HarnessSubagentEventType = "sessionStarted" | "message" | "toolCall" | "toolResult" | "stateChanged" | "sessionEnded" | "error";
export interface HarnessSubagentEvent {
    type: HarnessSubagentEventType;
    at: string;
    subagentId?: string;
    sessionId?: string;
    data?: Record<string, unknown>;
}
export interface HarnessSubagentEventRequest {
    subagent: GoalSubagentRecord;
    signal?: AbortSignal;
    metadata?: Record<string, unknown>;
}
export interface HarnessSubagentAdapter {
    /** Stable adapter id, e.g. pi, codex, claude-code, opencode, shell-jsonrpc. */
    adapterId: string;
    startSession(request: HarnessSubagentStartRequest): Promise<HarnessSubagentStartResult> | HarnessSubagentStartResult;
    sendPrompt(request: HarnessSubagentPromptRequest): Promise<void> | void;
    getSessionState(request: HarnessSubagentStateRequest): Promise<HarnessSubagentSessionState> | HarnessSubagentSessionState;
    streamEvents?(request: HarnessSubagentEventRequest): AsyncIterable<HarnessSubagentEvent>;
    abortSession(request: HarnessSubagentAbortRequest): Promise<void> | void;
}
export interface StartGoalSubagentOptions {
    subagentId?: string;
    cwd?: string;
    branch?: string;
    ref?: string;
    systemPrompt?: string;
    initialPrompt: string;
    metadata?: Record<string, unknown>;
    now?: Date | string;
    /** Pi thinking level for the subagent session (off|minimal|low|medium|high|xhigh). */
    thinkingLevel?: string;
}
export interface StartedGoalSubagent {
    record: GoalSubagentRecord;
    startResult: HarnessSubagentStartResult;
}
export declare function startGoalSubagent(adapter: HarnessSubagentAdapter, node: GoalDagNode, options: StartGoalSubagentOptions): Promise<StartedGoalSubagent>;
export declare function sendGoalSubagentPrompt(adapter: HarnessSubagentAdapter, subagent: GoalSubagentRecord, prompt: string, options?: {
    metadata?: Record<string, unknown>;
    now?: Date | string;
}): Promise<GoalSubagentRecord>;
export declare function syncGoalSubagentState(adapter: HarnessSubagentAdapter, subagent: GoalSubagentRecord, options?: {
    metadata?: Record<string, unknown>;
    now?: Date | string;
}): Promise<GoalSubagentRecord>;
export declare function mapHarnessStatusToSubagentStatus(status: HarnessSubagentSessionStatus): GoalSubagentStatus;

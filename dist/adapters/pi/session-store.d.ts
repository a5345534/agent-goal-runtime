import type { ContinuationReservation, GoalDagNode, GoalLedgerEvent, GoalRecord, GoalSessionMetadata, GoalStore, GoalSubagentRecord, GoalSummary, WorkspaceProfile } from "../../core/index.js";
export declare const PI_GOAL_SESSION_ENTRY_TYPE = "goal-runner-state";
export declare const PI_LEGACY_GOAL_SESSION_ENTRY_TYPE = "agent-goal-runtime-state";
export declare const PI_GOAL_SESSION_ENTRY_TYPES: Set<string>;
export declare const PI_GOAL_SESSION_ENTRY_VERSION = 1;
export declare function isPiGoalSessionEntryType(value: unknown): value is string;
export type PiGoalSessionEntryData = {
    version: 1;
    kind: "goal_snapshot";
    sessionKey: string;
    goal: GoalRecord;
    at: string;
} | {
    version: 1;
    kind: "goal_cleared";
    sessionKey: string;
    at: string;
} | {
    version: 1;
    kind: "reservation_snapshot";
    sessionKey: string;
    reservation: ContinuationReservation;
    at: string;
} | {
    version: 1;
    kind: "reservation_cleared";
    sessionKey: string;
    at: string;
} | {
    version: 1;
    kind: "ledger_event";
    sessionKey: string;
    goalId?: string;
    event: GoalLedgerEvent;
    at: string;
} | {
    version: 1;
    kind: "goal_session_metadata";
    sessionKey: string;
    goalId: string;
    metadata: GoalSessionMetadata;
    at: string;
} | {
    version: 1;
    kind: "goal_dag_node";
    goalId: string;
    nodeId: string;
    node: GoalDagNode;
    at: string;
} | {
    version: 1;
    kind: "goal_subagent";
    goalId: string;
    nodeId: string;
    subagentId: string;
    subagent: GoalSubagentRecord;
    at: string;
} | {
    version: 1;
    kind: "workspace_profile";
    profile: WorkspaceProfile;
    at: string;
} | {
    version: 1;
    kind: "workspace_profile_removed";
    name: string;
    at: string;
};
export interface PiSessionGoalMirrorStoreOptions {
    now?: () => Date;
    onMirrorError?: (error: unknown) => void;
}
/**
 * Mirrors portable GoalStore writes into Pi custom session entries.
 *
 * The wrapped portable store remains canonical. Pi custom entries are an append-only
 * host-native trace that can follow Pi resume/fork/tree/compaction without making
 * Pi session files mandatory for non-Pi adapters.
 */
export declare class PiSessionGoalMirrorStore implements GoalStore {
    private readonly primary;
    private readonly appendEntry;
    private readonly now;
    private readonly onMirrorError?;
    constructor(primary: GoalStore, appendEntry: (data: PiGoalSessionEntryData) => void, options?: PiSessionGoalMirrorStoreOptions);
    getCurrentGoal(sessionKey: string): Promise<GoalRecord | undefined>;
    saveGoal(goal: GoalRecord): Promise<void>;
    clearGoal(sessionKey: string): Promise<void>;
    getReservation(sessionKey: string): Promise<ContinuationReservation | undefined>;
    saveReservation(reservation: ContinuationReservation): Promise<void>;
    clearReservation(sessionKey: string): Promise<void>;
    clearExpiredReservations(now?: Date): Promise<number>;
    appendLedgerEvent(event: GoalLedgerEvent): Promise<void>;
    listLedgerEvents(sessionKey: string, goalId?: string): Promise<GoalLedgerEvent[]>;
    saveGoalSessionMetadata(metadata: GoalSessionMetadata): Promise<void>;
    getGoalSessionMetadata(sessionKey: string): Promise<GoalSessionMetadata | undefined>;
    listGoalSummaries(): Promise<GoalSummary[]>;
    saveGoalDagNode(node: GoalDagNode): Promise<void>;
    getGoalDagNode(goalId: string, nodeId: string): Promise<GoalDagNode | undefined>;
    listGoalDagNodes(goalId: string): Promise<GoalDagNode[]>;
    saveGoalSubagent(subagent: GoalSubagentRecord): Promise<void>;
    getGoalSubagent(goalId: string, subagentId: string): Promise<GoalSubagentRecord | undefined>;
    listGoalSubagents(goalId: string, nodeId?: string): Promise<GoalSubagentRecord[]>;
    saveWorkspaceProfile(profile: WorkspaceProfile): Promise<void>;
    getWorkspaceProfile(name: string): Promise<WorkspaceProfile | undefined>;
    listWorkspaceProfiles(): Promise<WorkspaceProfile[]>;
    deleteWorkspaceProfile(name: string): Promise<boolean>;
    pruneLedgerEvents(goalId: string, options: {
        maxEvents: number;
    }): Promise<number>;
    close(): Promise<void> | void;
    private mirror;
    private nowIso;
}
export declare function readPiGoalSessionMirrorEntries(entries: Array<Record<string, unknown>>): PiGoalSessionEntryData[];

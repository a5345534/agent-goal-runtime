import type { GoalAdapterObservationRecord, GoalDagNode, GoalDagNodeLifecyclePhase, GoalDagNodeStatus, GoalNodePreparedResources, GoalRecoveryDecisionRecord, GoalSubagentObservationKind } from "./types.js";
import type { HarnessSubagentSessionState } from "./subagent-adapter.js";
export declare function projectLifecyclePhaseToNodeStatus(phase: GoalDagNodeLifecyclePhase, terminalStatus?: GoalDagNodeStatus): GoalDagNodeStatus;
export declare function withGoalDagNodeLifecyclePhase(node: GoalDagNode, phase: GoalDagNodeLifecyclePhase, options?: {
    status?: GoalDagNodeStatus;
    now?: Date | string;
}): GoalDagNode;
export declare function attachPreparedResourcesToNode(node: GoalDagNode, resources: GoalNodePreparedResources, options?: {
    phase?: GoalDagNodeLifecyclePhase;
    now?: Date | string;
}): GoalDagNode;
export declare function supersedePreparedResourcesOnNode(node: GoalDagNode, resources: GoalNodePreparedResources, options?: {
    phase?: GoalDagNodeLifecyclePhase;
    reason: string;
    supersededBy?: string;
    now?: Date | string;
}): GoalDagNode;
export declare function recordAdapterObservationOnNode(node: GoalDagNode, observation: GoalAdapterObservationRecord, options?: {
    phase?: GoalDagNodeLifecyclePhase;
    now?: Date | string;
}): GoalDagNode;
export declare function recordRecoveryDecisionOnNode(node: GoalDagNode, decision: GoalRecoveryDecisionRecord, options?: {
    phase?: GoalDagNodeLifecyclePhase;
    status?: GoalDagNodeStatus;
    now?: Date | string;
}): GoalDagNode;
export declare function observationKindFromHarnessState(state: HarnessSubagentSessionState): GoalSubagentObservationKind;
export declare function adapterObservationFromHarnessState(adapterId: string, state: HarnessSubagentSessionState, options?: {
    at?: Date | string;
    summary?: string;
    evidence?: Record<string, unknown>;
}): GoalAdapterObservationRecord;

import type { GoalAdapterObservationRecord, GoalDagNode, GoalNodePreparedResources, GoalRecoveryDecisionRecord, GoalRecoveryDecisionAction, GoalSubagentRecord } from "./types.js";
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
export type ControllerModelDiagnostic = (request: ControllerModelDiagnosticRequest) => Promise<GoalRecoveryDecisionRecord> | GoalRecoveryDecisionRecord;
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
export type ControllerExceptionHandler = (request: ExceptionHandlingRequest) => Promise<GoalRecoveryDecisionRecord> | GoalRecoveryDecisionRecord;
export interface DefaultControllerExceptionHandlerOptions {
    repeatedFailureRuleThreshold?: number;
    recoveryRules?: RecoveryRuleDraft[] | (() => Promise<RecoveryRuleDraft[]> | RecoveryRuleDraft[]);
    recoveryRuleStore?: RecoveryRuleStore;
    activationPolicy?: RecoveryRuleActivationPolicy;
    controllerModelDiagnostic?: ControllerModelDiagnostic;
    now?: () => Date;
}
export declare function createDefaultControllerExceptionHandler(options?: DefaultControllerExceptionHandlerOptions): ControllerExceptionHandler;
export declare function defaultControllerExceptionDecision(request: ExceptionHandlingRequest, options?: DefaultControllerExceptionHandlerOptions): GoalRecoveryDecisionRecord;
export declare function normalizeExceptionSignature(observation: GoalAdapterObservationRecord): string;
export declare function buildRecoveryRuleDraft(request: ExceptionHandlingRequest, decision: GoalRecoveryDecisionRecord, options?: {
    ruleId?: string;
    now?: Date | string;
    activationState?: RecoveryRuleDraft["activationState"];
}): RecoveryRuleDraft;
export declare function recoveryRuleActivationDecision(rule: RecoveryRuleDraft, policy?: RecoveryRuleActivationPolicy): RecoveryRuleActivationDecision;
export declare function activateRecoveryRule(rule: RecoveryRuleDraft, options?: {
    now?: Date | string;
    validation?: RecoveryRuleValidationResult;
    policy?: RecoveryRuleActivationPolicy;
}): RecoveryRuleDraft;
export declare function findMatchingRecoveryRule(rules: RecoveryRuleDraft[], observation: GoalAdapterObservationRecord, policy?: RecoveryRuleActivationPolicy): RecoveryRuleDraft | undefined;
export declare class MemoryRecoveryRuleStore implements RecoveryRuleStore {
    private readonly rules;
    constructor(rules?: RecoveryRuleDraft[]);
    listRecoveryRules(): RecoveryRuleDraft[];
    getRecoveryRule(ruleId: string): RecoveryRuleDraft | undefined;
    upsertRecoveryRule(rule: RecoveryRuleDraft): RecoveryRuleDraft;
}
export declare class FileRecoveryRuleStore implements RecoveryRuleStore {
    private readonly rootDir;
    constructor(rootDir: string);
    listRecoveryRules(): Promise<RecoveryRuleDraft[]>;
    getRecoveryRule(ruleId: string): Promise<RecoveryRuleDraft | undefined>;
    upsertRecoveryRule(rule: RecoveryRuleDraft): Promise<RecoveryRuleDraft>;
    private filePath;
}

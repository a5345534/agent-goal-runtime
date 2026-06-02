import { createGoalDagNodes } from "./dag-scheduler.js";
export function planGoalDagFromObjective(goalId, objectiveInput, options = {}) {
    const objective = objectiveInput.trim();
    if (!objective)
        throw new Error("goal objective is required to plan a DAG");
    return {
        goalId,
        nodeInputs: [buildSingleNodeInput(objective, options)],
        rationale: ["Planned one controller-owned execution node for the objective. Use /goal --dag <file> for multi-node DAG execution."],
        warnings: [],
    };
}
export function createGoalDagNodesFromObjective(goalId, objective, options = {}) {
    const plan = planGoalDagFromObjective(goalId, objective, options);
    return {
        ...plan,
        nodes: createGoalDagNodes(goalId, plan.nodeInputs, options),
    };
}
function buildSingleNodeInput(objective, options) {
    const nodeId = sanitizeSlug(objective) || "execute-goal";
    return {
        nodeId,
        slug: nodeId,
        objective,
        dependencyNodeIds: [],
        expectedOutputs: [...(options.defaultExpectedOutputs ?? [])],
        validators: [...(options.defaultValidators ?? [])],
        workspaceStrategy: options.defaultWorkspaceStrategy,
        conflictHints: cloneConflictHints(options.defaultConflictHints),
        completionGates: options.defaultCompletionGates,
    };
}
function cloneConflictHints(hints) {
    if (!hints)
        return undefined;
    return {
        files: hints.files ? [...hints.files] : undefined,
        modules: hints.modules ? [...hints.modules] : undefined,
        capabilities: hints.capabilities ? [...hints.capabilities] : undefined,
    };
}
function sanitizeSlug(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
}
//# sourceMappingURL=dag-planner.js.map
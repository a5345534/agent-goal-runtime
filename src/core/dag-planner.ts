import { createGoalDagNodes, type GoalDagPlanNodeInput, type GoalDagPlanOptions } from "./dag-scheduler.js";
import type { GoalDagConflictHints, GoalDagNode } from "./types.js";

export interface GoalDagObjectivePlanOptions extends GoalDagPlanOptions {
  /** Default validators copied onto every planned node unless overridden by inline annotations. */
  defaultValidators?: string[];
  /** Default expected outputs copied onto every planned node unless overridden by inline annotations. */
  defaultExpectedOutputs?: string[];
  /** Default conflict hints copied onto every planned node unless overridden by inline annotations. */
  defaultConflictHints?: GoalDagConflictHints;
}

export interface GoalDagPlannerResult {
  goalId: string;
  nodeInputs: GoalDagPlanNodeInput[];
  rationale: string[];
  warnings: string[];
}

export interface GoalDagPlannedNodesResult extends GoalDagPlannerResult {
  nodes: GoalDagNode[];
}

export function planGoalDagFromObjective(
  goalId: string,
  objectiveInput: string,
  options: GoalDagObjectivePlanOptions = {},
): GoalDagPlannerResult {
  const objective = objectiveInput.trim();
  if (!objective) throw new Error("goal objective is required to plan a DAG");

  return {
    goalId,
    nodeInputs: [buildSingleNodeInput(objective, options)],
    rationale: ["Planned one controller-owned execution node for the objective. Use /goal --dag <file> for multi-node DAG execution."],
    warnings: [],
  };
}

export function createGoalDagNodesFromObjective(
  goalId: string,
  objective: string,
  options: GoalDagObjectivePlanOptions = {},
): GoalDagPlannedNodesResult {
  const plan = planGoalDagFromObjective(goalId, objective, options);
  return {
    ...plan,
    nodes: createGoalDagNodes(goalId, plan.nodeInputs, options),
  };
}

function buildSingleNodeInput(objective: string, options: GoalDagObjectivePlanOptions): GoalDagPlanNodeInput {
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

function cloneConflictHints(hints: GoalDagConflictHints | undefined): GoalDagConflictHints | undefined {
  if (!hints) return undefined;
  return {
    files: hints.files ? [...hints.files] : undefined,
    modules: hints.modules ? [...hints.modules] : undefined,
    capabilities: hints.capabilities ? [...hints.capabilities] : undefined,
  };
}

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

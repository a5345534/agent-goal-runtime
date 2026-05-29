import { GOAL_STATUSES, type GoalStatus, type GoalStatusInput } from "./types.js";

const STATUS_ALIASES: Record<string, GoalStatus> = {
  active: "active",
  paused: "paused",
  blocked: "blocked",
  usageLimited: "usageLimited",
  usage_limited: "usageLimited",
  budgetLimited: "budgetLimited",
  budget_limited: "budgetLimited",
  complete: "complete",
};

export function normalizeGoalStatus(value: GoalStatusInput | string): GoalStatus {
  const status = STATUS_ALIASES[value];
  if (!status) {
    throw new Error(`unknown goal status: ${value}`);
  }
  return status;
}

export function isGoalStatus(value: string): value is GoalStatus {
  return (GOAL_STATUSES as readonly string[]).includes(value);
}

export function isAutoContinuableStatus(status: GoalStatus): boolean {
  return status === "active";
}

export function isStoppedStatus(status: GoalStatus): boolean {
  return status === "paused" || status === "blocked" || status === "usageLimited" || status === "budgetLimited" || status === "complete";
}

export function toCodexWireStatus(status: GoalStatus): GoalStatus {
  return status;
}

export function fromCodexWireStatus(status: string): GoalStatus {
  return normalizeGoalStatus(status);
}

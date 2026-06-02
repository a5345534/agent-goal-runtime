import test from "node:test";
import assert from "node:assert/strict";
import {
  createGoalDagNodesFromObjective,
  GoalRuntime,
  MemoryGoalStore,
  planGoalDagFromObjective,
} from "../core/index.js";

const now = "2026-06-02T00:00:00.000Z";

test("objective DAG planner creates one execution node for unstructured objectives", () => {
  const plan = createGoalDagNodesFromObjective("goal-1", "Implement the payroll importer", {
    now,
    defaultValidators: ["npm test"],
    defaultExpectedOutputs: ["src/payroll.ts"],
    defaultWorkspaceStrategy: "native-git-worktree",
  });

  assert.equal(plan.nodeInputs.length, 1);
  assert.equal(plan.nodes.length, 1);
  assert.equal(plan.nodes[0]?.nodeId, "implement-the-payroll-importer");
  assert.deepEqual(plan.nodes[0]?.validators, ["npm test"]);
  assert.deepEqual(plan.nodes[0]?.expectedOutputs, ["src/payroll.ts"]);
  assert.equal(plan.nodes[0]?.workspaceStrategy, "native-git-worktree");
  assert.match(plan.rationale[0] ?? "", /one controller-owned execution node/);
});

test("objective DAG planner no longer parses markdown task lists", () => {
  const objective = [
    "Implement goal runtime:",
    "- [id: core-state] Add core state [outputs: src/core/types.ts]",
    "- [id: pi-adapter] Add Pi adapter [after: core-state]",
  ].join("\n");

  const plan = planGoalDagFromObjective("goal-1", objective, { now });

  assert.equal(plan.nodeInputs.length, 1);
  assert.equal(plan.nodeInputs[0]?.objective, objective);
  assert.deepEqual(plan.nodeInputs[0]?.dependencyNodeIds, []);
});

test("runtime persists objective-planned single fallback node", async () => {
  const runtime = new GoalRuntime({ store: new MemoryGoalStore(), config: { now: () => new Date(now) } });
  const plan = await runtime.planGoalDagFromObjective(
    "goal-1",
    ["- Implement core", "- Implement adapter"].join("\n"),
    { now },
  );

  assert.equal(plan.nodes.length, 1);
  assert.deepEqual((await runtime.getGoalDagReadyQueue("goal-1")).ready.map((node) => node.nodeId), [plan.nodes[0]?.nodeId]);
});

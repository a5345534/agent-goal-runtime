import test from "node:test";
import assert from "node:assert/strict";
import {
  assertValidGoalDag,
  createGoalDagNodes,
  getGoalDagReadyQueue,
  GoalRuntime,
  MemoryGoalStore,
  type GoalDagNode,
} from "../core/index.js";

const now = "2026-06-02T00:00:00.000Z";

function node(overrides: Partial<GoalDagNode>): GoalDagNode {
  return {
    goalId: "goal-1",
    nodeId: "base",
    slug: "base",
    objective: "Base node",
    dependencyNodeIds: [],
    expectedOutputs: [],
    validators: [],
    completionGates: ["controller-validation"],
    status: "planned",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("createGoalDagNodes normalizes inputs and rejects invalid DAGs", () => {
  const nodes = createGoalDagNodes(
    "goal-1",
    [
      { objective: "Implement Attendance DocTypes", validators: ["npm test"], conflictHints: { modules: ["attendance"] } },
      { objective: "Implement Attendance Facade", dependencyNodeIds: ["implement-attendance-doctypes"] },
    ],
    { now, defaultWorkspaceStrategy: "native-git-worktree", defaultCompletionGates: ["tests", "controller-review"] },
  );

  assert.deepEqual(nodes.map((item) => item.nodeId), ["implement-attendance-doctypes", "implement-attendance-facade"]);
  assert.equal(nodes[0]?.workspaceStrategy, "native-git-worktree");
  assert.deepEqual(nodes[1]?.completionGates, ["tests", "controller-review"]);

  assert.throws(
    () => createGoalDagNodes("goal-1", [{ nodeId: "a", objective: "A", dependencyNodeIds: ["missing"] }], { now }),
    /depends on missing node/,
  );
  assert.throws(
    () =>
      assertValidGoalDag([
        node({ nodeId: "a", dependencyNodeIds: ["b"] }),
        node({ nodeId: "b", dependencyNodeIds: ["a"] }),
      ]),
    /cycle detected/,
  );
});

test("ready queue respects dependency completion before scheduling downstream nodes", () => {
  const state = {
    goalId: "goal-1",
    subagents: [],
    nodes: [
      node({ nodeId: "a", slug: "a", objective: "A", status: "complete" }),
      node({ nodeId: "b", slug: "b", objective: "B", dependencyNodeIds: ["a"] }),
      node({ nodeId: "c", slug: "c", objective: "C", dependencyNodeIds: ["b"] }),
    ],
  };

  const queue = getGoalDagReadyQueue(state);
  assert.deepEqual(queue.ready.map((item) => item.nodeId), ["b"]);
  assert.deepEqual(queue.blocked.map((item) => [item.node.nodeId, item.reasons]), [["c", ["dependency b is planned"]]]);
});

test("ready queue applies conflict hints and concurrency limits", () => {
  const state = {
    goalId: "goal-1",
    subagents: [],
    nodes: [
      node({ nodeId: "attendance", slug: "attendance", objective: "Attendance", conflictHints: { modules: ["people"] } }),
      node({ nodeId: "payroll", slug: "payroll", objective: "Payroll", conflictHints: { modules: ["people"] } }),
      node({ nodeId: "docs", slug: "docs", objective: "Docs", conflictHints: { modules: ["docs"] } }),
    ],
  };

  const serialized = getGoalDagReadyQueue(state, { maxConcurrentSubagents: 2 });
  assert.deepEqual(serialized.ready.map((item) => item.nodeId), ["attendance", "docs"]);
  assert.equal(serialized.blocked.find((item) => item.node.nodeId === "payroll")?.reasons[0], "conflicts with attendance on modules");

  const nonSerialized = getGoalDagReadyQueue(state, { maxConcurrentSubagents: 2, serializeOnModules: false });
  assert.deepEqual(nonSerialized.ready.map((item) => item.nodeId), ["attendance", "payroll"]);
  assert.equal(nonSerialized.blocked.find((item) => item.node.nodeId === "docs")?.reasons[0], "concurrency capacity exhausted");
});

test("ready queue accounts for already active subagents", () => {
  const state = {
    goalId: "goal-1",
    subagents: [
      {
        goalId: "goal-1",
        nodeId: "running-node",
        subagentId: "subagent-1",
        harnessAdapterId: "test",
        status: "running" as const,
        prompts: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    nodes: [
      node({ nodeId: "running-node", slug: "running-node", objective: "Running", status: "running" }),
      node({ nodeId: "ready-node", slug: "ready-node", objective: "Ready" }),
    ],
  };

  const queue = getGoalDagReadyQueue(state, { maxConcurrentSubagents: 1 });
  assert.deepEqual(queue.running.map((item) => item.nodeId), ["running-node"]);
  assert.deepEqual(queue.ready, []);
  assert.equal(queue.blocked.find((item) => item.node.nodeId === "ready-node")?.reasons[0], "concurrency capacity exhausted");
});

test("runtime can persist a plan and return the computed ready queue", async () => {
  const runtime = new GoalRuntime({ store: new MemoryGoalStore() });
  await runtime.planGoalDag(
    "goal-1",
    [
      { nodeId: "one", objective: "One" },
      { nodeId: "two", objective: "Two", dependencyNodeIds: ["one"] },
    ],
    { now },
  );

  const first = await runtime.getGoalDagReadyQueue("goal-1");
  assert.deepEqual(first.ready.map((item) => item.nodeId), ["one"]);

  const one = await runtime.getGoalDagNode("goal-1", "one");
  assert.ok(one);
  await runtime.saveGoalDagNode({ ...one, status: "complete", updatedAt: "2026-06-02T00:01:00.000Z" });

  const second = await runtime.getGoalDagReadyQueue("goal-1");
  assert.deepEqual(second.ready.map((item) => item.nodeId), ["two"]);
});

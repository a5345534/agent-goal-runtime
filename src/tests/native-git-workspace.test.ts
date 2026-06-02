import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createNativeGitSubagentWorkspaceAllocator,
  findGitRepositoryRoot,
  GoalRuntime,
  MemoryGoalStore,
  NativeGitWorkspaceManager,
  slugForGoal,
  slugForGoalSubagent,
  type HarnessSubagentAdapter,
  type HarnessSubagentStartRequest,
} from "../core/index.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function createRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "goal-native-git-"));
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "goal@example.test"]);
  git(repo, ["config", "user.name", "Goal Test"]);
  writeFileSync(join(repo, "README.md"), "# fixture\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "initial"]);
  return repo;
}

test("native git manager auto-allocates a controller worktree and branch", () => {
  const repo = createRepo();
  try {
    const manager = new NativeGitWorkspaceManager({ defaultBaseRef: "main", fetch: false });
    const allocation = manager.allocateControllerWorkspace({
      invocationCwd: repo,
      goalId: "7dfb3e07-a26a-441f-aa5c-056b486520f7",
      objective: "Finish People Frappe backend",
    });

    assert.equal(allocation.repoRoot, repo);
    assert.equal(allocation.baseRef, "main");
    assert.equal(allocation.allocationReason, "workspace-and-branch-omitted");
    assert.match(allocation.slug, /^7dfb3e07-finish-people-frappe-backend/);
    assert.equal(git(allocation.worktreePath, ["branch", "--show-current"]), allocation.branch);
    assert.equal(git(repo, ["branch", "--show-current"]), "main");

    manager.cleanupWorkspace({ repoRoot: repo, worktreePath: allocation.worktreePath, branch: allocation.branch, force: true });
    assert.equal(existsSync(allocation.worktreePath), false);
    assert.throws(() => git(repo, ["show-ref", "--verify", `refs/heads/${allocation.branch}`]));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("native git manager resolves slug collisions without reusing branches", () => {
  const repo = createRepo();
  try {
    const manager = new NativeGitWorkspaceManager({ defaultBaseRef: "main", fetch: false });
    const request = { invocationCwd: repo, goalId: "goal-12345678", objective: "Add DAG planner" };
    const first = manager.allocateControllerWorkspace(request);
    const second = manager.allocateControllerWorkspace(request);

    assert.notEqual(first.slug, second.slug);
    assert.notEqual(first.branch, second.branch);
    assert.ok(second.slug.endsWith("-2"));
    assert.equal(git(second.worktreePath, ["branch", "--show-current"]), second.branch);

    manager.cleanupWorkspace({ repoRoot: repo, worktreePath: first.worktreePath, branch: first.branch, force: true });
    manager.cleanupWorkspace({ repoRoot: repo, worktreePath: second.worktreePath, branch: second.branch, force: true });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("native git manager allocates subagent worktrees from a controller branch", () => {
  const repo = createRepo();
  try {
    const manager = new NativeGitWorkspaceManager({ defaultBaseRef: "main", fetch: false });
    const controller = manager.allocateControllerWorkspace({
      invocationCwd: repo,
      goalId: "goal-abcdef12",
      objective: "Controller workspace",
    });
    const allocation = manager.allocateSubagentWorkspace({
      invocationCwd: repo,
      controllerWorkspacePath: controller.worktreePath,
      goalId: "goal-abcdef12",
      nodeId: "attendance-doctypes",
      nodeSlug: "attendance-doctypes",
      nodeObjective: "Implement attendance doctypes",
    });

    assert.equal(allocation.repoRoot, repo);
    assert.equal(allocation.baseRef, controller.branch);
    assert.equal(allocation.allocationReason, "subagent-dag-node");
    assert.equal(allocation.nodeId, "attendance-doctypes");
    assert.match(allocation.subagentId, /^subagent-goal-abc-attendance-doctypes/);
    assert.equal(git(allocation.worktreePath, ["branch", "--show-current"]), allocation.branch);
    assert.equal(git(controller.worktreePath, ["branch", "--show-current"]), controller.branch);
    assert.equal(git(repo, ["branch", "--show-current"]), "main");

    manager.cleanupWorkspace({ repoRoot: repo, worktreePath: allocation.worktreePath, branch: allocation.branch, force: true });
    manager.cleanupWorkspace({ repoRoot: repo, worktreePath: controller.worktreePath, branch: controller.branch, force: true });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("native git manager resolves subagent worktree collisions", () => {
  const repo = createRepo();
  try {
    const manager = new NativeGitWorkspaceManager({ defaultBaseRef: "main", fetch: false });
    const request = {
      invocationCwd: repo,
      goalId: "goal-abcdef12",
      nodeId: "attendance-doctypes",
      nodeSlug: "attendance-doctypes",
      nodeObjective: "Implement attendance doctypes",
    };
    const first = manager.allocateSubagentWorkspace(request);
    const second = manager.allocateSubagentWorkspace(request);

    assert.notEqual(first.slug, second.slug);
    assert.notEqual(first.branch, second.branch);
    assert.ok(second.slug.endsWith("-2"));
    assert.ok(second.subagentId.endsWith("-2"));

    manager.cleanupWorkspace({ repoRoot: repo, worktreePath: first.worktreePath, branch: first.branch, force: true });
    manager.cleanupWorkspace({ repoRoot: repo, worktreePath: second.worktreePath, branch: second.branch, force: true });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("native git subagent allocator plugs into controller loop workspace allocation", async () => {
  const repo = createRepo();
  try {
    const manager = new NativeGitWorkspaceManager({ defaultBaseRef: "main", fetch: false });
    const runtime = new GoalRuntime({ store: new MemoryGoalStore(), config: { now: () => new Date("2026-06-02T00:00:00.000Z") } });
    await runtime.planGoalDag("goal-abcdef12", [{ nodeId: "attendance", objective: "Implement attendance" }], {
      now: "2026-06-02T00:00:00.000Z",
    });
    const starts: HarnessSubagentStartRequest[] = [];
    const adapter: HarnessSubagentAdapter = {
      adapterId: "fake",
      startSession(request) {
        starts.push(request);
        return { sessionId: `session-${request.subagentId}`, status: "running", workspacePath: request.cwd, branch: request.branch };
      },
      sendPrompt() {},
      getSessionState() {
        return { status: "running" };
      },
      abortSession() {},
    };

    const tick = await runtime.runGoalControllerTick("goal-abcdef12", {
      adapter,
      workspaceAllocator: createNativeGitSubagentWorkspaceAllocator(manager, { invocationCwd: repo, baseRef: "main" }),
    });

    assert.equal(tick.started.length, 1);
    assert.equal(starts.length, 1);
    assert.ok(starts[0]?.cwd);
    assert.equal(git(starts[0]?.cwd ?? repo, ["branch", "--show-current"]), starts[0]?.branch);
    assert.match(starts[0]?.branch ?? "", /^goal\/goal-abc-implement-attendance/);
    assert.equal((await runtime.getGoalSubagent("goal-abcdef12", tick.started[0]?.subagentId ?? ""))?.workspacePath, starts[0]?.cwd);

    manager.cleanupWorkspace({ repoRoot: repo, worktreePath: starts[0]?.cwd ?? "", branch: starts[0]?.branch, force: true });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("native git manager reports explicit setup errors outside git", () => {
  const dir = mkdtempSync(join(tmpdir(), "goal-no-git-"));
  try {
    const manager = new NativeGitWorkspaceManager({ fetch: false });
    assert.equal(findGitRepositoryRoot(dir), undefined);
    assert.throws(
      () => manager.allocateControllerWorkspace({ invocationCwd: dir, goalId: "goal-1", objective: "Do work" }),
      /not inside a Git repository/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("goal slugs are stable and safe for branch names", () => {
  assert.equal(slugForGoal("abcdef12-3456", "Build controller DAG + subagent registry!"), "abcdef12-build-controller-dag-subagent-registry");
  assert.equal(slugForGoalSubagent("abcdef12-3456", "Implement Attendance DocTypes"), "abcdef12-implement-attendance-doctypes");
  assert.match(slugForGoal("目標", "完成"), /^[a-f0-9-]+$/);
});

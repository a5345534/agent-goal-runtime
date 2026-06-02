import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findGitRepositoryRoot, NativeGitWorkspaceManager, slugForGoal } from "../core/index.js";
function git(cwd, args) {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function createRepo() {
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
    }
    finally {
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
    }
    finally {
        rmSync(repo, { recursive: true, force: true });
    }
});
test("native git manager reports explicit setup errors outside git", () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-no-git-"));
    try {
        const manager = new NativeGitWorkspaceManager({ fetch: false });
        assert.equal(findGitRepositoryRoot(dir), undefined);
        assert.throws(() => manager.allocateControllerWorkspace({ invocationCwd: dir, goalId: "goal-1", objective: "Do work" }), /not inside a Git repository/);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("goal slugs are stable and safe for branch names", () => {
    assert.equal(slugForGoal("abcdef12-3456", "Build controller DAG + subagent registry!"), "abcdef12-build-controller-dag-subagent-registry");
    assert.match(slugForGoal("目標", "完成"), /^[a-f0-9-]+$/);
});
//# sourceMappingURL=native-git-workspace.test.js.map
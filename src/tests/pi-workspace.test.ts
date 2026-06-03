import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  parseGoalWorkspaceFlags,
  resolveWorkspaceBinding,
  validateExecutionWorkspace,
} from "../adapters/pi/workspace.js";

test("parses inline workspace and branch flags", () => {
  const parsed = parseGoalWorkspaceFlags('--workspace ./prepared --branch feat/a implement "the migration"');

  assert.deepEqual(parsed, {
    workspace: "./prepared",
    branch: "feat/a",
    ref: undefined,
    dagFile: undefined,
    modelArg: undefined,
    modelRoutingJson: undefined,
    modelRoutingFile: undefined,
    remainingArgs: "implement the migration",
  });
});

test("parses explicit DAG file flag", () => {
  const parsed = parseGoalWorkspaceFlags("--workspace ./prepared --branch feat/a --dag .goal/backend.dag.json --tokens 500k");

  assert.deepEqual(parsed, {
    workspace: "./prepared",
    branch: "feat/a",
    ref: undefined,
    dagFile: ".goal/backend.dag.json",
    modelArg: undefined,
    modelRoutingJson: undefined,
    modelRoutingFile: undefined,
    remainingArgs: "--tokens 500k",
  });
});

test("parses model and model-routing flags", () => {
  const parsed = parseGoalWorkspaceFlags('--workspace ./repo --model "openai-codex/gpt-5.5" --model-routing-file .goal/model-routing.json implement feature');

  assert.deepEqual(parsed, {
    workspace: "./repo",
    branch: undefined,
    ref: undefined,
    dagFile: undefined,
    modelArg: "openai-codex/gpt-5.5",
    modelRoutingJson: undefined,
    modelRoutingFile: ".goal/model-routing.json",
    remainingArgs: "implement feature",
  });
});

test("parses inline model-routing JSON value", () => {
  const parsed = parseGoalWorkspaceFlags('--workspace ./repo --model-routing "{\\"controllerScenario\\":\\"controller\\"}" run');

  assert.equal(parsed.modelRoutingFile, undefined);
  assert.equal(parsed.modelRoutingJson, '{"controllerScenario":"controller"}');
  assert.equal(parsed.remainingArgs, "run");
});

test("removed orchestration and legacy flags fail explicitly", () => {
  assert.throws(() => parseGoalWorkspaceFlags("--orchestrate implement dag"), /orchestrates by default/);
  assert.throws(() => parseGoalWorkspaceFlags("--legacy-session keep this local"), /was removed/);
});

test("resolves explicit workspace paths without profile lookup", () => {
  const resolved = resolveWorkspaceBinding({ workspace: "migration", branch: "feat/override" }, "/cwd");

  assert.deepEqual(resolved, {
    workspace: "/cwd/migration",
    branch: "feat/override",
    ref: undefined,
  });
});

test("validates non-git workspace without branch", () => {
  const dir = mkdtempSync(join(tmpdir(), "goal-non-git-"));
  try {
    const validation = validateExecutionWorkspace({ workspace: dir });

    assert.equal(validation.ok, true);
    assert.equal(validation.isGit, false);
    assert.equal(validation.branchVerificationStatus, "notApplicable");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects missing workspace without creating it", () => {
  const dir = join(tmpdir(), `goal-missing-${Date.now()}`);

  const validation = validateExecutionWorkspace({ workspace: dir, branch: "feat/a" });

  assert.equal(validation.ok, false);
  assert.equal(validation.workspaceStatus, "missing");
});

test("rejects workspaces outside configured allowed roots", () => {
  const allowed = mkdtempSync(join(tmpdir(), "goal-allowed-"));
  const outside = mkdtempSync(join(tmpdir(), "goal-outside-"));
  const previous = process.env.AGENT_GOAL_ALLOWED_WORKSPACE_ROOTS;
  process.env.AGENT_GOAL_ALLOWED_WORKSPACE_ROOTS = allowed;
  try {
    const validation = validateExecutionWorkspace({ workspace: outside });

    assert.equal(validation.ok, false);
    assert.equal(validation.workspaceStatus, "notAllowed");
  } finally {
    if (previous === undefined) delete process.env.AGENT_GOAL_ALLOWED_WORKSPACE_ROOTS;
    else process.env.AGENT_GOAL_ALLOWED_WORKSPACE_ROOTS = previous;
    rmSync(allowed, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("validates git workspace branch by read-only inspection", () => {
  const dir = mkdtempSync(join(tmpdir(), "goal-git-"));
  try {
    execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
    execFileSync("git", ["checkout", "-b", "feat/a"], { cwd: dir, stdio: "ignore" });

    const ok = validateExecutionWorkspace({ workspace: dir, branch: "feat/a" });
    const mismatch = validateExecutionWorkspace({ workspace: dir, branch: "feat/b" });

    assert.equal(ok.ok, true);
    assert.equal(ok.branchVerificationStatus, "verified");
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.branchVerificationStatus, "mismatch");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

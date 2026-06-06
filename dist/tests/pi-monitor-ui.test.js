import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GoalMonitorController, readGoalTranscript, readGoalTranscriptLines } from "../adapters/pi/monitor-ui.js";
function summary(status = "active", sessionFile) {
    return {
        sessionKey: "s1",
        goalId: "abcdef123456",
        shortGoalId: "abcdef12",
        objective: "monitor goal",
        objectiveSummary: "monitor goal",
        status,
        activityState: status === "active" ? "idle-eligible" : status,
        tokensUsed: 1,
        timeUsedSeconds: 2,
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
        lastActivityAt: "2026-05-31T00:00:00.000Z",
        executionWorkspace: "/workspace",
        workspaceStatus: "configured",
        branch: "feat/a",
        branchVerificationStatus: "verified",
        sessionFile,
        controllerModelScenario: "controller",
        controllerModelArg: "openai-codex/gpt-5.5",
    };
}
test("goal monitor escape closes without lifecycle action", () => {
    const controller = new GoalMonitorController(summary());
    assert.deepEqual(controller.handleInput("\x1b"), { kind: "close" });
});
test("goal monitor exposes state-appropriate lifecycle actions", () => {
    const active = new GoalMonitorController(summary("active"));
    const paused = new GoalMonitorController(summary("paused"));
    assert.deepEqual(active.actions, ["pause", "resume", "clear", "close"]);
    assert.deepEqual(paused.actions, ["resume", "clear", "close"]);
    assert.deepEqual(active.handleInput("\r"), { kind: "action", action: "pause" });
});
test("goal monitor lifecycle actions remain available from live focus", () => {
    const now = new Date("2026-05-31T00:05:00.000Z");
    const nodes = [{
            goalId: "abcdef123456",
            nodeId: "build-node",
            slug: "build-node",
            objective: "Build node",
            dependencyNodeIds: [],
            expectedOutputs: [],
            validators: [],
            completionGates: ["controller-validation"],
            status: "planned",
            createdAt: "2026-05-31T00:00:00.000Z",
            updatedAt: "2026-05-31T00:00:00.000Z",
        }];
    const controller = new GoalMonitorController(summary("active"), () => ({ lines: ["tail"], entryCount: 1, messageCount: 1 }), () => ({ nodes, subagents: [], refreshedAt: now.toISOString() }), () => now);
    controller.render(120, { fg: (_color, text) => text, bold: (text) => text });
    controller.handleInput("v");
    assert.deepEqual(controller.handleInput("\r"), { kind: "action", action: "pause" });
});
test("goal monitor reads transcript lines without mutating session file", () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-monitor-"));
    const sessionFile = join(dir, "session.jsonl");
    try {
        writeFileSync(sessionFile, [
            JSON.stringify({ type: "session", id: "s", cwd: dir, timestamp: "2026-05-31T00:00:00.000Z" }),
            JSON.stringify({ type: "message", message: { role: "user", content: "hello" } }),
            JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "done" }] } }),
        ].join("\n"));
        assert.deepEqual(readGoalTranscriptLines(sessionFile), [
            `[05-31T00:00:00Z] session start cwd=${dir}`,
            "user: hello",
            "assistant: done",
        ]);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("goal monitor transcript includes custom messages, tool calls, and session metadata", () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-monitor-full-"));
    const sessionFile = join(dir, "session.jsonl");
    try {
        writeFileSync(sessionFile, [
            JSON.stringify({ type: "session_info", name: "goal abcdef12", timestamp: "2026-05-31T00:00:01.000Z" }),
            JSON.stringify({ type: "custom_message", customType: "agent-goal-runtime", content: "hidden steering", timestamp: "2026-05-31T00:00:02.000Z" }),
            JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "read", arguments: { path: "README.md" } }] }, timestamp: "2026-05-31T00:00:03.000Z" }),
            JSON.stringify({ type: "compaction", summary: "compacted", timestamp: "2026-05-31T00:00:04.000Z" }),
        ].join("\n"));
        const snapshot = readGoalTranscript(sessionFile);
        assert.equal(snapshot.entryCount, 4);
        assert.equal(snapshot.messageCount, 2);
        assert.deepEqual(snapshot.lines, [
            "[05-31T00:00:01Z] session name: goal abcdef12",
            "[05-31T00:00:02Z] custom:agent-goal-runtime: hidden steering",
            '[05-31T00:00:03Z] assistant: [tool call] read {"path":"README.md"}',
            "[05-31T00:00:04Z] compaction: compacted",
        ]);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("goal monitor renders controller live output plus a selectable node list", () => {
    const now = new Date("2026-05-31T00:05:00.000Z");
    const nodes = [
        {
            goalId: "abcdef123456",
            nodeId: "people-frappe-attendance-doctypes-long-node-id",
            slug: "people-frappe-attendance-doctypes",
            objective: "Implement attendance DocTypes",
            dependencyNodeIds: [],
            expectedOutputs: [],
            validators: [],
            completionGates: ["controller-validation"],
            status: "running",
            modelScenario: "implementation-heavy",
            modelArg: "local-aeon/aeon",
            createdAt: "2026-05-31T00:00:00.000Z",
            updatedAt: "2026-05-31T00:04:00.000Z",
        },
    ];
    const subagents = [
        {
            goalId: "abcdef123456",
            nodeId: nodes[0].nodeId,
            subagentId: "subagent-abcdef12-attendance",
            harnessAdapterId: "pi",
            sessionFile: "/sessions/subagent.jsonl",
            workspacePath: "/home/shawn/projects/repo/.worktrees/attendance",
            branch: "goal/attendance",
            status: "running",
            prompts: ["initial"],
            integrationStatus: "working",
            createdAt: "2026-05-31T00:01:00.000Z",
            updatedAt: "2026-05-31T00:04:30.000Z",
            lastActivityAt: "2026-05-31T00:04:30.000Z",
        },
    ];
    const controller = new GoalMonitorController(summary("active"), () => ({ lines: ["controller-tail"], entryCount: 1, messageCount: 1 }), () => ({ nodes, subagents, refreshedAt: now.toISOString() }), () => now);
    const theme = { fg: (_color, text) => text, bold: (text) => text };
    const rendered = controller.render(140, theme).join("\n");
    assert.match(rendered, /scope=goal focus=list/);
    assert.match(rendered, /DAG nodes=1 \(running=1\) subagents=1 \(running=1\)/);
    assert.match(rendered, /controllerModel=controller -> openai-codex\/gpt-5\.5/);
    assert.match(rendered, /LIVE: Controller execution \(1 entries \/ 1 messages\)/);
    assert.match(rendered, /controller-tail/);
    assert.match(rendered, /LIST: Nodes 1\/1/);
    assert.match(rendered, /> 1\. \[running\] people-frappe-attendance-doctypes runners=1 latest=running updated=1m ago model=implementation-heavy -> local-aeon\/aeon/);
});
test("goal monitor drills from a node row into node live and runner list", () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-monitor-node-drill-"));
    const sessionFile = join(dir, "runner.jsonl");
    const now = new Date("2026-05-31T00:05:00.000Z");
    try {
        writeFileSync(sessionFile, JSON.stringify({ type: "message", message: { role: "assistant", content: "runner live tail" }, timestamp: "2026-05-31T00:04:30.000Z" }));
        const nodes = [{
                goalId: "abcdef123456",
                nodeId: "build-node",
                slug: "build-node",
                objective: "Build node",
                dependencyNodeIds: [],
                expectedOutputs: ["src/output.ts"],
                validators: ["npm test"],
                completionGates: ["controller-validation"],
                status: "controllerValidating",
                lastValidationSummary: "validating output",
                createdAt: "2026-05-31T00:00:00.000Z",
                updatedAt: "2026-05-31T00:04:00.000Z",
            }];
        const subagents = [{
                goalId: "abcdef123456",
                nodeId: "build-node",
                subagentId: "subagent-build-node-1",
                harnessAdapterId: "pi",
                sessionFile,
                workspacePath: "/repo/.worktrees/build-node",
                branch: "goal/build-node",
                status: "controllerValidating",
                prompts: ["initial"],
                createdAt: "2026-05-31T00:01:00.000Z",
                updatedAt: "2026-05-31T00:04:30.000Z",
                lastActivityAt: "2026-05-31T00:04:30.000Z",
            }];
        const controller = new GoalMonitorController(summary("active"), () => ({ lines: ["controller-tail"], entryCount: 1, messageCount: 1 }), () => ({ nodes, subagents, refreshedAt: now.toISOString() }), () => now);
        const theme = { fg: (_color, text) => text, bold: (text) => text };
        controller.render(140, theme);
        controller.handleInput("\r");
        const rendered = controller.render(140, theme).join("\n");
        assert.match(rendered, /scope=node\/build-node focus=list/);
        assert.match(rendered, /LIVE: Node build-node • latest subagent-build-node-1/);
        assert.match(rendered, /node: \[controllerValidating\] build-node/);
        assert.match(rendered, /expected outputs: src\/output\.ts/);
        assert.match(rendered, /validators: npm test/);
        assert.match(rendered, /runner live tail/);
        assert.match(rendered, /LIST: Runners for build-node 1\/1/);
        assert.match(rendered, /> 1\. \[controllerValidating\] subagent-build-node-1/);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("goal monitor drills from a runner row into runner live while keeping sibling runner list", () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-monitor-runner-drill-"));
    const sessionFile = join(dir, "runner.jsonl");
    const now = new Date("2026-05-31T00:05:00.000Z");
    try {
        writeFileSync(sessionFile, JSON.stringify({ type: "message", message: { role: "assistant", content: "runner detail transcript" }, timestamp: "2026-05-31T00:04:30.000Z" }));
        const nodes = [{
                goalId: "abcdef123456",
                nodeId: "build-node",
                slug: "build-node",
                objective: "Build node",
                dependencyNodeIds: [],
                expectedOutputs: [],
                validators: [],
                completionGates: ["controller-validation"],
                status: "running",
                createdAt: "2026-05-31T00:00:00.000Z",
                updatedAt: "2026-05-31T00:04:00.000Z",
            }];
        const subagents = [{
                goalId: "abcdef123456",
                nodeId: "build-node",
                subagentId: "subagent-build-node-1",
                harnessAdapterId: "pi",
                sessionFile,
                workspacePath: "/repo/.worktrees/build-node",
                branch: "goal/build-node",
                status: "running",
                prompts: ["initial"],
                integrationStatus: "working",
                createdAt: "2026-05-31T00:01:00.000Z",
                updatedAt: "2026-05-31T00:04:30.000Z",
                lastActivityAt: "2026-05-31T00:04:30.000Z",
            }];
        const controller = new GoalMonitorController(summary("active"), () => ({ lines: ["controller-tail"], entryCount: 1, messageCount: 1 }), () => ({ nodes, subagents, refreshedAt: now.toISOString() }), () => now);
        const theme = { fg: (_color, text) => text, bold: (text) => text };
        controller.render(140, theme);
        controller.handleInput("\r"); // node
        controller.render(140, theme);
        controller.handleInput("\r"); // runner
        const rendered = controller.render(140, theme).join("\n");
        assert.match(rendered, /scope=runner\/subagent-build-node-1 focus=list/);
        assert.match(rendered, /LIVE: Runner subagent-build-node-1/);
        assert.match(rendered, /runner: \[running\] subagent-build-node-1/);
        assert.match(rendered, /branch: goal\/build-node/);
        assert.match(rendered, /workspace: \/repo\/\.worktrees\/build-node/);
        assert.match(rendered, /note: working/);
        assert.match(rendered, /runner detail transcript/);
        assert.match(rendered, /LIST: Sibling runners for build-node 1\/1/);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("goal monitor back navigation returns runner to node to goal scopes", () => {
    const now = new Date("2026-05-31T00:05:00.000Z");
    const nodes = [{
            goalId: "abcdef123456",
            nodeId: "build-node",
            slug: "build-node",
            objective: "Build node",
            dependencyNodeIds: [],
            expectedOutputs: [],
            validators: [],
            completionGates: ["controller-validation"],
            status: "running",
            createdAt: "2026-05-31T00:00:00.000Z",
            updatedAt: "2026-05-31T00:04:00.000Z",
        }];
    const subagents = [{
            goalId: "abcdef123456",
            nodeId: "build-node",
            subagentId: "subagent-build-node-1",
            harnessAdapterId: "pi",
            status: "running",
            prompts: ["initial"],
            createdAt: "2026-05-31T00:01:00.000Z",
            updatedAt: "2026-05-31T00:04:30.000Z",
            lastActivityAt: "2026-05-31T00:04:30.000Z",
        }];
    const controller = new GoalMonitorController(summary("active"), () => ({ lines: ["controller-tail"], entryCount: 1, messageCount: 1 }), () => ({ nodes, subagents, refreshedAt: now.toISOString() }), () => now);
    const theme = { fg: (_color, text) => text, bold: (text) => text };
    controller.render(140, theme);
    controller.handleInput("\r");
    controller.render(140, theme);
    controller.handleInput("\r");
    assert.match(controller.render(140, theme).join("\n"), /scope=runner\/subagent-build-node-1/);
    controller.handleInput("b");
    assert.match(controller.render(140, theme).join("\n"), /scope=node\/build-node/);
    controller.handleInput("\x7f");
    assert.match(controller.render(140, theme).join("\n"), /scope=goal/);
});
test("goal monitor scrolls overflowing node list", () => {
    const now = new Date("2026-05-31T00:05:00.000Z");
    const nodes = Array.from({ length: 20 }, (_, index) => ({
        goalId: "abcdef123456",
        nodeId: `dag-node-${String(index + 1).padStart(2, "0")}`,
        slug: `dag-node-${String(index + 1).padStart(2, "0")}`,
        objective: `Do DAG node ${index + 1}`,
        dependencyNodeIds: [],
        expectedOutputs: [],
        validators: [],
        completionGates: ["controller-validation"],
        status: "planned",
        createdAt: "2026-05-31T00:00:00.000Z",
        updatedAt: "2026-05-31T00:00:00.000Z",
    }));
    const controller = new GoalMonitorController(summary("active"), () => ({ lines: ["tail"], entryCount: 1, messageCount: 1 }), () => ({ nodes, subagents: [], refreshedAt: now.toISOString() }), () => now);
    const theme = { fg: (_color, text) => text, bold: (text) => text };
    const firstPage = controller.render(140, theme).join("\n");
    assert.match(firstPage, /focus=list/);
    assert.match(firstPage, /Rows: 1-14\/20 selected=1 • active • 6 more rows/);
    assert.doesNotMatch(firstPage, /dag-node-20/);
    controller.handleInput("\x1b[6~"); // PageDown moves selection through the node list.
    const secondPage = controller.render(140, theme).join("\n");
    assert.match(secondPage, /dag-node-14/);
    assert.match(secondPage, /Rows: 1-14\/20 selected=14 • active • 6 more rows/);
});
test("goal monitor live scroll remains available after switching panes", () => {
    const lines = Array.from({ length: 25 }, (_, index) => `transcript-${String(index + 1).padStart(2, "0")}`);
    const controller = new GoalMonitorController(summary("active"), () => ({ lines, entryCount: lines.length, messageCount: lines.length }));
    const theme = { fg: (_color, text) => text, bold: (text) => text };
    const initial = controller.render(120, theme).join("\n");
    assert.match(initial, /focus=list/);
    assert.match(initial, /transcript-25/);
    controller.handleInput("v");
    controller.handleInput("\x1b[H"); // Home scrolls the live pane after focus switch.
    const top = controller.render(120, theme).join("\n");
    assert.match(top, /focus=live/);
    assert.match(top, /transcript-01/);
    assert.doesNotMatch(top, /transcript-25/);
    assert.match(top, /Live lines: 1-18\/25 • active • 7 more live lines/);
    controller.handleInput("\x1b[F"); // End restores live tail.
    const tail = controller.render(120, theme).join("\n");
    assert.match(tail, /transcript-25/);
    assert.match(tail, /Live lines: 8-25\/25 • active • live • 7 previous live lines/);
});
test("goal monitor render auto-follows live transcript tail", () => {
    let lines = ["one"];
    const controller = new GoalMonitorController(summary("active"), () => ({ lines, entryCount: lines.length, messageCount: lines.length }));
    const theme = { fg: (_color, text) => text, bold: (text) => text };
    assert.ok(controller.render(120, theme).some((line) => line.includes("one")));
    lines = ["one", "two"];
    assert.ok(controller.render(120, theme).some((line) => line.includes("two")));
});
//# sourceMappingURL=pi-monitor-ui.test.js.map
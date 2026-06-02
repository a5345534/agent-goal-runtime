import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import goalPiExtension, { setPiBackgroundGoalSessionLauncherForTests } from "../adapters/pi/index.js";
test("Pi adapter keeps model-visible goal tools Codex-compatible", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-tools-"));
    const previousStateHome = process.env.AGENT_GOAL_STATE_HOME;
    process.env.AGENT_GOAL_STATE_HOME = dir;
    const tools = [];
    const handlers = new Map();
    const pi = {
        registerTool(tool) {
            tools.push(tool);
        },
        registerCommand() { },
        on(event, handler) {
            const list = handlers.get(event) ?? [];
            list.push(handler);
            handlers.set(event, list);
        },
        appendEntry() { },
        sendMessage() { },
    };
    try {
        goalPiExtension(pi);
        assert.deepEqual(tools.map((tool) => tool.name).sort(), ["create_goal", "get_goal", "update_goal"]);
        for (const handler of handlers.get("session_shutdown") ?? [])
            await handler();
    }
    finally {
        if (previousStateHome === undefined)
            delete process.env.AGENT_GOAL_STATE_HOME;
        else
            process.env.AGENT_GOAL_STATE_HOME = previousStateHome;
        rmSync(dir, { recursive: true, force: true });
    }
});
test("Pi goal-owned session creation launches in background without replacing controller session", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goal-session-context-"));
    const workspace = mkdtempSync(join(tmpdir(), "goal-workspace-"));
    const previousStateHome = process.env.AGENT_GOAL_STATE_HOME;
    process.env.AGENT_GOAL_STATE_HOME = dir;
    const goalSessionFile = join(dir, "goal-session.jsonl");
    let commandHandler;
    const handlers = new Map();
    const prompts = [];
    const sentMessages = [];
    const stopped = [];
    const launched = [];
    setPiBackgroundGoalSessionLauncherForTests(async (request) => {
        launched.push(request);
        return {
            sessionFile: goalSessionFile,
            sessionId: request.sessionId ?? "resumed-session",
            setSessionName: async () => undefined,
            sendPrompt: async (prompt) => {
                prompts.push(prompt);
            },
            stop: () => stopped.push(request.sessionId ?? "resumed-session"),
        };
    });
    const pi = {
        registerTool() { },
        registerCommand(_name, options) {
            commandHandler = options.handler;
        },
        on(event, handler) {
            const list = handlers.get(event) ?? [];
            list.push(handler);
            handlers.set(event, list);
        },
        appendEntry() { },
        sendMessage(message) {
            sentMessages.push(message);
        },
    };
    const notifications = [];
    const controllerCtx = {
        hasUI: true,
        cwd: workspace,
        model: { provider: "test", id: "model" },
        ui: {
            notify(message) {
                notifications.push(message);
            },
            setStatus() { },
            setWidget() { },
            confirm: async () => true,
            editor: async () => undefined,
            select: async () => undefined,
            custom: async () => undefined,
        },
        sessionManager: {
            getSessionFile: () => "/controller/session.jsonl",
            getSessionName: () => "controller",
        },
        isIdle: () => true,
        hasPendingMessages: () => false,
        newSession: async () => {
            throw new Error("newSession should not be used for background goals");
        },
        switchSession: async () => {
            throw new Error("switchSession should not be used for background goal lifecycle commands");
        },
    };
    try {
        goalPiExtension(pi);
        assert.ok(commandHandler);
        await commandHandler?.(`--workspace ${workspace} write a small story`, controllerCtx);
        assert.equal(launched.length, 1);
        assert.equal(launched[0]?.cwd, workspace);
        assert.equal(launched[0]?.modelArg, "test/model");
        assert.equal(prompts.length, 1);
        assert.match(prompts[0] ?? "", /Execution workspace binding/);
        const shortId = notifications.at(-1)?.match(/\(([0-9a-f]{8})\)/)?.[1];
        assert.match(notifications.at(-1) ?? "", /background session started/);
        assert.ok(shortId);
        writeFileSync(goalSessionFile, [
            JSON.stringify({ type: "session", id: "s", cwd: workspace, timestamp: "2026-06-01T00:00:00.000Z" }),
            JSON.stringify({ type: "message", message: { role: "user", content: "start goal" }, timestamp: "2026-06-01T00:00:01.000Z" }),
            JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "history line" }] }, timestamp: "2026-06-01T00:00:02.000Z" }),
        ].join("\n"));
        await commandHandler?.(`history ${shortId}`, controllerCtx);
        const historyMessage = sentMessages.find((message) => message.details?.kind === "goal_history");
        assert.ok(historyMessage);
        assert.equal(historyMessage.customType, "agent-goal-runtime");
        assert.match(historyMessage.content ?? "", /history line/);
        await commandHandler?.(`pause ${shortId}`, controllerCtx);
        await commandHandler?.(`resume ${shortId}`, controllerCtx);
        assert.equal(launched.length, 2);
        assert.equal(launched[1]?.sessionFile, goalSessionFile);
        assert.equal(prompts.length, 2);
        assert.match(prompts[1] ?? "", /Resume working toward the active goal/);
        for (const handler of handlers.get("session_shutdown") ?? [])
            await handler({ type: "session_shutdown", reason: "quit" });
        assert.deepEqual(stopped, []);
    }
    finally {
        setPiBackgroundGoalSessionLauncherForTests();
        if (previousStateHome === undefined)
            delete process.env.AGENT_GOAL_STATE_HOME;
        else
            process.env.AGENT_GOAL_STATE_HOME = previousStateHome;
        rmSync(dir, { recursive: true, force: true });
        rmSync(workspace, { recursive: true, force: true });
    }
});
//# sourceMappingURL=pi-adapter-tools.test.js.map
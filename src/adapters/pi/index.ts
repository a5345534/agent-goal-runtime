import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { GoalRuntime, SQLiteGoalStore, type GoalRecord, type HiddenGoalTurnRequest } from "../../core/index.js";

const EXTENSION_MESSAGE_TYPE = "agent-goal-runtime";
const HIDDEN_CONTEXT_KIND = "goal_continuation";

export default function goalPiExtension(pi: ExtensionAPI) {
  const store = new SQLiteGoalStore();
  let lastCtx: ExtensionContext | ExtensionCommandContext | undefined;
  const startedAttempts = new Map<string, string | undefined>();

  const runtime = new GoalRuntime({
    store,
    callbacks: {
      readHarnessState: async (sessionKey) => {
        const ctx = requireContext(lastCtx);
        return {
          materialized: Boolean(resolveSessionKey(ctx)),
          activeTurnId: ctx.isIdle?.() === false ? "pi-active-turn" : undefined,
          queuedUserInput: Boolean(ctx.hasPendingMessages?.()),
          queuedTriggerTurn: false,
          continuationSuppressed: false,
        };
      },
      startHiddenGoalTurn: async (request) => startHiddenGoalTurn(pi, requireContext(lastCtx), request, startedAttempts),
      injectSteeringContext: async (request) => {
        pi.sendMessage(
          {
            customType: EXTENSION_MESSAGE_TYPE,
            content: request.renderedPrompt,
            display: false,
            details: { kind: request.kind, sessionKey: request.sessionKey, goalId: request.goalId },
          },
          { deliverAs: "steer" },
        );
      },
      notifyGoalUpdated: async (goal) => showGoalStatus(requireContext(lastCtx), goal),
      notifyGoalCleared: async () => {
        const ctx = requireContext(lastCtx);
        ctx.ui?.setStatus?.("goal", undefined);
        ctx.ui?.setWidget?.("goal", undefined);
        ctx.ui?.notify?.("Goal cleared", "info");
      },
      notifyGoalWarning: async (_sessionKey, message) => requireContext(lastCtx).ui?.notify?.(message, "warning"),
    },
  });

  pi.registerCommand("goal", {
    description: "Codex-compatible persistent goal: /goal, /goal <objective>, /goal edit|pause|resume|clear",
    getArgumentCompletions: (prefix: string) => {
      const commands = ["edit", "pause", "resume", "clear"];
      const matches = commands.filter((command) => command.startsWith(prefix));
      return matches.length ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      lastCtx = ctx;
      const sessionKey = resolveSessionKey(ctx);
      const trimmed = args.trim();
      try {
        if (trimmed === "edit") {
          const current = await runtime.getGoal(sessionKey);
          if (!current.goal) {
            ctx.ui.notify("No current goal to edit", "warning");
            return;
          }
          const nextObjective = await ctx.ui.editor("Edit /goal objective", current.goal.objective);
          if (nextObjective === undefined) return;
          const result = await runtime.executeCommand(sessionKey, "edit", { editObjective: nextObjective });
          ctx.ui.notify(result.message, "info");
          return;
        }

        if (trimmed && !["pause", "resume", "clear"].includes(trimmed)) {
          const existing = await runtime.getGoal(sessionKey);
          if (existing.goal) {
            const ok = await ctx.ui.confirm("Replace current goal?", `${existing.goal.objective}\n\nNew goal:\n${trimmed}`);
            if (!ok) {
              ctx.ui.notify("Goal unchanged", "info");
              return;
            }
          }
        }

        const result = await runtime.executeCommand(sessionKey, trimmed, { confirmReplace: true });
        if (result.goal) showGoalDetails(ctx, result.goal);
        else ctx.ui.notify(result.message, "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerTool({
    name: "get_goal",
    label: "Get Goal",
    description: "Get the current goal for this Pi session, including status, budget, usage, and elapsed time.",
    parameters: Type.Object({}),
    promptSnippet: "get_goal returns the current /goal objective and status.",
    promptGuidelines: ["Use get_goal when you need to inspect the active /goal state before deciding whether to continue, complete, or block it."],
    async execute(_toolCallId: string, _params: unknown, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: ExtensionContext) {
      lastCtx = ctx;
      const result = await runtime.toolGetGoal(resolveSessionKey(ctx));
      return { content: [{ type: "text", text: result.message }], details: result.goal ?? null };
    },
  });

  pi.registerTool({
    name: "create_goal",
    label: "Create Goal",
    description:
      "Create a goal only when explicitly requested by the user/system/developer context and no goal currently exists. Do not infer goals from ordinary tasks.",
    parameters: Type.Object({
      objective: Type.String({ description: "Concrete objective to pursue." }),
      token_budget: Type.Optional(Type.Number({ description: "Optional positive token budget." })),
    }),
    promptSnippet: "create_goal creates a new active /goal only on explicit request and only if none exists.",
    promptGuidelines: ["Use create_goal only when the user/system/developer context explicitly asks to start a /goal; do not infer goals from ordinary tasks."],
    async execute(_toolCallId: string, params: { objective: string; token_budget?: number }, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: ExtensionContext) {
      lastCtx = ctx;
      const result = await runtime.toolCreateGoal(resolveSessionKey(ctx), params.objective, params.token_budget);
      return { content: [{ type: "text", text: result.message }], details: result.goal ?? null };
    },
  });

  pi.registerTool({
    name: "update_goal",
    label: "Update Goal",
    description:
      "Update the existing goal. Use complete only when the full objective is achieved and verified. Use blocked only when the same blocking condition has repeated for at least three consecutive goal turns and meaningful progress is impossible without user input or external state change.",
    parameters: Type.Object({
      status: StringEnum(["complete", "blocked"] as const),
    }),
    promptSnippet: "update_goal can mark the active /goal complete or strictly blocked.",
    promptGuidelines: [
      "Use update_goal with status complete only when the full /goal objective is achieved and verified.",
      "Use update_goal with status blocked only after the same blocker recurs for at least three consecutive goal turns; do not use it for ordinary difficulty or a first failure.",
    ],
    async execute(_toolCallId: string, params: { status: "complete" | "blocked" }, _signal: AbortSignal | undefined, _onUpdate: unknown, ctx: ExtensionContext) {
      lastCtx = ctx;
      const result = await runtime.toolUpdateGoal(resolveSessionKey(ctx), params.status);
      return { content: [{ type: "text", text: result.message }], details: result.goal ?? null };
    },
  });

  pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
    lastCtx = ctx;
    const sessionKey = resolveSessionKey(ctx);
    await runtime.sessionResumed(sessionKey);
    const result = await runtime.getGoal(sessionKey);
    if (result.goal) showGoalStatus(ctx, result.goal);
  });

  pi.on("turn_start", async (event: { turnIndex?: number; timestamp?: number }, ctx: ExtensionContext) => {
    lastCtx = ctx;
    await runtime.turnStarted({
      sessionKey: resolveSessionKey(ctx),
      turnId: event.turnIndex === undefined ? undefined : `pi-turn-${event.turnIndex}`,
      tokenUsage: readTokenUsage(ctx),
      now: event.timestamp ? new Date(event.timestamp) : undefined,
    });
  });

  pi.on("tool_execution_end", async (event: { toolName?: string }, ctx: ExtensionContext) => {
    lastCtx = ctx;
    await runtime.toolCompleted({ sessionKey: resolveSessionKey(ctx), tokenUsage: readTokenUsage(ctx) });
    if (event.toolName === "get_goal" || event.toolName === "create_goal" || event.toolName === "update_goal") {
      // Goal tool handlers already performed semantic state transitions; this hook keeps accounting fresh.
    }
  });

  pi.on("turn_end", async (_event: unknown, ctx: ExtensionContext) => {
    lastCtx = ctx;
    await runtime.turnFinished({ sessionKey: resolveSessionKey(ctx), tokenUsage: readTokenUsage(ctx) }, true);
  });

  pi.on("session_shutdown", async () => {
    await store.close?.();
  });
}

function resolveSessionKey(ctx: ExtensionContext | ExtensionCommandContext): string {
  const sessionFile = ctx.sessionManager?.getSessionFile?.();
  const cwd = ctx.cwd ?? process.cwd();
  return sessionFile ? `pi:${sessionFile}` : `pi:${cwd}:ephemeral`;
}

function requireContext<T extends ExtensionContext | ExtensionCommandContext>(ctx: T | undefined): T {
  if (!ctx) throw new Error("Pi goal adapter has not received a context yet");
  return ctx;
}

function readTokenUsage(ctx: ExtensionContext): { totalTokens?: number } | undefined {
  const usage = ctx.getContextUsage?.();
  return usage?.tokens === undefined ? undefined : { totalTokens: usage.tokens };
}

async function startHiddenGoalTurn(
  pi: ExtensionAPI,
  ctx: ExtensionContext | ExtensionCommandContext,
  request: HiddenGoalTurnRequest,
  startedAttempts: Map<string, string | undefined>,
) {
  if (startedAttempts.has(request.attemptId)) {
    return { kind: "alreadyStarted" as const, hostTurnId: startedAttempts.get(request.attemptId) };
  }
  if (ctx.isIdle?.() === false) return { kind: "skipped" as const, reason: "active turn is running" };
  if (ctx.hasPendingMessages?.()) return { kind: "skipped" as const, reason: "user input is queued" };

  try {
    const hostTurnId = `pi-hidden-${request.attemptId}`;
    pi.sendMessage(
      {
        customType: EXTENSION_MESSAGE_TYPE,
        content: request.renderedPrompt,
        display: false,
        details: {
          kind: HIDDEN_CONTEXT_KIND,
          attemptId: request.attemptId,
          sessionKey: request.sessionKey,
          goalId: request.goalId,
          goalUpdatedAt: request.goalUpdatedAt,
        },
      },
      { triggerTurn: true, deliverAs: "followUp" },
    );
    startedAttempts.set(request.attemptId, hostTurnId);
    ctx.ui?.setStatus?.("goal", "goal: continuing");
    return { kind: "started" as const, hostTurnId };
  } catch (error) {
    return { kind: "retryableFailure" as const, error: error instanceof Error ? error.message : String(error) };
  }
}

function showGoalStatus(ctx: ExtensionContext | ExtensionCommandContext, goal: GoalRecord): void {
  ctx.ui?.setStatus?.("goal", `goal: ${goal.status}`);
  ctx.ui?.setWidget?.("goal", [`/goal ${goal.status}: ${goal.objective}`], { placement: "belowEditor" });
}

function showGoalDetails(ctx: ExtensionContext | ExtensionCommandContext, goal: GoalRecord): void {
  showGoalStatus(ctx, goal);
  const budget = goal.tokenBudget === undefined ? "none" : String(goal.tokenBudget);
  ctx.ui?.notify?.(`Goal ${goal.status}\n${goal.objective}\nTokens: ${goal.tokensUsed}/${budget}`, "info");
}

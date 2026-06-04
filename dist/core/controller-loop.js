const SYNCABLE_SUBAGENT_STATUSES = new Set(["sessionStarted", "running", "idle"]);
const NON_TERMINAL_SUBAGENT_STATUSES = new Set([
    "planned",
    "workspaceCreated",
    "sessionStarted",
    "running",
    "idle",
    "selfReportedComplete",
    "controllerValidating",
    "needsFollowup",
]);
export async function runGoalControllerTick(runtime, goalId, options) {
    const tickStartedAt = toIso(resolveNow(options.now));
    const result = {
        goalId,
        started: [],
        synced: [],
        validating: [],
        completed: [],
        followups: [],
        blocked: [],
        failed: [],
        ready: [],
        queueBlocked: [],
        changed: false,
    };
    const initialState = await runtime.getGoalOrchestrationState(goalId);
    await syncSubagents(runtime, options.adapter, initialState, result);
    await reconcileSubagentOutcomes(runtime, goalId, options, result, tickStartedAt);
    await startReadyNodes(runtime, goalId, options, result, tickStartedAt);
    result.changed =
        result.started.length > 0 ||
            result.synced.length > 0 ||
            result.validating.length > 0 ||
            result.completed.length > 0 ||
            result.followups.length > 0 ||
            result.blocked.length > 0 ||
            result.failed.length > 0;
    return result;
}
export async function runGoalControllerLoop(runtime, goalId, options) {
    const maxTicks = options.maxTicks ?? 1;
    const intervalMs = options.intervalMs ?? 1_000;
    const stopWhenIdle = options.stopWhenIdle ?? true;
    const ticks = [];
    for (let index = 0; index < maxTicks; index += 1) {
        if (options.signal?.aborted)
            break;
        const tick = await runGoalControllerTick(runtime, goalId, options);
        ticks.push(tick);
        if (stopWhenIdle && !tick.changed && tick.ready.length === 0)
            break;
        if (index < maxTicks - 1)
            await sleep(intervalMs, options.signal);
    }
    return { goalId, ticks };
}
async function syncSubagents(runtime, adapter, state, result) {
    for (const subagent of state.subagents) {
        if (subagent.harnessAdapterId !== adapter.adapterId)
            continue;
        if (!SYNCABLE_SUBAGENT_STATUSES.has(subagent.status))
            continue;
        try {
            const updated = await runtime.syncGoalSubagent(adapter, subagent);
            if (subagentChanged(subagent, updated))
                result.synced.push(updated);
        }
        catch (error) {
            if (isTransientStoreLockError(error))
                continue;
            const failed = withSubagentPatch(subagent, {
                status: "failed",
                integrationStatus: error instanceof Error ? error.message : String(error),
            });
            await runtime.saveGoalSubagent(failed);
            const node = state.nodes.find((item) => item.nodeId === subagent.nodeId);
            if (node) {
                const failedNode = withNodePatch(node, { status: "failed", lastValidationSummary: failed.integrationStatus });
                await runtime.saveGoalDagNode(failedNode);
                result.failed.push(failedNode);
            }
            result.synced.push(failed);
        }
    }
}
async function reconcileSubagentOutcomes(runtime, goalId, options, result, tickStartedAt) {
    const state = await runtime.getGoalOrchestrationState(goalId);
    const nodesById = new Map(state.nodes.map((node) => [node.nodeId, node]));
    for (const subagent of latestSubagentPerNode(state.subagents)) {
        const node = nodesById.get(subagent.nodeId);
        if (!node)
            continue;
        if (subagent.status === "blocked") {
            const blockedNode = withNodePatch(node, { status: "blocked", lastValidationSummary: subagent.selfReportedResult ?? subagent.integrationStatus });
            await runtime.saveGoalDagNode(blockedNode);
            result.blocked.push(blockedNode);
            continue;
        }
        if (subagent.status === "failed") {
            const failedNode = withNodePatch(node, { status: "failed", lastValidationSummary: subagent.integrationStatus ?? subagent.selfReportedResult });
            await runtime.saveGoalDagNode(failedNode);
            result.failed.push(failedNode);
            continue;
        }
        if (subagent.status === "selfReportedComplete" || (subagent.status === "complete" && node.status !== "complete")) {
            await validateOrHold(runtime, options, state, node, subagent, result, tickStartedAt);
            continue;
        }
        if (["sessionStarted", "running", "idle"].includes(subagent.status) && node.status !== "running") {
            await runtime.saveGoalDagNode(withNodePatch(node, { status: "running" }));
        }
    }
}
async function validateOrHold(runtime, options, state, node, subagent, result, tickStartedAt) {
    const validatingNode = withNodePatch(node, { status: "controllerValidating" });
    const validatingSubagent = withSubagentPatch(subagent, { status: "controllerValidating" });
    await runtime.saveGoalDagNode(validatingNode);
    await runtime.saveGoalSubagent(validatingSubagent);
    result.validating.push(validatingNode);
    if (!options.validator)
        return;
    const validation = await options.validator({ goalId: node.goalId, node: validatingNode, subagent: validatingSubagent, state, tickStartedAt });
    const validationSummary = validation.summary ?? validation.validationSignals?.join("; ");
    const validationResults = appendValidationResults(validatingSubagent, validation);
    if (validation.status === "passed") {
        const completedNode = withNodePatch(validatingNode, { status: "complete", lastValidationSummary: validationSummary });
        const completedSubagent = withSubagentPatch(validationResults, { status: "complete" });
        await runtime.saveGoalDagNode(completedNode);
        await runtime.saveGoalSubagent(completedSubagent);
        result.completed.push(completedNode);
        return;
    }
    if (validation.status === "blocked") {
        const blockedNode = withNodePatch(validatingNode, { status: "blocked", lastValidationSummary: validationSummary });
        const blockedSubagent = withSubagentPatch(validationResults, { status: "blocked" });
        await runtime.saveGoalDagNode(blockedNode);
        await runtime.saveGoalSubagent(blockedSubagent);
        result.blocked.push(blockedNode);
        return;
    }
    if (validation.followupPrompt) {
        const followed = await runtime.sendGoalSubagentPrompt(options.adapter, validationResults, validation.followupPrompt, {
            metadata: options.metadata,
            now: tickStartedAt,
        });
        const runningSubagent = withSubagentPatch(followed, { status: "running" });
        const runningNode = withNodePatch(validatingNode, { status: "running", lastValidationSummary: validationSummary });
        await runtime.saveGoalSubagent(runningSubagent);
        await runtime.saveGoalDagNode(runningNode);
        result.followups.push(runningSubagent);
        return;
    }
    const needsFollowupNode = withNodePatch(validatingNode, { status: "needsFollowup", lastValidationSummary: validationSummary });
    const needsFollowupSubagent = withSubagentPatch(validationResults, { status: "needsFollowup" });
    await runtime.saveGoalDagNode(needsFollowupNode);
    await runtime.saveGoalSubagent(needsFollowupSubagent);
    result.followups.push(needsFollowupSubagent);
}
async function startReadyNodes(runtime, goalId, options, result, tickStartedAt) {
    const state = await runtime.getGoalOrchestrationState(goalId);
    const queue = await runtime.getGoalDagReadyQueue(goalId, options.schedulingPolicy);
    result.ready = queue.ready;
    result.queueBlocked = queue.blocked;
    const maxStarts = options.maxStartsPerTick ?? queue.ready.length;
    let started = 0;
    for (const node of queue.ready) {
        if (started >= maxStarts)
            break;
        if (hasNonTerminalSubagentForNode(state.subagents, node.nodeId))
            continue;
        const allocation = await options.workspaceAllocator?.({ goalId, node, state, adapterId: options.adapter.adapterId, tickStartedAt });
        const startOptions = {
            subagentId: allocation?.subagentId,
            cwd: allocation?.cwd,
            branch: allocation?.branch,
            ref: allocation?.ref,
            systemPrompt: allocation?.systemPrompt ?? options.systemPrompt,
            initialPrompt: allocation?.initialPrompt ?? options.renderInitialPrompt?.({ goalId, node, state }) ?? renderDefaultInitialPrompt(node),
            metadata: { ...(options.metadata ?? {}), ...(allocation?.metadata ?? {}) },
            now: tickStartedAt,
        };
        const subagent = await runtime.startGoalSubagent(options.adapter, node, startOptions);
        result.started.push(subagent);
        started += 1;
    }
}
function latestSubagentPerNode(subagents) {
    const latest = new Map();
    for (const subagent of subagents) {
        const current = latest.get(subagent.nodeId);
        if (!current || subagent.updatedAt > current.updatedAt)
            latest.set(subagent.nodeId, subagent);
    }
    return [...latest.values()];
}
function hasNonTerminalSubagentForNode(subagents, nodeId) {
    return subagents.some((subagent) => subagent.nodeId === nodeId && NON_TERMINAL_SUBAGENT_STATUSES.has(subagent.status));
}
function isTransientStoreLockError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /database is locked|SQLITE_BUSY/i.test(message);
}
function appendValidationResults(subagent, validation) {
    const additions = [validation.summary, ...(validation.validationSignals ?? [])].filter((item) => Boolean(item?.trim()));
    if (additions.length === 0)
        return subagent;
    return { ...subagent, controllerValidationResults: [...(subagent.controllerValidationResults ?? []), ...additions] };
}
function withNodePatch(node, patch) {
    return { ...node, ...patch, updatedAt: new Date().toISOString() };
}
function withSubagentPatch(subagent, patch) {
    return { ...subagent, ...patch, updatedAt: new Date().toISOString(), lastActivityAt: patch.lastActivityAt ?? subagent.lastActivityAt };
}
function subagentChanged(left, right) {
    return JSON.stringify(left) !== JSON.stringify(right);
}
function renderDefaultInitialPrompt(node) {
    return [
        `Implement DAG node ${node.nodeId}: ${node.objective}`,
        node.scope ? `Scope: ${node.scope}` : undefined,
        node.expectedOutputs.length ? `Expected outputs: ${node.expectedOutputs.join(", ")}` : undefined,
        node.validators.length ? `Validators: ${node.validators.join(", ")}` : undefined,
    ].filter((line) => Boolean(line)).join("\n");
}
function resolveNow(now) {
    return typeof now === "function" ? now() : now ?? new Date();
}
function toIso(value) {
    return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}
async function sleep(ms, signal) {
    if (ms <= 0)
        return;
    await new Promise((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            resolve();
        }, { once: true });
    });
}
//# sourceMappingURL=controller-loop.js.map
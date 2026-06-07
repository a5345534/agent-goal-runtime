const INTEGRATION_COMPLETION_GATES = new Set([
    "subagent-integration",
    "subagent-branch-integration",
    "branch-integration",
    "native-git-integration",
    "worktree-merged-pr",
]);
/**
 * Returns true when a subagent's output must be integrated into the
 * controller workspace before the node may be considered complete.
 *
 * Native-git worktree nodes require the gate whenever the subagent record
 * carries branch/workspace evidence, even if the DAG omitted an explicit
 * integration completion gate. DAG authors can also require the gate
 * explicitly with one of the integration completion-gate names above.
 */
export function nodeRequiresSubagentIntegration(node, subagent) {
    if (node.completionGates.some((gate) => INTEGRATION_COMPLETION_GATES.has(normalizeGateName(gate))))
        return true;
    if (!subagent)
        return false;
    const strategy = node.workspaceStrategy?.toLowerCase() ?? "";
    return strategy.includes("native-git") && hasSubagentBranchOrWorkspaceEvidence(subagent);
}
export function subagentIntegrationTerminalSuccess(subagent) {
    return subagent.integrationState === "complete" || subagent.integrationState === "not-required";
}
export function requiredSubagentIntegrationTerminalSuccess(subagent) {
    if (subagent.integrationState === "complete")
        return true;
    if (subagent.integrationState !== "not-required")
        return false;
    // For an explicitly required integration gate, "not-required" is only terminal
    // success when it came from an integrator decision. The controller's generic
    // no-gate path can also write "not-required", but that must not satisfy a DAG
    // contract that explicitly requested branch/worktree integration.
    return Boolean(subagent.integrationCompletedAt);
}
export function nodeRequiredIntegrationsSatisfied(node, subagents) {
    const required = subagents.filter((subagent) => subagent.nodeId === node.nodeId && isIntegrationCandidateSubagent(subagent) && nodeRequiresSubagentIntegration(node, subagent));
    return required.length === 0 || required.every(requiredSubagentIntegrationTerminalSuccess);
}
export function findRequiredSubagentIntegrationIssues(state) {
    const nodesById = new Map(state.nodes.map((node) => [node.nodeId, node]));
    const issues = [];
    for (const subagent of state.subagents) {
        const node = nodesById.get(subagent.nodeId);
        if (!isIntegrationCandidateSubagent(subagent))
            continue;
        if (!node || !nodeRequiresSubagentIntegration(node, subagent))
            continue;
        if (requiredSubagentIntegrationTerminalSuccess(subagent))
            continue;
        issues.push({
            goalId: subagent.goalId,
            nodeId: subagent.nodeId,
            subagentId: subagent.subagentId,
            reason: requiredIntegrationIssueReason(subagent),
            integrationState: subagent.integrationState,
            integrationStatus: subagent.integrationStatus,
        });
    }
    return issues;
}
function requiredIntegrationIssueReason(subagent) {
    if (!subagent.integrationState)
        return "required subagent integration has no recorded terminal-success state";
    if (subagent.integrationState === "failed")
        return subagent.integrationError ?? subagent.integrationStatus ?? "required subagent integration failed";
    return `required subagent integration is ${subagent.integrationState}`;
}
function hasSubagentBranchOrWorkspaceEvidence(subagent) {
    return Boolean(subagent.workspacePath || subagent.branch || subagent.ref || subagent.commitSha || subagent.integrationSourceHead);
}
function isIntegrationCandidateSubagent(subagent) {
    if (subagent.integrationState)
        return true;
    return ["selfReportedComplete", "controllerValidating", "complete"].includes(subagent.status);
}
function normalizeGateName(value) {
    return value.trim().toLowerCase().replace(/_/g, "-");
}
//# sourceMappingURL=integration.js.map
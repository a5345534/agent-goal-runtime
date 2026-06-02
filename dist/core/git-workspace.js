import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
export class NativeGitWorkspaceManager {
    options;
    constructor(options = {}) {
        this.options = {
            worktreeRoot: options.worktreeRoot,
            defaultBaseRef: options.defaultBaseRef,
            remote: options.remote ?? "origin",
            branchPrefix: options.branchPrefix ?? "goal",
            fetch: options.fetch ?? true,
        };
    }
    allocateControllerWorkspace(request) {
        const repoRoot = findGitRepositoryRoot(request.invocationCwd);
        if (!repoRoot) {
            throw new Error(`cannot allocate goal workspace: ${request.invocationCwd} is not inside a Git repository`);
        }
        if (this.options.fetch)
            safeGit(repoRoot, ["fetch", this.options.remote, "--prune"]);
        const baseRef = this.resolveBaseRef(repoRoot, request.baseRef);
        const baseSlug = slugForGoal(request.goalId, request.objective);
        const worktreeRoot = this.resolveWorktreeRoot(repoRoot);
        mkdirSync(worktreeRoot, { recursive: true });
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
            const branch = `${this.options.branchPrefix}/${slug}`;
            const worktreePath = resolve(worktreeRoot, slug);
            if (existsSync(worktreePath) || gitRefExists(repoRoot, branch))
                continue;
            git(repoRoot, ["worktree", "add", "-b", branch, worktreePath, baseRef]);
            return {
                repoRoot,
                worktreePath,
                branch,
                baseRef,
                slug,
                allocationReason: "workspace-and-branch-omitted",
                created: true,
            };
        }
        throw new Error(`cannot allocate unique goal workspace for objective: ${request.objective}`);
    }
    allocateSubagentWorkspace(request) {
        const seedPath = request.repoRoot ?? request.invocationCwd ?? request.controllerWorkspacePath;
        if (!seedPath)
            throw new Error("cannot allocate subagent workspace: repoRoot, invocationCwd, or controllerWorkspacePath is required");
        const repoRoot = findGitRepositoryRoot(seedPath);
        if (!repoRoot)
            throw new Error(`cannot allocate subagent workspace: ${seedPath} is not inside a Git repository`);
        if (this.options.fetch)
            safeGit(repoRoot, ["fetch", this.options.remote, "--prune"]);
        const baseRef = this.resolveSubagentBaseRef(repoRoot, request);
        const baseSlug = slugForGoalSubagent(request.goalId, request.nodeSlug ?? request.nodeId, request.nodeObjective);
        const baseSubagentId = sanitizeSlug(request.subagentId ?? `subagent-${baseSlug}`);
        const worktreeRoot = this.resolveWorktreeRoot(repoRoot);
        mkdirSync(worktreeRoot, { recursive: true });
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
            const subagentId = attempt === 0 ? baseSubagentId : `${baseSubagentId}-${attempt + 1}`;
            const branch = `${this.options.branchPrefix}/${slug}`;
            const worktreePath = resolve(worktreeRoot, slug);
            if (existsSync(worktreePath) || gitRefExists(repoRoot, branch))
                continue;
            git(repoRoot, ["worktree", "add", "-b", branch, worktreePath, baseRef]);
            return {
                repoRoot,
                worktreePath,
                branch,
                baseRef,
                slug,
                nodeId: request.nodeId,
                subagentId,
                allocationReason: "subagent-dag-node",
                created: true,
            };
        }
        throw new Error(`cannot allocate unique subagent workspace for DAG node: ${request.nodeId}`);
    }
    cleanupWorkspace(request) {
        const repoRoot = request.repoRoot ?? findGitCommonRepositoryRoot(request.worktreePath) ?? findGitRepositoryRoot(request.worktreePath) ?? process.cwd();
        const forceFlag = request.force ? "--force" : undefined;
        const removeArgs = ["worktree", "remove", ...(forceFlag ? [forceFlag] : []), request.worktreePath];
        git(repoRoot, removeArgs);
        if (request.branch) {
            const deleteArgs = ["branch", request.force ? "-D" : "-d", request.branch];
            git(repoRoot, deleteArgs);
        }
    }
    resolveBaseRef(repoRoot, overrideBaseRef) {
        if (overrideBaseRef?.trim())
            return overrideBaseRef.trim();
        if (this.options.defaultBaseRef?.trim())
            return this.options.defaultBaseRef.trim();
        const remoteHead = safeGit(repoRoot, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${this.options.remote}/HEAD`]);
        if (remoteHead)
            return remoteHead;
        const currentBranch = safeGit(repoRoot, ["branch", "--show-current"]);
        if (currentBranch)
            return currentBranch;
        const head = safeGit(repoRoot, ["rev-parse", "--verify", "HEAD"]);
        if (head)
            return head;
        throw new Error("cannot resolve goal workspace base ref: repository has no HEAD");
    }
    resolveSubagentBaseRef(repoRoot, request) {
        if (request.baseRef?.trim())
            return request.baseRef.trim();
        if (request.controllerWorkspacePath?.trim()) {
            const controllerBranch = safeGit(request.controllerWorkspacePath, ["branch", "--show-current"]);
            if (controllerBranch)
                return controllerBranch;
            const controllerHead = safeGit(request.controllerWorkspacePath, ["rev-parse", "--verify", "HEAD"]);
            if (controllerHead)
                return controllerHead;
        }
        return this.resolveBaseRef(repoRoot);
    }
    resolveWorktreeRoot(repoRoot) {
        return resolve(this.options.worktreeRoot ?? resolve(repoRoot, ".worktrees"));
    }
}
export function createNativeGitSubagentWorkspaceAllocator(manager, options = {}) {
    return (request) => {
        const allocation = manager.allocateSubagentWorkspace({
            invocationCwd: options.invocationCwd,
            repoRoot: options.repoRoot,
            controllerWorkspacePath: options.controllerWorkspacePath,
            baseRef: options.baseRef,
            goalId: request.goalId,
            nodeId: request.node.nodeId,
            nodeSlug: request.node.slug,
            nodeObjective: request.node.objective,
        });
        return {
            subagentId: allocation.subagentId,
            cwd: allocation.worktreePath,
            branch: allocation.branch,
            systemPrompt: options.systemPrompt,
            initialPrompt: options.initialPrompt?.(request, allocation),
            metadata: {
                ...(options.metadata ?? {}),
                nativeGitWorkspace: allocation,
            },
        };
    };
}
export function cleanupTerminalSubagentWorkspaces(manager, state, policy = {}) {
    return state.subagents.map((subagent) => cleanupSubagentWorkspace(manager, subagent, policy));
}
export function cleanupSubagentWorkspace(manager, subagent, policy = {}) {
    if (!["complete", "blocked", "failed"].includes(subagent.status)) {
        return cleanupResult(subagent, "skipped", "subagent is not terminal");
    }
    if (!subagent.workspacePath) {
        return cleanupResult(subagent, "skipped", "subagent has no workspacePath");
    }
    const decision = cleanupDecision(subagent, policy);
    if (decision === "preserve")
        return cleanupResult(subagent, "preserved", `policy preserves ${subagent.status} workspaces`);
    try {
        manager.cleanupWorkspace({ worktreePath: subagent.workspacePath, branch: subagent.branch, force: policy.force });
        return cleanupResult(subagent, "removed");
    }
    catch (error) {
        return cleanupResult(subagent, "error", undefined, error instanceof Error ? error.message : String(error));
    }
}
function cleanupDecision(subagent, policy) {
    if (subagent.status === "complete")
        return policy.completed ?? "remove";
    if (subagent.status === "blocked")
        return policy.blocked ?? "preserve";
    if (subagent.status === "failed")
        return policy.failed ?? "preserve";
    return "preserve";
}
function cleanupResult(subagent, action, reason, error) {
    return {
        subagentId: subagent.subagentId,
        nodeId: subagent.nodeId,
        status: subagent.status,
        action,
        reason,
        workspacePath: subagent.workspacePath,
        branch: subagent.branch,
        error,
    };
}
export function findGitRepositoryRoot(startPath) {
    const output = safeGit(resolve(startPath), ["rev-parse", "--show-toplevel"]);
    return output || undefined;
}
function findGitCommonRepositoryRoot(startPath) {
    const resolvedStart = resolve(startPath);
    const commonDir = safeGit(resolvedStart, ["rev-parse", "--git-common-dir"]);
    if (!commonDir)
        return undefined;
    const absoluteCommonDir = isAbsolute(commonDir) ? commonDir : resolve(resolvedStart, commonDir);
    return basename(absoluteCommonDir) === ".git" ? dirname(absoluteCommonDir) : dirname(absoluteCommonDir);
}
export function slugForGoal(goalId, objective) {
    const shortId = sanitizeSlug(goalId).slice(0, 8) || "goal";
    const objectiveSlug = sanitizeSlug(objective).slice(0, 48);
    return objectiveSlug ? `${shortId}-${objectiveSlug}` : shortId;
}
export function slugForGoalSubagent(goalId, nodeSlugOrId, nodeObjective) {
    const shortId = sanitizeSlug(goalId).slice(0, 8) || "goal";
    const nodeSlug = sanitizeSlug(nodeSlugOrId).slice(0, 48);
    if (nodeSlug)
        return `${shortId}-${nodeSlug}`;
    const objectiveSlug = nodeObjective ? sanitizeSlug(nodeObjective).slice(0, 48) : "";
    return objectiveSlug ? `${shortId}-${objectiveSlug}` : shortId;
}
function sanitizeSlug(value) {
    const normalized = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
    return normalized || sanitizeFallback(value);
}
function sanitizeFallback(value) {
    const fallback = Buffer.from(value).toString("hex").slice(0, 16);
    return fallback || basename(process.cwd()) || "goal";
}
function gitRefExists(repoRoot, ref) {
    return safeGit(repoRoot, ["show-ref", "--verify", `refs/heads/${ref}`]).length > 0;
}
function git(cwd, args) {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function safeGit(cwd, args) {
    try {
        return git(cwd, args);
    }
    catch {
        return "";
    }
}
//# sourceMappingURL=git-workspace.js.map
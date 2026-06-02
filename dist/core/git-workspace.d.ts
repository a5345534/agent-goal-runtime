import type { GoalControllerWorkspaceAllocator, GoalControllerWorkspaceAllocationRequest } from "./controller-loop.js";
export interface NativeGitWorkspaceManagerOptions {
    /** Directory inside the repository where goal worktrees are created. Defaults to <repo>/.worktrees. */
    worktreeRoot?: string;
    /** Default base ref for new worktrees. If omitted, the remote default branch is preferred. */
    defaultBaseRef?: string;
    /** Remote used for default-branch discovery and optional fetch. Defaults to origin. */
    remote?: string;
    /** Prefix for generated branches. Defaults to goal. */
    branchPrefix?: string;
    /** Whether to run git fetch <remote> before resolving refs. Defaults to true. */
    fetch?: boolean;
}
export interface ControllerWorkspaceAllocationRequest {
    /** Directory where the user invoked the goal command. */
    invocationCwd: string;
    goalId: string;
    objective: string;
    /** Optional caller-supplied base ref overriding manager defaults. */
    baseRef?: string;
}
export interface NativeGitWorkspaceAllocation {
    repoRoot: string;
    worktreePath: string;
    branch: string;
    baseRef: string;
    slug: string;
    allocationReason: "workspace-and-branch-omitted" | "subagent-dag-node";
    created: true;
}
export interface NativeGitControllerWorkspaceAllocation extends NativeGitWorkspaceAllocation {
    allocationReason: "workspace-and-branch-omitted";
}
export interface NativeGitSubagentWorkspaceAllocation extends NativeGitWorkspaceAllocation {
    allocationReason: "subagent-dag-node";
    nodeId: string;
    subagentId: string;
}
export interface NativeGitSubagentWorkspaceAllocationRequest {
    /** Stable Git repository checkout to use for creating the worktree. */
    invocationCwd?: string;
    /** Optional already-known repository root, used before invocationCwd/controllerWorkspacePath. */
    repoRoot?: string;
    /** Controller workspace whose current branch/HEAD should be used as the default base ref. */
    controllerWorkspacePath?: string;
    goalId: string;
    nodeId: string;
    nodeSlug?: string;
    nodeObjective?: string;
    /** Optional caller-supplied base ref overriding controller branch/manager defaults. */
    baseRef?: string;
    /** Optional stable subagent id; otherwise generated from goal/node and collision suffix. */
    subagentId?: string;
}
export interface NativeGitSubagentWorkspaceAllocatorOptions {
    invocationCwd?: string;
    repoRoot?: string;
    controllerWorkspacePath?: string;
    baseRef?: string;
    systemPrompt?: string;
    initialPrompt?: (request: GoalControllerWorkspaceAllocationRequest, allocation: NativeGitSubagentWorkspaceAllocation) => string;
    metadata?: Record<string, unknown>;
}
export interface NativeGitWorkspaceCleanupRequest {
    worktreePath: string;
    branch?: string;
    repoRoot?: string;
    force?: boolean;
}
export declare class NativeGitWorkspaceManager {
    private readonly options;
    constructor(options?: NativeGitWorkspaceManagerOptions);
    allocateControllerWorkspace(request: ControllerWorkspaceAllocationRequest): NativeGitControllerWorkspaceAllocation;
    allocateSubagentWorkspace(request: NativeGitSubagentWorkspaceAllocationRequest): NativeGitSubagentWorkspaceAllocation;
    cleanupWorkspace(request: NativeGitWorkspaceCleanupRequest): void;
    resolveBaseRef(repoRoot: string, overrideBaseRef?: string): string;
    private resolveSubagentBaseRef;
    private resolveWorktreeRoot;
}
export declare function createNativeGitSubagentWorkspaceAllocator(manager: NativeGitWorkspaceManager, options?: NativeGitSubagentWorkspaceAllocatorOptions): GoalControllerWorkspaceAllocator;
export declare function findGitRepositoryRoot(startPath: string): string | undefined;
export declare function slugForGoal(goalId: string, objective: string): string;
export declare function slugForGoalSubagent(goalId: string, nodeSlugOrId: string, nodeObjective?: string): string;

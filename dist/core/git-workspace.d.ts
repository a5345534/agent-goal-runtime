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
    allocationReason: "workspace-and-branch-omitted";
    created: true;
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
    allocateControllerWorkspace(request: ControllerWorkspaceAllocationRequest): NativeGitWorkspaceAllocation;
    cleanupWorkspace(request: NativeGitWorkspaceCleanupRequest): void;
    resolveBaseRef(repoRoot: string, overrideBaseRef?: string): string;
}
export declare function findGitRepositoryRoot(startPath: string): string | undefined;
export declare function slugForGoal(goalId: string, objective: string): string;

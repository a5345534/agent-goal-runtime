import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
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

export class NativeGitWorkspaceManager {
  private readonly options: Required<Omit<NativeGitWorkspaceManagerOptions, "worktreeRoot" | "defaultBaseRef">> & Pick<NativeGitWorkspaceManagerOptions, "worktreeRoot" | "defaultBaseRef">;

  constructor(options: NativeGitWorkspaceManagerOptions = {}) {
    this.options = {
      worktreeRoot: options.worktreeRoot,
      defaultBaseRef: options.defaultBaseRef,
      remote: options.remote ?? "origin",
      branchPrefix: options.branchPrefix ?? "goal",
      fetch: options.fetch ?? true,
    };
  }

  allocateControllerWorkspace(request: ControllerWorkspaceAllocationRequest): NativeGitControllerWorkspaceAllocation {
    const repoRoot = findGitRepositoryRoot(request.invocationCwd);
    if (!repoRoot) {
      throw new Error(`cannot allocate goal workspace: ${request.invocationCwd} is not inside a Git repository`);
    }

    if (this.options.fetch) safeGit(repoRoot, ["fetch", this.options.remote, "--prune"]);

    const baseRef = this.resolveBaseRef(repoRoot, request.baseRef);
    const baseSlug = slugForGoal(request.goalId, request.objective);
    const worktreeRoot = this.resolveWorktreeRoot(repoRoot);
    mkdirSync(worktreeRoot, { recursive: true });

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      const branch = `${this.options.branchPrefix}/${slug}`;
      const worktreePath = resolve(worktreeRoot, slug);
      if (existsSync(worktreePath) || gitRefExists(repoRoot, branch)) continue;
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

  allocateSubagentWorkspace(request: NativeGitSubagentWorkspaceAllocationRequest): NativeGitSubagentWorkspaceAllocation {
    const seedPath = request.repoRoot ?? request.invocationCwd ?? request.controllerWorkspacePath;
    if (!seedPath) throw new Error("cannot allocate subagent workspace: repoRoot, invocationCwd, or controllerWorkspacePath is required");
    const repoRoot = findGitRepositoryRoot(seedPath);
    if (!repoRoot) throw new Error(`cannot allocate subagent workspace: ${seedPath} is not inside a Git repository`);

    if (this.options.fetch) safeGit(repoRoot, ["fetch", this.options.remote, "--prune"]);

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
      if (existsSync(worktreePath) || gitRefExists(repoRoot, branch)) continue;
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

  cleanupWorkspace(request: NativeGitWorkspaceCleanupRequest): void {
    const repoRoot = request.repoRoot ?? findGitRepositoryRoot(request.worktreePath) ?? process.cwd();
    const forceFlag = request.force ? "--force" : undefined;
    const removeArgs = ["worktree", "remove", ...(forceFlag ? [forceFlag] : []), request.worktreePath];
    git(repoRoot, removeArgs);
    if (request.branch) {
      const deleteArgs = ["branch", request.force ? "-D" : "-d", request.branch];
      git(repoRoot, deleteArgs);
    }
  }

  resolveBaseRef(repoRoot: string, overrideBaseRef?: string): string {
    if (overrideBaseRef?.trim()) return overrideBaseRef.trim();
    if (this.options.defaultBaseRef?.trim()) return this.options.defaultBaseRef.trim();

    const remoteHead = safeGit(repoRoot, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${this.options.remote}/HEAD`]);
    if (remoteHead) return remoteHead;

    const currentBranch = safeGit(repoRoot, ["branch", "--show-current"]);
    if (currentBranch) return currentBranch;

    const head = safeGit(repoRoot, ["rev-parse", "--verify", "HEAD"]);
    if (head) return head;

    throw new Error("cannot resolve goal workspace base ref: repository has no HEAD");
  }

  private resolveSubagentBaseRef(repoRoot: string, request: NativeGitSubagentWorkspaceAllocationRequest): string {
    if (request.baseRef?.trim()) return request.baseRef.trim();
    if (request.controllerWorkspacePath?.trim()) {
      const controllerBranch = safeGit(request.controllerWorkspacePath, ["branch", "--show-current"]);
      if (controllerBranch) return controllerBranch;
      const controllerHead = safeGit(request.controllerWorkspacePath, ["rev-parse", "--verify", "HEAD"]);
      if (controllerHead) return controllerHead;
    }
    return this.resolveBaseRef(repoRoot);
  }

  private resolveWorktreeRoot(repoRoot: string): string {
    return resolve(this.options.worktreeRoot ?? resolve(repoRoot, ".worktrees"));
  }
}

export function createNativeGitSubagentWorkspaceAllocator(
  manager: NativeGitWorkspaceManager,
  options: NativeGitSubagentWorkspaceAllocatorOptions = {},
): GoalControllerWorkspaceAllocator {
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

export function findGitRepositoryRoot(startPath: string): string | undefined {
  const output = safeGit(resolve(startPath), ["rev-parse", "--show-toplevel"]);
  return output || undefined;
}

export function slugForGoal(goalId: string, objective: string): string {
  const shortId = sanitizeSlug(goalId).slice(0, 8) || "goal";
  const objectiveSlug = sanitizeSlug(objective).slice(0, 48);
  return objectiveSlug ? `${shortId}-${objectiveSlug}` : shortId;
}

export function slugForGoalSubagent(goalId: string, nodeSlugOrId: string, nodeObjective?: string): string {
  const shortId = sanitizeSlug(goalId).slice(0, 8) || "goal";
  const nodeSlug = sanitizeSlug(nodeSlugOrId).slice(0, 48);
  if (nodeSlug) return `${shortId}-${nodeSlug}`;
  const objectiveSlug = nodeObjective ? sanitizeSlug(nodeObjective).slice(0, 48) : "";
  return objectiveSlug ? `${shortId}-${objectiveSlug}` : shortId;
}

function sanitizeSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return normalized || sanitizeFallback(value);
}

function sanitizeFallback(value: string): string {
  const fallback = Buffer.from(value).toString("hex").slice(0, 16);
  return fallback || basename(process.cwd()) || "goal";
}

function gitRefExists(repoRoot: string, ref: string): boolean {
  return safeGit(repoRoot, ["show-ref", "--verify", `refs/heads/${ref}`]).length > 0;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function safeGit(cwd: string, args: string[]): string {
  try {
    return git(cwd, args);
  } catch {
    return "";
  }
}

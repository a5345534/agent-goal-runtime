import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";

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

  allocateControllerWorkspace(request: ControllerWorkspaceAllocationRequest): NativeGitWorkspaceAllocation {
    const repoRoot = findGitRepositoryRoot(request.invocationCwd);
    if (!repoRoot) {
      throw new Error(`cannot allocate goal workspace: ${request.invocationCwd} is not inside a Git repository`);
    }

    if (this.options.fetch) safeGit(repoRoot, ["fetch", this.options.remote, "--prune"]);

    const baseRef = this.resolveBaseRef(repoRoot, request.baseRef);
    const baseSlug = slugForGoal(request.goalId, request.objective);
    const worktreeRoot = resolve(this.options.worktreeRoot ?? resolve(repoRoot, ".worktrees"));
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

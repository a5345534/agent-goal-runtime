## Context

Controller validation currently treats every expected output string as a path. This works for fully qualified relative paths, but planner-generated or manually written DAGs often use output filenames for readability. For repository-changing nodes in module trees, basename-only output strings are valid intent but fail literal workspace-root existence checks.

## Goals

- Preserve strict path checks for path-like expected outputs.
- Interpret basename-only expected outputs as file identity hints, not workspace-root paths.
- Avoid accepting ambiguous workspace-wide matches when git evidence is unavailable.

## Decisions

### D1. Prefer git evidence for basename-only outputs

**Choice**
- For outputs with no path separators, first match against `basename(path)` from `changedPaths(request)`.

**Rationale**
- The purpose of expected outputs is to confirm the subagent touched the requested implementation artifacts. Changed git paths are stronger evidence than arbitrary files that already exist in the workspace.

**Alternative rejected**
- Recursively accepting any basename match without git evidence first. This could falsely pass when unrelated files with common names already exist.

### D2. Allow a single workspace match as fallback

**Choice**
- If git evidence has no match, recursively scan the workspace and pass only when exactly one file basename matches.

**Rationale**
- Some harnesses may leave clean committed changes where status-only evidence is empty; a unique file still indicates the output exists.

## Risks / Trade-offs

- Duplicate filenames in large repositories will still fail unless the changed-path evidence identifies the intended file. That is intentional to avoid ambiguity.
- Recursive fallback adds small validation overhead only for basename-only expected outputs that did not match git evidence.

## Migration Plan

1. Update expected-output matching logic.
2. Add tests for basename matching changed module paths and ambiguous fallback behavior.
3. Rebuild dist and validate.

## Open Questions

- None.

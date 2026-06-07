## Context

`agent-goal-runtime` is a DAG consumer. The planner or user-authored DAG can declare completion gates such as `controller-validation` and integration gates. The runtime must interpret those gates as task-level contract requirements. It must not infer requirements from a specific workspace's policy, repository layout, branch naming convention, or product domain.

The current integration gate recognizer includes:

- `subagent-integration`
- `subagent-branch-integration`
- `branch-integration`
- `native-git-integration`

A DAG used `worktree-merged-pr` to mean that work produced in a subagent worktree/branch must be merged before the node is terminal-complete. Because this alias was not recognized, controller validation could mark implementation nodes complete with `integrationState=not-required`.

## Goals

- Honor explicit DAG-level merge/integration requirements.
- Avoid workspace-specific assumptions in runtime logic.
- Fail closed when a recognized integration gate is present but no integrator can run.
- Keep non-repository and no-branch goals unaffected unless they explicitly declare a recognized integration gate.

## Decisions

### D1. Recognize `worktree-merged-pr` as a gate alias

**Choice**
- Add `worktree-merged-pr` to the integration-gate alias set used by `nodeRequiresSubagentIntegration()`.
- Treat it the same as other explicit integration gate names.

**Rationale**
- The requirement comes from the DAG node itself, not from a workspace profile.
- The alias is semantically generic enough for DAG authors: a worktree/PR style artifact must be merged/integrated before completion.
- Existing controller behavior already handles the next step generically: if an integrator exists, run it; if not, block.

**Alternative rejected**
- Hard-code workspace-specific policy or BeYourself-specific gate mappings. This would violate portability because goals may run anywhere.
- Ignore unknown gates forever. This allows explicit DAG contracts to be silently weakened.
- Treat every branch/workspace-backed subagent as requiring integration regardless of DAG gates. This is too broad for non-repository or inspection-only work.

### D2. Do not infer target branch or promotion policy from the gate

**Choice**
- The alias only means “subagent output must be integrated into the controller/parent workspace before node completion.”
- Promotion to target branch remains controlled by existing Pi/native-git closeout metadata and dirty/conflict checks.

**Rationale**
- Integration and promotion are separate lifecycle phases.
- Workspace-level target branch rules must remain explicit runtime metadata, not inferred from a gate string.

**Alternative rejected**
- Interpreting `worktree-merged-pr` as “merge to master/main.” That would be workspace-specific and unsafe.

### D3. Require integrator evidence for `not-required` under explicit gates

**Choice**
- When a node requires integration, `integrationState=not-required` only satisfies the gate if it includes `integrationCompletedAt`, which is written by the integrator path.
- Generic no-gate completion can still write `not-required`, but that state does not satisfy a later/explicit integration requirement by itself.

**Rationale**
- This prevents older or incorrect no-gate completions from satisfying a DAG contract that explicitly required merge/integration.
- The rule remains generic: it checks runtime integration evidence, not workspace identity or branch naming.

**Alternative rejected**
- Treat all `not-required` values as terminal success even under explicit gates. That preserves the bug for already-persisted records.

## Risks / Trade-offs

- Existing DAGs using `worktree-merged-pr` without an integrator will now block instead of incorrectly completing. This is intended fail-closed behavior.
- Previously persisted `integrationState=not-required` records without integrator evidence will no longer satisfy explicit integration gates. This may surface old incomplete integration, which is safer than promoting missing work.
- Some DAG authors may have used the alias informally. The safer behavior is to require explicit integration or remove the gate.

## Migration Plan

1. Add the alias to the integration gate recognizer.
2. Add tests for controller validation and final closeout with this alias.
3. Run the full runtime check.
4. Update built `dist/` artifacts for Pi install compatibility.

## Open Questions

- Should the DAG schema enumerate known completion gate aliases in a future change? Out of scope here.

# Design: standardize-controller-owned-subagent-lifecycle

## Context

The runtime already has durable DAG nodes, durable subagent records, a native Git workspace manager, and a portable controller loop. Current execution starts ready nodes by calling a workspace allocator and then `adapter.startSession()`. The core helper persists the returned session/workspace details into `GoalSubagentRecord`, while Pi and OpenCode adapters launch detached background sessions and infer status from transcripts. The controller loop also owns validation, integration, and a growing set of hard-coded exception branches for subagent failures.

This design changes the ownership model. The controller becomes the lifecycle and resource authority for each DAG node. The adapter remains the harness bridge for attaching/launching a runner and observing transcript/runner state, but it does not decide recovery policy. Abnormal observations go through a dedicated exception handler that can use deterministic rules, invoke a controller model for diagnosis, and persist proposed recovery playbooks for repeated failures.

## Spec Kernel

- Why: reduce orchestration complexity, preserve subagent context, avoid duplicate uncontrolled resources, and make recovery behavior auditable and evolvable.
- Capabilities:
  - Controller-owned lifecycle: every DAG node moves through defined acceptance, resource, runner, observation, judgment, validation, integration, and terminal phases.
  - Formal adapter observation: adapters report standardized observations from prepared resources without owning normal recovery decisions.
  - Exception recovery path: abnormal observations are handled by a separate controller exception handler with durable decisions and learnable recovery rules.
  - Context-preserving recovery: recoveries reuse controller-owned workspace/session resources when safe and require explicit supersession before new resources are created.
- Constraints:
  - Existing public goal/DAG statuses and stores need a staged migration.
  - Adapter contracts must remain harness-neutral and support Pi and OpenCode.
  - Learned rules must be auditable and validation-gated; they must not silently edit runtime source.
  - Formal subagent completion still requires controller validation and integration before node completion.
- Non-goals:
  - Rewrite all adapters in one step without compatibility.
  - Remove validation/integration gates.
  - Add model-visible tools for recovery internals.
- Success signal: tests and monitor evidence show a node using controller-created resources, adapter observations flowing through formal/exception paths, and repeated abnormal signatures producing auditable recovery-rule drafts.
- Assumptions:
  - Detailed lifecycle state can be added alongside coarse `GoalDagNode.status` before any enum-breaking migration.
  - Prepared-resource attach can be introduced as a new adapter capability while legacy `startSession` remains temporarily supported.
- Open questions:
  - Whether generated recovery rules should auto-enable.
  - Whether prepared session creation is a core resource-manager responsibility or an adapter resource-provider responsibility.

## Goals

- Make controller-owned node lifecycle the default orchestration model.
- Keep adapter behavior focused on the formal path: attach to prepared resources, send prompts, and report normalized observations.
- Move recovery decisions out of adapter observation code and out of monolithic controller exception branches.
- Preserve workspace/session context across recoveries whenever safe.
- Persist recovery decisions and learned-rule proposals for review and reuse.

## Non-Goals

- Do not eliminate all legacy recovery branches before the new exception handler is feature-complete.
- Do not allow subagents to allocate new branches/worktrees/sessions during normal execution.
- Do not let controller-model diagnosis bypass validation, integration, or human-review requirements.
- Do not redesign `/goal --dag` planning or dependency scheduling beyond the execution lifecycle integration points.

## Concern Scan

| Concern | Relevance | Design response |
| --- | --- | --- |
| Module ownership / boundary risk | Current adapter and controller code both contain orchestration decisions. | Core owns lifecycle/recovery policy; adapters own harness observation and prepared-resource attachment. |
| State migration | Existing stores persist coarse node/subagent statuses. | Add lifecycle/resource records or fields additively, keep coarse statuses as compatibility projections. |
| Recovery safety | Controller-model decisions can be nondeterministic. | Deterministic recovery rules are checked first; model decisions are persisted with evidence, bounded actions, and validation gates. |
| Resource leaks / duplication | Replacement sessions can create duplicate resources. | Controller-created resource records are reused; new resources require explicit supersession reason. |
| Harness compatibility | Pi and OpenCode have different session mechanics. | Adapter contract separates prepared-resource attachment from normalized observation so each harness implements its own join details. |
| Observability | Operators need to understand lifecycle and recovery decisions. | Ledger events and monitor fields expose phase, resource ids, abnormal observation, decision, and learned-rule id. |
| Validation and integration | Self-report remains untrusted. | `selfReportedComplete` transitions to controller judgment/validation/integration, not direct terminal completion. |

## Decisions

### D1. Controller owns the node lifecycle and resource inventory

**Choice**

Add a durable node execution lifecycle managed by the controller. The lifecycle phases are:

1. `acceptanceDefined` — node acceptance conditions, expected outputs, validators, completion gates, and non-goals are known before resources are created.
2. `resourcesCreating` — controller prepares branch, worktree, session identity/file, model routing, and runner metadata.
3. `resourcesReady` — prepared resources are recorded and verified; no runner has joined yet.
4. `runnerStarting` — adapter is asked to attach/start a runner against the prepared resources.
5. `runnerActive` — adapter observes running/idle formal states.
6. `controllerJudging` — controller evaluates a self-report, blocked report, protocol violation, or abnormal observation.
7. `validating` — controller validator checks required outputs and signals.
8. `integrating` — controller integrates required branch/worktree outputs.
9. `terminal` — node is complete, blocked, failed only for true unrecoverable system terminal, or superseded.

The existing `GoalDagNode.status` remains a coarse projection during migration. For example, `resourcesCreating`, `resourcesReady`, `runnerStarting`, and `runnerActive` can project to `running` or `ready` in current monitors while detailed lifecycle state is available to new code.

**Rationale**

A single resource authority prevents branches, worktrees, and sessions from being created by different layers with different assumptions. It also gives recovery code a stable resource record to reuse.

**Alternatives considered**

- Extend only the existing status enum. This is simpler but risks breaking current tests, schemas, and monitor logic.
- Keep workspace allocation as a hook only. This does not give the controller durable ownership of session identities or recovery context.

### D2. Adapters implement a formal observation path, not recovery policy

**Choice**

Introduce a prepared-resource adapter path. The controller supplies a prepared execution context that includes subagent id, workspace path, branch/ref, session id/file or session allocation intent, model routing, system/initial prompt, and lifecycle metadata. The adapter attaches or starts the harness runner against those resources and returns/observes normalized observations:

- `runnerStarting`
- `running`
- `idle`
- `selfReportedComplete`
- `selfReportedBlocked`
- `protocolViolation`
- `runnerError`
- `runnerLost`
- `stopped`

The adapter may parse formal markers such as `SUBAGENT_RESULT:` and `SUBAGENT_BLOCKED:` because those are part of the normal protocol. It must not decide whether a context overflow should restart with another model, whether a missing session should create a replacement, or whether a repeated terminated error should block the node.

**Rationale**

Adapters should describe harness facts. Keeping recovery policy outside the adapter prevents the normal protocol from being polluted by exception scripts and makes behavior easier to test across Pi/OpenCode.

**Alternatives considered**

- Put all exception logic in the adapter. Rejected because it makes each adapter a second controller and duplicates policy.
- Keep the current `HarnessSubagentSessionStatus` as the only observation shape. Rejected because `failed` and `needsFollowup` conflate observation with recovery intent.

### D3. A controller exception handler owns abnormal recovery decisions

**Choice**

Add a `ControllerExceptionHandler` that receives abnormal observations and returns a durable `RecoveryDecision`. Inputs include goal id, node, subagent, lifecycle/resource record, adapter id, observation kind, error text, transcript tail/evidence, recent matching failures, previous recovery decisions, and controller policy.

Supported decision actions include:

- `sendPromptToSameSession`
- `restartRunnerSameSession`
- `restartRunnerSameWorktreeNewSession`
- `markNodeBlocked`
- `askUser`
- `invokeControllerModel`
- `proposeRecoveryRule`
- `supersedeResourcesAndRestart` only when reuse is unsafe and a reason is recorded

The handler first checks deterministic recovery rules/playbooks. If no safe rule matches, it may invoke a controller model diagnostic turn. Model decisions are persisted with evidence and bounded action details before execution.

**Rationale**

This preserves the ability to handle many exception types while removing hard-coded branches from the main lifecycle and adapter path. A controller model can diagnose unclassified failures without forcing every new pattern into TypeScript regexes first.

**Alternatives considered**

- Keep adding pattern-specific branches to `controller-loop.ts`. Rejected because it has already produced too many special cases and makes the desired behavior hard to see.
- Always ask the controller model. Rejected because deterministic known failures should be fast, cheap, and testable.

### D4. Repeated failures produce auditable recovery-rule proposals

**Choice**

When the exception handler sees a repeated failure signature above a configured threshold, it creates or updates a recovery-rule/playbook artifact with:

- rule id and version;
- adapter id and observation kind;
- normalized match signature and evidence samples;
- proposed recovery decision;
- confidence and activation state;
- source goal/node/subagent ids;
- validation requirements and last validation result;
- created/updated timestamps.

Generated rules are data artifacts, not direct runtime source edits. A project policy may allow automatic activation only for low-risk, fully validated decisions; otherwise generated rules remain proposed until review.

**Rationale**

This satisfies the desire for the system to learn from repeated pitfalls while keeping governance, tests, and rollback possible.

**Alternatives considered**

- Let the controller model directly edit adapter source code. Rejected because it bypasses review and can destabilize normal adapter behavior.
- Never persist learned rules. Rejected because repeated failures would continue to consume controller-model turns.

### D5. Recovery reuses controller-owned resources by default

**Choice**

For abnormal runner conditions, the exception handler must prefer reusing the same controller-owned worktree/branch and, when viable, the same session file/id. Starting a new session for the same node is allowed only as a decision against the existing resource record; it does not allocate a new branch/worktree. Creating a new branch/worktree requires `supersedeResourcesAndRestart` with an explicit reason, ledger evidence, and monitor visibility.

**Rationale**

Most useful context is in the workspace and transcript. Preserving those resources avoids repeated discovery, duplicate branches, and lost partial progress.

**Alternatives considered**

- Keep replacement subagents as the normal recovery path. Rejected because replacements can discard context and multiply resources.

### D6. Validation and integration remain controller-owned gates

**Choice**

`selfReportedComplete` remains an input to controller judgment. A node reaches `complete` only after controller validation passes and any required branch/worktree integration succeeds. `selfReportedBlocked` enters controller judgment and may become a recoverable exception, a follow-up prompt, an ask-user decision, or a terminal blocked node.

**Rationale**

Subagent self-report is useful but not authoritative. The controller must continue to verify outputs and integrate repository changes.

**Alternatives considered**

- Treat `SUBAGENT_RESULT` as terminal completion. Rejected because current runtime already separates self-report from validation, and preserving that safety is important.

## Detailed Design

### Data / Contract Changes

- Add a durable lifecycle/resource representation, either as additive fields on DAG/subagent records or as a new node execution record. The first implementation should avoid breaking existing coarse `GoalDagNode.status` consumers.
- Add prepared execution context types for controller-owned resources.
- Add normalized adapter observation types that distinguish formal protocol observations from abnormal runner/protocol observations.
- Add `ControllerExceptionHandler`, `ExceptionHandlingRequest`, `RecoveryDecision`, and recovery-rule/playbook store interfaces.
- Add ledger events for lifecycle phase changes, resource preparation, adapter observations, exception decisions, controller-model diagnostics, and recovery-rule proposals.
- Update schemas (`goal-dag.schema.json`, `goal-ledger.schema.json`, and store schema where needed) to persist lifecycle and recovery evidence.

### Execution Flow

1. Scheduler selects a ready node.
2. Controller records `acceptanceDefined` and verifies node acceptance metadata.
3. Controller creates or reuses the node branch/worktree/session resources and records `resourcesReady`.
4. Adapter attaches/starts a runner against prepared resources and records `runnerStarting` / `runnerActive`.
5. Adapter observation loop returns formal observations.
6. `running` / `idle` keeps the node active.
7. `selfReportedComplete` enters `controllerJudging`, then validation and integration.
8. `selfReportedBlocked`, `protocolViolation`, `runnerError`, and `runnerLost` enter the exception handler.
9. Exception handler executes a durable recovery decision against existing resources or marks the node blocked / asks the user.
10. Terminal closeout records final phase and cleanup policy.

### Module Boundaries

- `src/core/controller-loop.ts` should orchestrate lifecycle transitions but delegate abnormal recovery to `ControllerExceptionHandler`.
- `src/core/subagent-adapter.ts` should define prepared-resource attachment and observation contracts without embedding controller recovery policy.
- `src/core/git-workspace.ts` should remain the default native-git resource provider, but resource allocation should be driven by lifecycle state instead of ad hoc replacement starts.
- `src/adapters/pi/*` and `src/adapters/opencode/*` should implement formal observation and prepared-resource joining for their harnesses.
- Recovery rules/playbooks belong to core controller policy, not adapter source code, unless a later reviewed change deliberately changes adapter observation semantics.

### Migration / Rollout

1. Add types, schemas, and store fields for lifecycle/resource/recovery records.
2. Introduce prepared-resource adapter capability while keeping legacy `startSession` compatibility.
3. Route Pi/OpenCode through the prepared-resource path behind a feature flag or compatibility shim.
4. Extract existing recovery branches into a default exception handler with equivalent decisions.
5. Add controller-model diagnostic and learned-rule proposal support for unclassified/repeated failures.
6. Switch the controller loop to lifecycle-first execution once parity tests pass.
7. Deprecate legacy resource-creating adapter starts after adapters and tests are migrated.

## Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Lifecycle state model is too large for one change | High | Implement additively and keep compatibility projections; split follow-up implementation if needed. |
| Controller-model diagnostics make recovery nondeterministic | Medium | Persist evidence/decision, prefer deterministic rules, require bounded actions and validation gates. |
| Generated rules could encode a bad recovery | High | Store generated rules with activation state, confidence, source evidence, and validation requirements. |
| Prepared-resource attach may not map cleanly to every harness | Medium | Keep adapter capability negotiation and legacy fallback during migration. |
| Reusing workspaces can preserve bad dirty state | Medium | Exception handler must inspect/record dirty state and may ask user or supersede resources with evidence. |

## Verification Plan

- Unit tests for lifecycle phase transitions and coarse status projection.
- Contract tests for adapter observations: result marker, blocked marker, protocol violation, runner error, runner lost, running, and idle.
- Exception-handler tests proving known recovery rules map to durable decisions without adapter policy branches.
- Recovery context tests proving same node retry does not allocate a new branch/worktree/session unless resources are explicitly superseded.
- Integration tests for Pi/OpenCode prepared-resource attach compatibility.
- Schema/store migration tests for lifecycle/resource/recovery records.
- `npm run check` after implementation.

## Load-Bearing Preservation Notes

- User decision that the adapter should be the standardized formal path → captured in D2 and spec requirements.
- User decision that a separate exception handler should own controller-prescribed recovery scripts → captured in D3.
- User decision that controller should create branch/worktree/session and subagent should join → captured in D1 and D5.
- User concern about too many hard-coded exceptions → captured in Why, D3, and migration plan.
- User desire to codify repeated pitfalls as new rules → captured in D4 with governance constraints.

# controller-subagent-lifecycle Specification

## Purpose

This capability defines how the controller, adapter, and subagent cooperate to execute a DAG node. It owns the formal node lifecycle, controller-owned resource preparation, adapter observations, exception-handler recovery decisions, and validation/integration gates that turn a subagent outcome into a terminal node state.

## Requirements

### Requirement: Controller-owned node lifecycle

Every DAG node executed by the orchestrated controller SHALL follow a controller-owned lifecycle before terminal closeout. The controller SHALL define acceptance conditions before creating resources, SHALL create or verify node resources before runner start, SHALL start/attach the runner through an adapter after resources are prepared, SHALL evaluate subagent outcomes before validation, SHALL run required validation and integration gates before completion, and SHALL record terminal closeout.

The lifecycle SHALL include phases equivalent to:

- `acceptanceDefined`
- `resourcesCreating`
- `resourcesReady`
- `runnerStarting`
- `runnerActive`
- `controllerJudging`
- `validating`
- `integrating`
- `terminal`

The runtime MAY keep existing coarse DAG node statuses as compatibility projections, but the detailed lifecycle phase SHALL be durable enough for recovery, audit, and monitor display.

#### Scenario: Node resources are prepared before runner start

- **GIVEN** a DAG node is schedulable
- **WHEN** the controller starts execution for the node
- **THEN** the controller records acceptance conditions before resource creation
- **AND** the controller creates or verifies the node branch, worktree, session identity/file, and model routing before asking the adapter to start or attach a runner
- **AND** the adapter receives the prepared execution context instead of creating node resources itself

#### Scenario: Coarse status remains compatible during migration

- **GIVEN** an existing monitor only understands coarse `GoalDagNode.status` values
- **WHEN** the detailed lifecycle phase is `resourcesCreating`, `resourcesReady`, `runnerStarting`, or `runnerActive`
- **THEN** the runtime exposes a compatible coarse status such as `ready` or `running`
- **AND** the detailed lifecycle phase remains available to lifecycle-aware code and recovery decisions

### Requirement: Subagents join controller-prepared resources

In the formal execution path, subagents and adapters MUST NOT create, switch, or delete node branches or worktrees. The controller SHALL provide prepared resource bindings. The adapter SHALL attach or start the harness runner against those bindings and SHALL return evidence of the attached session/runner.

A new branch or worktree for the same node MAY be created only when the controller explicitly supersedes the previous resource record with a durable reason and recovery decision.

#### Scenario: Runner attaches to prepared worktree

- **GIVEN** the controller prepared a worktree and branch for node `n1`
- **WHEN** the adapter starts the subagent runner
- **THEN** the runner uses the controller-provided worktree and branch
- **AND** no adapter code creates a second branch or worktree for `n1`

#### Scenario: Recovery does not duplicate resources by default

- **GIVEN** a node has a prepared worktree, branch, and session record
- **AND** its runner reports an abnormal condition
- **WHEN** the exception handler chooses a retry or restart action
- **THEN** the action reuses the existing worktree and branch unless the controller records an explicit supersession decision

### Requirement: Adapter formal observation contract

Adapters SHALL report normalized observations from the prepared execution context. Observations SHALL describe harness facts and formal protocol outcomes, not recovery policy decisions.

The observation contract SHALL include, at minimum, observations equivalent to:

- `runnerStarting`
- `running`
- `idle`
- `selfReportedComplete`
- `selfReportedBlocked`
- `protocolViolation`
- `runnerError`
- `runnerLost`
- `stopped`

Adapters MAY parse formal protocol markers such as `SUBAGENT_RESULT:` and `SUBAGENT_BLOCKED:`. Adapters MUST NOT decide model fallback, replacement strategy, retry limit handling, stale-session recovery, or terminal blocking for abnormal observations.

#### Scenario: Explicit result marker becomes formal completion observation

- **GIVEN** a subagent transcript contains `SUBAGENT_RESULT: implemented changes and tests passed`
- **WHEN** the adapter observes the prepared session
- **THEN** it reports `selfReportedComplete` with the summary text
- **AND** it does not mark the node complete
- **AND** the controller moves the node into controller judgment and validation

#### Scenario: Missing required marker becomes protocol violation

- **GIVEN** a subagent assistant message says the work is done but omits `SUBAGENT_RESULT:`
- **WHEN** the adapter observes the prepared session
- **THEN** it reports a `protocolViolation` or equivalent observation with evidence
- **AND** the exception handler, not the adapter, decides whether to send a follow-up prompt

#### Scenario: Runner loss is an observation, not a recovery decision

- **GIVEN** a prepared runner process is no longer live and the session has unresolved work
- **WHEN** the adapter observes the session
- **THEN** it reports `runnerLost` with evidence
- **AND** it does not create a replacement session or mark the node blocked on its own

### Requirement: Exception handler owns abnormal recovery

Abnormal observations SHALL be routed to a controller exception handler. The exception handler SHALL return a durable recovery decision before the controller executes recovery actions.

The exception handler SHALL support actions equivalent to:

- `sendPromptToSameSession`
- `restartRunnerSameSession`
- `restartRunnerSameWorktreeNewSession`
- `markNodeBlocked`
- `askUser`
- `invokeControllerModel`
- `proposeRecoveryRule`
- `supersedeResourcesAndRestart`

The handler SHALL consult deterministic recovery rules/playbooks before invoking a controller model. If a controller model is used, the model input evidence and selected decision SHALL be recorded.

#### Scenario: Known abnormal signature uses deterministic rule

- **GIVEN** an abnormal observation matches an enabled recovery rule
- **WHEN** the exception handler evaluates the observation
- **THEN** it returns the rule's bounded recovery decision
- **AND** records the matching rule id and evidence
- **AND** does not invoke the controller model for that decision

#### Scenario: Unknown abnormal signature asks controller model

- **GIVEN** an abnormal observation matches no enabled recovery rule
- **WHEN** the exception handler cannot safely choose a deterministic action
- **THEN** it MAY invoke a controller model diagnostic turn with bounded evidence
- **AND** it records the model decision before executing any recovery action

### Requirement: Repeated failures produce auditable recovery-rule proposals

When a normalized abnormal signature recurs above the configured threshold, the exception handler SHALL create or update an auditable recovery-rule/playbook proposal. The proposal SHALL include the signature, adapter id, observation kind, evidence samples, proposed decision, confidence or activation state, provenance, and validation requirements.

Generated rules SHALL be persisted as policy/playbook artifacts. They MUST NOT silently modify adapter or controller source code.

#### Scenario: Repeated pitfall becomes proposed rule

- **GIVEN** the same abnormal signature has occurred at least the configured number of times
- **WHEN** the exception handler completes diagnosis
- **THEN** it writes or updates a recovery-rule proposal
- **AND** records which goals/nodes/subagents supplied evidence
- **AND** exposes whether the rule is proposed, enabled, disabled, or awaiting review

#### Scenario: Generated rule requires governance

- **GIVEN** a generated rule proposes a recovery action
- **WHEN** project policy requires review before activation
- **THEN** the rule remains proposed and is not used for automatic recovery
- **AND** the monitor or ledger shows the pending rule id and activation state

### Requirement: Context-preserving recovery

Recovery decisions SHOULD preserve the current node context by reusing the controller-owned worktree, branch, and session when safe. A decision that discards or supersedes a session, worktree, or branch SHALL record why reuse was unsafe.

#### Scenario: Same-session follow-up preserves context

- **GIVEN** a subagent violates the completion protocol by omitting `SUBAGENT_RESULT:`
- **WHEN** the exception handler chooses `sendPromptToSameSession`
- **THEN** the controller sends a follow-up prompt to the existing prepared session
- **AND** keeps the same worktree and branch

#### Scenario: New session keeps same worktree

- **GIVEN** a runner session is unusable but the node worktree is intact
- **WHEN** the exception handler chooses `restartRunnerSameWorktreeNewSession`
- **THEN** the controller starts a new session bound to the same node worktree and branch
- **AND** records the previous session as recovery evidence

### Requirement: Completion remains controller validated

A `selfReportedComplete` observation SHALL NOT complete a node by itself. The controller SHALL run judgment, validation, and any required integration gate before marking the node `complete`. If validation or integration fails, the controller SHALL route the failure to follow-up, exception handling, blocked state, or another governed recovery decision.

#### Scenario: Completion requires validation and integration

- **GIVEN** a subagent reports `SUBAGENT_RESULT:` for a node that requires branch integration
- **WHEN** the controller receives the `selfReportedComplete` observation
- **THEN** it enters controller judgment
- **AND** runs configured validation
- **AND** runs required branch/worktree integration
- **AND** marks the node complete only after both gates succeed

#### Scenario: Blocked self-report is judged by controller

- **GIVEN** a subagent reports `SUBAGENT_BLOCKED:`
- **WHEN** the controller receives the `selfReportedBlocked` observation
- **THEN** it enters controller judgment or exception handling
- **AND** decides whether to recover, ask the user, or mark the node blocked with evidence

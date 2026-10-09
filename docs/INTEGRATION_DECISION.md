# AgentOS / Keichi Local integration decision

Confirmed by user: 2026-10-09 (Asia/Hong_Kong).
Decision: integrated user experience, separate repositories, services and databases.
Status: planning revision only; no application implementation, deployment or schedule activated.

## Ownership

| Capability | AgentOS | Keichi Local |
|---|---|---|
| Interaction | Hermes supervisor, pixel office, cross-project progress | Staff dashboard, classes, students and cases |
| Planning | Goal decomposition, specialists, dependencies and plan approval | Expose scoped school capabilities |
| Scheduling | Sole owner of business cron definitions, calendars and scheduled job triggers | Execute authorized school operations; no duplicate business scheduler |
| Student data | Correlation IDs and permitted metadata only | Sole authoritative student store, access policy and protected artifacts |
| School AI | Role prompts and task coordination | Calculations, evidence retrieval, IEP versions, questionnaire rules and reports |
| Approvals | Plan approval and unified approval presentation | Authoritative school data/document/cloud-payload/send approval state and enforcement |
| eClass/Excel/email | Request work, monitor and summarize | Connector, validated imports, exports and durable email outbox |
| Development | Codex, review, tests and deployment workflow | No second coding-agent orchestration system |

School specialist roles call Portal capabilities; they do not implement parallel analysis pipelines or store their own student datasets. Persona and execution engine are separate concepts.

## Job and approval contract

- AgentOS owns parent goals, dependencies, supervisor messages, schedule definitions and plan versions.
- Portal owns child operation records, execution leases/checkpoints, school authorization, artifacts and delivery state. Its worker queue is an execution mechanism, not a second supervisor or cron centre.
- Requests carry parentJobId, requesting staff identity, scoped capability and idempotency key. Portal returns operationId; events carry both identifiers and a unique event ID.
- Portal enforces staff scope independently; AgentOS never receives unrestricted database or filesystem credentials. Private student details stay in Portal, including supervisor context restrictions.
- The AgentOS dashboard presents Portal approval requests via permission-checked previews. One user action is recorded by the authoritative service; AgentOS records only its reference/status. Portal approval can also be handled in Portal and is reconciled back.
- Plan approval is separate from document/content or send approval. Approval binds exact version, payload and recipients. A single presentation layer does not remove distinct required decisions.
- Requests/replays with the same idempotency key reconcile to the same operation. Worker restart and uncertain email delivery must not trigger blind duplicate execution.
- Existing Portal task/approval features should be adapted to this contract where suitable, rather than rebuilt alongside them. AgentOS retains its own code-job approvals and existing non-Portal document workflows.

## Operation and rollout

Initially develop locally; later deploy both services on one validated Spark host, with separate databases, credentials and volumes. Provide linked interfaces and common school identity when available; each service still enforces its own permissions.

Portal remains usable for manual staff work when AgentOS is offline. New AgentOS business schedules wait until its recovery and follow their configured missed-run policy; the Portal outbox may finish an already approved accepted operation. Infrastructure health/backup maintenance is not a duplicate school business scheduler.

First integrated pilot: overnight attendance/homework collection → validated import → class summary → next-day staff approval → email. Validate end-to-end correlation, no duplicate jobs/sends, limited data access and recovery before IEP/APASO/wellbeing expansion.

## Acceptance checks

- One schedule fires one parent job and one idempotent Portal operation.
- Cross-service progress agrees after reconnect/replay; sensitive content does not enter AgentOS event logs or shared pixel views.
- Portal authorization rejects an out-of-scope request even when submitted by the supervisor.
- A Portal approval made through either UI has one authoritative record; changed content invalidates it.
- AgentOS offline does not prevent staff reading records or performing authorized manual work in Portal.
- No duplicate student schema, questionnaire scoring, email delivery engine or school business cron exists in AgentOS.

References: docs/AGENTOS_PLAN.md; Keichi Local plan maintained locally in docs/KEICHI_LOCAL_PLAN.md pending creation of its private repository.

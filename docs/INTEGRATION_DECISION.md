# AgentOS / Keichi Local integration decision

Confirmed by user: 2026-10-09 (Asia/Hong_Kong).
Decision: integrated user experience, separate repositories, services and databases.
Status: foundation and draft-only bridge merged and protected synthetic cloud acceptance passed. Teacher-only Portal entry was confirmed on 2026-10-13 and remains to be implemented; see docs/PORTAL_TEACHER_ENTRY.md and docs/VERCEL_TEST_DEPLOYMENT.md.

## Ownership

| Capability | AgentOS | Keichi Local |
|---|---|---|
| Interaction | Backend Hermes supervisor; operator/developer pixel console | Sole normal-teacher entry, supervisor conversation, tasks, progress, classes and cases |
| Planning | Goal decomposition, specialists, dependencies; consume verified Portal decision references | Display plans/steps and record teacher confirmations; expose scoped school capabilities |
| Scheduling | Sole owner of business cron definitions, calendars and scheduled job triggers | Execute authorized school operations; no duplicate business scheduler |
| Student data | Correlation IDs and permitted metadata only | Sole authoritative student store, access policy and protected artifacts |
| School AI | Role prompts and task coordination | Calculations, evidence retrieval, IEP versions, questionnaire rules and reports |
| Approvals | Enforce verified school decision references; separate development approvals | Sole school plan/step/content/cloud-payload/recipient/send confirmation UI, records and enforcement |
| eClass/Excel/email | Request work, monitor and summarize | Connector, validated imports, exports and durable email outbox |
| Development | Codex, review, tests and deployment workflow | No second coding-agent orchestration system |

School specialist roles call Portal capabilities; they do not implement parallel analysis pipelines or store their own student datasets. Persona and execution engine are separate concepts.

## Job and approval contract

- AgentOS owns parent goals, dependencies, supervisor messages, schedule definitions and plan versions.
- Portal owns child operation records, execution leases/checkpoints, school authorization, artifacts and delivery state. Its worker queue is an execution mechanism, not a second supervisor or cron centre.
- Requests carry parentJobId, requesting staff identity, scoped capability and idempotency key. Portal returns operationId; events carry both identifiers and a unique event ID.
- Portal enforces staff scope independently; AgentOS never receives unrestricted database or filesystem credentials. Private student details stay in Portal, including supervisor context restrictions.
- Normal teachers submit requests and make all school confirmations in Portal. Its authenticated request outbox delivers work to AgentOS; its decision relay sends version/hash-bound approval references back. AgentOS's console is for operators/developers, not teacher school approval. See docs/PORTAL_TEACHER_ENTRY.md for identity mapping and acceptance gates.
- Plan approval is separate from document/content or send approval. Approval binds exact version, payload and recipients. A single presentation layer does not remove distinct required decisions.
- Requests/replays with the same idempotency key reconcile to the same operation. Worker restart and uncertain email delivery must not trigger blind duplicate execution.
- Existing Portal task/approval features should be adapted to this contract where suitable, rather than rebuilt alongside them. AgentOS retains its own code-job approvals and existing non-Portal document workflows.

## Operation and rollout

Initially develop locally; later deploy both services on one validated Spark host, with separate databases, credentials and volumes. Teachers stay in Portal with their school identity; each backend independently enforces scope and verified actor mapping. No normal-teacher AgentOS login or redirect is required.

Portal remains usable for manual staff work when AgentOS is offline. New AgentOS business schedules wait until its recovery and follow their configured missed-run policy; the Portal outbox may finish an already approved accepted operation. Infrastructure health/backup maintenance is not a duplicate school business scheduler.

First integrated pilot: overnight attendance/homework collection → validated import → class summary → next-day staff approval → email. Validate end-to-end correlation, no duplicate jobs/sends, limited data access and recovery before IEP/APASO/wellbeing expansion.

## Acceptance checks

- One schedule fires one parent job and one idempotent Portal operation.
- Cross-service progress agrees after reconnect/replay; sensitive content does not enter AgentOS event logs or shared pixel views.
- Portal authorization rejects an out-of-scope request even when submitted by the supervisor.
- All school approvals are made in Portal with one authoritative record; changed plan/scope/content/recipients invalidate the affected decision. Direct AgentOS operator action cannot replace teacher approval.
- AgentOS offline does not prevent staff reading records or performing authorized manual work in Portal.
- No duplicate student schema, questionnaire scoring, email delivery engine or school business cron exists in AgentOS.

References: docs/AGENTOS_PLAN.md; docs/PORTAL_TEACHER_ENTRY.md; separate private minglo94/keichi_local repository and its Portal-only teacher-entry specification.

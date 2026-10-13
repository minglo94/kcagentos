# Portal-only teacher workflow — confirmed 13 October 2026

This decision supersedes earlier school-workflow designs that required teachers to sign in to AgentOS or approve school plans in its dashboard. It is a target specification; the deployed synthetic pilot still uses the earlier AgentOS entry and has not implemented this workflow.

## User experience and authority

Normal teachers use Portal only: submit a request, review the proposed steps, confirm or reject individual required actions, review drafts, approve content/recipients and authorized sending, pause/cancel work, and see progress/results there. They do not need an AgentOS account, URL or second approval screen. Requests for clarification and errors return to the Portal task page and notification inbox.

AgentOS is the backend supervisor and sole business scheduler. Its dashboard is an operator/developer console for system health, orchestration and development jobs. Operator access does not grant authority to approve a teacher's school operation. Portal is the teacher-facing approval authority and retains school data, scope checks, artifacts and outbox.

Plan/step confirmation, content approval and send approval remain separate, explicit decisions when required. All are presented and recorded in Portal. AgentOS consumes verified references to those decisions; it cannot infer approval from a chat message, service token, operator click or completed parent job. Existing policy may allow a constrained draft-only step without additional approval, but Portal must define that rule and show it to the teacher; a broad approval never silently covers changed scope or later sending.

## Request, progress and approval protocol

1. Portal authenticates the teacher and validates the capability, class/source/date scope. It stores a durable request plus outbound delivery record before contacting AgentOS. The request contains opaque references and permitted metadata, not student rows or private case content.
2. A separately authenticated Portal-to-AgentOS endpoint creates one parent job for the Portal request ID/idempotency key. Service authentication and the original teacher's scope are distinct; callers cannot choose arbitrary staff mappings. The existing single-actor test pairing must be replaced by a verified multi-user mapping before teacher rollout.
3. AgentOS returns its parent job ID and a versioned plan with clear steps, effects, required decisions and acceptance checks. Portal stores and displays the plan. Teacher confirmation binds the exact plan version/hash, action, scope, approver and decision ID.
4. Portal delivers the decision through an authenticated server-to-server endpoint. AgentOS validates the decision's issuer, audience, expiry, nonce, actor mapping, job ownership and version/hash, then atomically records its reference and queues only permitted work. Duplicate delivery returns the same result; stale decisions are rejected. The browser never receives service credentials.
5. AgentOS calls scoped Portal capabilities. Portal rechecks current role/class scope and any required step/content/send decision at execution time. Changes to scope, plan, content or recipients invalidate the corresponding approval and return the teacher to Portal confirmation.
6. A versioned event/reconciliation channel updates the Portal task timeline, including waiting-for-confirmation, executing, draft ready, failed, unknown result and complete. Events bind Portal request ID, AgentOS parent job ID, child operation ID and unique event ID. Duplicates/out-of-order updates cannot regress terminal state. A polling fallback reconciles lost callbacks.
7. Portal owns action confirmation and pause/cancel requests. AgentOS stops new eligible work and reports what was already accepted; cancellation cannot undo an accepted Portal operation or imply an email was recalled. Unknown delivery results are reconciled rather than blindly repeated.

For scheduled work, AgentOS creates the parent job from a Portal-authorized template and sends required decisions to Portal. Approval of a schedule is version/scoped and does not remove separately required content or sending checks.

## Availability and rollout

Portal remains usable when AgentOS is offline. A durably queued request displays waiting for the supervisor and is delivered once after recovery. Teachers can still read records and perform permitted manual work. Local/Spark workers must be qualified before unattended schedules; Vercel dashboard deployment is not a persistent worker.

Implementation order: Portal task page/request outbox → AgentOS authenticated ingress and multi-user mapping → versioned plan/decision relay → progress reconciliation → Portal action controls → synthetic acceptance → authorized real pilot. Preserve the existing draft-only reference receiver; it is the AgentOS-to-Portal execution leg, not the teacher request ingress. Reuse current Portal approvals/outbox where appropriate and do not add a second supervisor or business cron.

## Acceptance

- A normal teacher completes submission, all required confirmations and result review entirely in Portal; no AgentOS login or redirect.
- Direct AgentOS dashboard/teacher mutation access is denied to normal teachers; operator access cannot authorize school actions.
- Cross-teacher/class requests, forged decision references and expired/replayed/stale approvals are rejected independently by both services.
- Unapproved or changed steps cannot execute. Current plan approval cannot replace content/recipients/send approval.
- Concurrent submission/decision delivery and reconnect produce one parent job, one decision and one scoped child operation; unknown results never cause blind duplicate sending.
- Portal displays accurate progress and evidence after reload/outage; student details stay in Portal and browser/service secrets never cross into public logs.

No new runtime endpoint, access restriction, approval relay or schedule is implemented merely by recording this specification.

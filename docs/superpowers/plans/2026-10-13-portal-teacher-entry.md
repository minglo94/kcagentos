# Portal-only Teacher Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. User has approved the written Portal-only design and explicitly requested implementation with Superpowers; do not repeat that approval gate.

**Goal:** Teachers complete the first class-summary draft workflow, including plan/action confirmation and progress/control, entirely inside Portal.

**Architecture:** Portal owns authenticated teacher requests and decisions plus durable outbound delivery. AgentOS accepts signed, mapped server requests, orchestrates existing fixed draft plans, and exposes a scoped monotonic snapshot. Portal consumes snapshots and sends version/hash-bound decisions; the existing reference-only execution leg gains explicit multi-user mapping without broad delegation.

**Tech Stack:** Next.js, TypeScript/Zod, Prisma/PostgreSQL, existing Auth.js/NextAuth, Node tests, Playwright.

**Spec:** docs/PORTAL_TEACHER_ENTRY.md (both repositories).

## Global Constraints

- Normal teachers use Portal only; AgentOS console is ADMIN/operator-only and cannot authorize school jobs.
- Portal remains authoritative for plan/action, content, recipient and send decisions. First executor is draft-only; no sending, live data, model or business cron.
- Student rows and private free text stay in Portal. Only class/source/date references and permitted status cross the bridge.
- Verified mapping is operator-provisioned, active and checked against current roles on both sides. No auto-user provisioning or caller-chosen AgentOS identity.
- Signature binds issuer/audience/subject/method/path/exact body/timestamp/nonce. Durable nonce rejects replay; each legitimate delivery retry has a new nonce.
- Immutable request/decision IDs and hashes, version-bound approvals, fenced leases and monotonic snapshots. Never infer approval or blindly repeat unknown side effects.
- Preserve Portal's committed P0–P3 work at e7aee17; isolated branch only. Preserve existing pinned v1 mode; mapped mode is explicit and fail-closed.

## Review Focus

1. Role/mapping revoked after queueing must stop delivery/execution, including signed but no longer eligible actors.
2. A lost creation/decision reply must reconcile without a second parent/approval/child; conflicting ID reuse returns 409.
3. Out-of-order snapshot, stale version/hash and cancel-versus-worker races cannot authorize or regress state.
4. Operator browser mutations and direct teacher requests cannot bypass Portal authority.
5. Partially unavailable AgentOS must leave a durable waiting/retry state without blocking Portal's manual work.

## Shared protocol (Task 0; root ownership)

Create equivalent `src/lib/office/teacher-contract.ts` (AgentOS) and `src/lib/agentos-teacher/contract.ts` (Portal). Export schemas/types `TeacherRequest`, `TeacherDecision`, `TeacherCommand`, `TeacherSnapshot`, normalized hash helpers and service assertion schema. Request includes requestId, actor (Portal staff ID), workflowVersion=1, capability=class.daily-summary.draft, input={classRef,sourceBatchRef,date}. Decision includes decisionId/requestId/actor/version/hash/approve|reject. Command includes commandId/requestId/actor/version/hash/pause|resume|cancel|refresh. Snapshot includes requestId/jobId/revision/status/planVersion/planHash/approvedVersion, fixed plan steps, redacted Portal operation evidence and bounded event metadata. No free text input or arbitrary executors.

Exact AgentOS routes: POST `/api/portal/v1/requests`; GET `/api/portal/v1/requests/{requestId}`; POST `/api/portal/v1/requests/{requestId}/decisions`; POST `/api/portal/v1/requests/{requestId}/commands`. Headers Authorization Bearer, X-Portal-Assertion/base64url and X-Portal-Signature/HMAC. Issuer `keichi-local`; trusted configured AgentOS origin, ±60 seconds and UUID nonce. POST decisions/commands also require exact matching request ID/actor. Max request 8KiB and snapshot 64KiB; no redirects. Config disabled unless `PORTAL_INGRESS_ENABLED=true`; `PORTAL_INGRESS_SERVICE_TOKEN`≥48, `PORTAL_INGRESS_ASSERTION_SECRET`≥32, trusted public AgentOS origin `PORTAL_INGRESS_ORIGIN`. Portal outbound config `AGENTOS_TASKS_ENABLED`, `AGENTOS_BASE_URL`, `AGENTOS_SERVICE_TOKEN`, `AGENTOS_ASSERTION_SECRET`; optional protected Vercel bypass restricted to HTTPS *.vercel.app.

- [x] Write contract rejection/hash normalization tests, observe RED, implement schemas, observe GREEN; parity test across repositories.

## Task 1: AgentOS ingress, decision authority and operator gate

**Owner:** AgentOS implementer. Files: new `src/lib/office/teacher-ingress.ts`, `teacher-auth.ts`, routes above; Prisma schema/additive `20261013000100_teacher_entry`; modify office HTTP/page/API authority gates and outgoing Portal mapping checks as needed. Preserve tests and existing store/worker invariants.

**Interfaces:** `makeTeacherHandlers(db, env)` exposes create/snapshot/decision/command testable Request handlers. Operator-provisioned `PortalTeacherMapping` binds issuer/Portal staff ID to active AgentOS user. Durable request link binds request hash and parent job; nonce/decision/command ledgers fence replay and duplicate delivery. Existing Worker uses mapped job owner and Portal execution client.

- [x] RED tests: bad/expired/wrong-audience signatures, nonce replay, unmapped/revoked teacher, concurrent immutable request IDs and cross-owner snapshot.
- [x] GREEN ingress creates fixed draft job atomically, returns strict snapshot; same ID+hash reconciles, changed ID contents conflict.
- [x] RED/GREEN decision and command tests: no approval no execution, exact version/hash, duplicate decision no second record, stale/forged and conflicting decision rejected, cancel fences worker; snapshot monotonic and redacted.
- [x] RED/GREEN role tests: teacher page/API denied, ADMIN operator can monitor own development work but cannot approve/control Portal school jobs through browser endpoints. Update older browser acceptance to ADMIN development jobs instead of teacher school approval.
- [x] Run npm test/typecheck/lint and commit. Store diagnostics report RED/GREEN and exact changed interfaces.

## Task 2: Portal teacher task UI, durable relay and mapped execution receiver

**Owner:** Portal implementer, C:/Users/CMLO/keichi-portal-bridge only. Files: new `src/lib/agentos-teacher/{client,store,http}.ts`, `/api/teacher/agentos-tasks` and `/{id}`/actions, `/teacher/agentos-tasks` page/client; new tables/migration `202610130002_teacher_tasks`; narrow teacher layout/dashboard/middleware additions; reference receiver mapping adaptation.

**Interfaces:** `makeTeacherTaskHandlers(db, deps)` has injectable authenticated actor/client for HTTP/native tests. Durable `AgentosTeacherTask` owner/input/request/snapshot state and immutable `AgentosTeacherDecision`/command records retain pending delivery. `AgentosStaffMapping` maps active local teacher to unique AgentOS subject for execution in explicit mapped mode. Browser POST only supplies class/source/date/idempotency key; actor comes from current Portal session+DB. Actions approve/reject/pause/resume/cancel/refresh include version/hash; outbound records are persisted before network. Retries are explicit current-teacher calls and use same immutable IDs. Polling reconciliation fetches snapshot, preserving higher revision and accepted uncertain decisions. No business scheduler.

- [x] RED tests: exact Origin, anonymous/role denial, source ownership/class scope, rejection of non-synthetic offline contract, two teachers isolated and mapping revoked.
- [x] GREEN create/list/detail/action handlers preserve durable offline waiting state and scoped snapshots. Source must be owned synthetic daily-summary/1 with matching class/date; derive actor server-side. Outbound signed transport bounded and no redirects.
- [x] RED/GREEN outage and replay tests: dropped creation/decision replies retain IDs, reloaded task can retry/reconcile; stale approvals and snapshot regressions fail; repeated submit creates one task.
- [x] RED/GREEN receiver mapped mode: mapped subject resolves current local teacher and source owner, never trusts a request staff ID/email; missing/revoked mapping fails; pinned mode regression suite still passes.
- [x] UI uses Portal navigation only: submit source references, clear plan/step approval, decision rejection, progress/evidence, retry/reconcile, pause/resume/cancel, and link Portal-local draft for existing content/send confirmations. No AgentOS redirect and no service credentials/browser errors. Scope limitation clearly shown for synthetic draft pilot.
- [ ] Run npm test/typecheck/lint/build and commit, preserving P0–P3 gates/features.

## Task 3: Cross-service qualification, review and handover

**Owner:** root integration/tests/docs; no edits to worker-owned files until they finish.

- [x] Real HTTP actual clients/handlers with native disposable databases: two mappings, submit→Portal plan approval→controlled Worker→draft→Portal progress; cross-teacher access rejected; dropped replies, stale approval, offline retry and cancel race.
- [ ] Browser on Portal alone: login, request, approve exact action, status/reload/evidence, controls and second-user isolation. AgentOS teacher console denied. Synthetic only; no real mail.
- [ ] Full relevant tests/typecheck/lint/build, exact database migration and protocol parity checks; fresh spec+quality review per task and whole branch, fix material findings with RED→GREEN.
- [ ] Update tasks/todo/handover/lessons/CURRENT_STATUS, both GitHub plans and Portal chat; create reviewable PRs and attach. Deployment/merge use existing user authorization only after tests/review, with exact project identity checks and no secrets in commits.

Review and rulings tracked in this plan's `.superpowers/sdd/` ledger. Existing approved design/user request is implementation authorization; this plan resolves routine interface details, not a new approval requirement.

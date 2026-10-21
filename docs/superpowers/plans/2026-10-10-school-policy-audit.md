# School Policy and Task Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make task execution auditable and reject school execution paths that lack approved local routing or data access controls.

**Architecture:** A server-created policy context follows each invocation, and a durable attempt journal wraps model/tool calls and worker steps. Sensitive payload storage is separate from public progress events. Start with synthetic qualification; live student processing remains disabled until protected storage and host isolation are qualified.

**Tech Stack:** Existing Next.js 15, TypeScript, Prisma 5, PostgreSQL, Node test runner and Playwright. No new orchestration framework.

**Spec:** `docs/SCHOOL_DATA_POLICY_DESIGN.md`, approved by the user's “Ok” on 2026-10-10.

## Scope and later plans

This first stage covers policy, audit persistence, existing task entry points, local-model routing and administrator inspection. It produces working software that fails closed for unsupported sources. Controlled NAS adapters, Portal PostgreSQL/vector queries, and host isolation need separate implementation plans with their own acceptance evidence. They are not implicitly implemented by the policy types below. Scheduling and full Pixel remain separate milestones.

## Global Constraints

- “Default school and unknown-data tasks to restricted.”
- “Clients and models cannot downgrade classification; derived summaries remain restricted.”
- “Restricted tasks require an administrator-configured local runtime/model and local embeddings, with no cloud fallback.”
- “Portal-owned student payloads stay in Portal-controlled storage.”
- “Persist input before invocation; stop if audit storage fails.”
- “Persist output before marking success.”
- “AgentOS administrator status does not override Portal permissions.”
- No secrets, private addresses or student fixtures enter Git. No actual business schedule or deployment activation.

## Review Focus

- A forged team/classification or engine URL cannot change server policy (Task 1).
- A streaming disconnect or audit write failure cannot report successful completion (Tasks 2–3).
- A stale worker finishing after recovery cannot overwrite a newer attempt or publish success (Task 3).
- An administrator revoked after opening the page cannot read another payload (Task 4).
- A legacy helper, Pusher event or document path cannot bypass restrictions or disclose task content (Tasks 1, 3, 5).

## File responsibilities and interfaces

Create `src/lib/task-policy/policy.ts` for immutable policy context and capability decisions; `src/lib/task-policy/local-model.ts` for configured inference destinations; `src/lib/task-audit/store.ts` for durable attempts; `src/lib/task-audit/payloads.ts` for protected artifact storage; and `src/lib/task-audit/invoke.ts` for invocation lifecycle.

`ExecutionPolicy` contains `version: 1`, `actorId: string`, `classification: 'restricted' | 'development'`, `sourceIds: readonly string[]`, and `outputRootId: string | null`. Only server code creates it after authentication. Development selection requires a server-authorized development workspace; a request's team label is not sufficient.

`Capability` is `'localInference' | 'cloudInference' | 'onlineSearch' | 'browser' | 'arbitraryHttp' | 'externalPublish' | 'codexReadonly' | 'sourceRead' | 'outputWrite' | 'portalQuery'`.

`resolvePolicy(actorId: string, workspaceId?: string): Promise<ExecutionPolicy>` rechecks active identity and configured workspace authorization. `assertCapability(policy: ExecutionPolicy, capability: Capability): void` throws a stable `POLICY_DENIED` error. Initially source/output/Portal capabilities are disabled until their adapters are implemented and configured; restricted Codex and external capabilities always deny.

`PayloadStore.put(attemptId: string, direction: 'input' | 'output', sequence: number, content: Uint8Array): Promise<{ ref: string; sha256: string; bytes: number }>` writes immutable artifacts; `read(ref: string): Promise<Uint8Array>` only runs after server authorization. The initial implementation supports protected local synthetic artifacts, not Portal student payloads. Use exclusive files under a private root with restrictive permissions, generated names, no user paths, no symlink following, and reject an unconfigured root. Live Portal payload handling stays disabled.

`beginAttempt(db, input: AttemptInput): Promise<{ id: string }>` persists input reference before dispatch. `appendOutput(db, attemptId: string, sequence: number, content: Uint8Array): Promise<void>` persists ordered output chunks before they are emitted. `finishAttempt(db, attemptId: string, status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED' | 'DENIED', errorCode?: string): Promise<void>` finalizes once, with lease fencing when attached to an Office worker.

`AttemptInput` contains policy, actor/job/step/parent IDs, generated invocation key, executor/model, input bytes and optional worker lease token/plan version. Parent and job IDs are nullable for standalone chat. Never accept raw context or lease tokens from request JSON.

## Task 1: Server policy and local routing

**Files:** Create the two task-policy modules and `tests/task-policy.test.ts`; modify `src/lib/llm.ts`, `src/lib/office/hermes.ts`, `src/lib/office/readonly.ts`, and `.env.example`.

- [ ] Write tests asserting restricted/unknown defaults; client team and classification cannot grant development access; cloud/search/Codex throw POLICY_DENIED before adapter invocation; missing local configuration returns LOCAL_MODEL_NOT_CONFIGURED; supplied base URLs are rejected.
- [ ] Run `node --import tsx --test tests/task-policy.test.ts`; confirm intended failures.
- [ ] Implement the interfaces above. Local routing uses only protected server configuration and an explicit model ID. First-stage destinations are loopback IP literals with no URL credentials, query or fragment; redirects are rejected. LAN model support waits for network-isolation qualification. Remove Claude as the chat default and avoid eagerly constructing a cloud SDK for local-only execution. Pass policy explicitly through model adapters; no permissive default for missing context.
- [ ] Rerun focused tests and `npm run typecheck`; expected success. Include a synthetic redirect server to prove no redirected request is sent.
- [ ] Commit code/tests and matching todo/handover evidence.

## Task 2: Durable attempt and payload records

**Files:** Modify `prisma/schema.prisma`; create additive migration `prisma/migrations/20261010000000_task_audit/migration.sql`, the three task-audit modules, and `tests/task-audit.test.ts`; update `tests/helpers/auth-db.ts` migration fixture loading as necessary.

- [ ] Write tests: input storage failure invokes the service zero times; duplicate invocation key creates one attempt; output chunks retain ordering and digest; failed output persistence cannot yield SUCCEEDED; terminal state cannot be overwritten; payload read errors expose no host path. Verify exclusive file creation and symlink refusal.
- [ ] Run `node --import tsx --test tests/task-audit.test.ts`; confirm intended failures.
- [ ] Add TaskAttempt with unique invocation key, parent/job/step correlation, actor, policy snapshot, executor/model, timestamps, terminal status, error code and optional lease/version fence. Add ordered artifact-reference records with unique attempt/direction/sequence. Do not cascade-delete audit history when a transient legacy task is removed. Do not store raw payloads in OfficeEvent or AuditLog.
- [ ] Implement durable invocation wrappers. Use 64 KiB chunks and an initial 8 MiB total input/output limit per attempt; reject oversized input before invocation and terminate oversized output with explicit partial status. These are implementation defaults, not inferred school retention policy. Persist only task content, never HTTP headers, environment or connector configuration. Reject known credential-bearing structured fields; do not claim arbitrary free text can be perfectly secret-redacted.
- [ ] Run focused tests and typecheck; expected success. Qualify immutable synthetic artifacts without claiming encryption or Portal storage deployment is complete.
- [ ] Commit migration, implementation and evidence.

## Task 3: Worker, chat and manual-evidence coverage

**Files:** Modify `src/lib/office/worker.ts`, `src/lib/office/store.ts`, `scripts/office-worker.ts`, `src/app/api/chat/route.ts`, `src/lib/agent-tools.ts`, `src/app/api/jobs/[id]/evidence/route.ts`; add `tests/task-execution.test.ts`; extend `tests/office-postgres.ts`.

- [ ] Write tests for dispatcher-only replies, specialist/tool rounds, manual evidence, failed planning, cancellation and retry: each retains its own input/output attempt. A stream disconnect aborts execution and preserves partial output. Simulate recovery followed by stale completion; assert no success publication and no mutation of the replacement attempt.
- [ ] Run focused tests; confirm intended failures.
- [ ] Thread server policy and attempt IDs through all listed paths. Journal each actual model prompt/tool request and result before exposing completion. Fence worker finalization with live job lease and approved version in the same transaction as status changes. Keep terminal attempts when temporary legacy tasks are deleted. Recover unfinished attempts explicitly; standalone chat uses a persisted deadline and marks expired open attempts interrupted during recovery.
- [ ] For restricted tasks, disable legacy database-document retrieval and tool sources until approved-source adapters exist. Stop content-bearing Pusher notifications and sanitized error logging must exclude raw exceptions/payloads. Preserve authenticated direct response streaming, journaling each chunk first. Deny real student activation until protected payload storage is qualified.
- [ ] Run focused tests, `npm test`, Python bridge tests and guarded `npm run test:postgres`; expect no regression plus the new crash/fencing assertions. Use only the existing disposable PostgreSQL target, never production.
- [ ] Commit implementation and precise test evidence.

## Task 4: Administrator audit inspection

**Files:** Create `src/app/api/admin/task-audits/route.ts`, `src/app/api/admin/task-audits/[id]/route.ts`, `src/app/api/admin/task-audits/[id]/payload/route.ts`, `src/app/admin/task-audits/page.tsx`, `src/app/admin/task-audits/audit-client.tsx`, and `tests/task-audit-browser.ts`.

- [ ] Write browser assertions: teacher list/detail/payload access denied; active admin sees synthetic attempts and input/output; disabled or revision-revoked admin is denied on the next request; expired/missing content is clearly marked; HTML in model output is rendered as text.
- [ ] Run `node --import tsx tests/task-audit-browser.ts`; confirm intended failures.
- [ ] Implement fresh active-admin checks on every request, bounded pagination (50 records), filters for job/status/time, no-store responses and an inspection audit record before returning payloads. Show input/output tabs, model, timestamps, partial/interrupted status and correlation links. Return protected Portal references as unavailable until Portal independently authorizes resolution; do not proxy arbitrary URLs. Do not implement bulk export in this stage.
- [ ] Rerun browser test, typecheck and build sequentially; expected success. Add the command to package.json.
- [ ] Commit UI/API/tests and evidence.

## Task 5: Entry-point audit and rollout gate

**Files:** Update `docs/SCHOOL_DATA_POLICY_DESIGN.md`, `docs/PHASE2_STATUS.md`, `docs/SPARK_DEPLOYMENT.md`, `tasks/todo.md`, `tasks/handover.md`; create `docs/TASK_POLICY_COVERAGE.md` and `tests/task-policy-coverage.test.ts`. Inspect all routes under `src/app/api`, plus `src/lib/gdrive.ts`, `src/lib/gcal.ts`, `src/lib/notify.ts` and `src/lib/schedule.ts`.

- [ ] Build a coverage table of every task-creating, model-calling, source-reading and external-writing entry point: policy check, attempt capture, or explicit restricted-mode denial. Include document generators, approvals, notifications and weekly-summary cron; an unlisted route is not presumed safe.
- [ ] Add executable tests for each external effect found: a restricted invocation cannot call the outbound stub; missing context fails closed; rejection does not emit raw content. Fix uncovered paths before claiming coverage. Add retention configuration validation: live activation refuses absent storage/retention/isolation qualification; no made-up default retention enables real student processing.
- [ ] Run full Node, Python, PostgreSQL and relevant browser suites, then typecheck/lint/build. Rehearse additive migration against existing synthetic records. Record failures and limits rather than claiming host isolation from application tests.
- [ ] Self-review against the approved spec: record the unimplemented controlled-file adapter, scoped Portal query adapter, protected Portal payload resolver, retention purge and OS egress/mount tests as later-stage gates. Prepare their plans only against verified private configuration/contracts.
- [ ] Commit and push the milestone to codex/agentos-phase2; keep PR #14 draft. No merge, live migration, deployment, school data or schedule activation.

## Plan review result

This stage covers enforceable application policy and synthetic task auditing, including legacy entry points. It deliberately blocks unsupported restricted operations. It does not satisfy the full live-school acceptance definition; remaining subsystem plans and service configuration are explicit above. Continue inline using the previously established native execution method after written-plan review.

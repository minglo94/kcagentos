# Portal teacher entry — implementation and qualification

Status on 13 October 2026: implemented on `codex/portal-teacher-entry`; final browser/build qualification underway. This document does not certify deployment or live school use.

Teachers use `/teacher/agentos-tasks` in Portal. They choose an owned synthetic daily-summary source, review the exact plan steps, confirm them, and see draft progress/evidence. Content, recipients and sending remain separate Portal approvals. The AgentOS browser is an operator interface; school approvals and controls cannot be substituted there.

## Server configuration

AgentOS requires `PORTAL_INGRESS_ENABLED=true`, exact `PORTAL_INGRESS_ORIGIN`, `PORTAL_INGRESS_SERVICE_TOKEN`, `PORTAL_INGRESS_ASSERTION_SECRET` and Ed25519 PEM `PORTAL_SCOPE_PUBLIC_KEY`. The existing outgoing execution bridge must point to the intended Portal origin with its separate service/assertion credentials.

Portal requires `AGENTOS_TASKS_ENABLED=true`, exact `AGENTOS_BASE_URL`, matching `AGENTOS_SERVICE_TOKEN`/`AGENTOS_ASSERTION_SECRET` and Ed25519 PEM `AGENTOS_SCOPE_PRIVATE_KEY`. Only Portal receives the private key. Configure `AGENTOS_BRIDGE_IDENTITY_MODE=mapped` and the existing execution service/assertion credentials plus exact `AGENTOS_BRIDGE_AUDIENCE_ORIGIN`. Keep browser credentials and service credentials separate. Vercel protection bypasses, if needed, remain server secrets and are restricted to HTTPS Vercel destinations.

Apply AgentOS migration `20261013000100_teacher_entry` and Portal migration `202610130002_teacher_tasks`. Explicitly provision active per-user mappings in both databases: AgentOS `PortalTeacherMapping` binds Portal staff ID to its AgentOS user; Portal `AgentosStaffMapping` binds local staff to that AgentOS subject. Missing/revoked mappings or current staff/class/source authority fail closed. Enabling an environment flag does not provision a mapping.

Transport authentication and effect authorization are distinct. Every create/decision/control POST requires a fresh Portal Ed25519 proof binding the purpose and canonical immutable payload hash, valid for at most120 seconds. The proof is refreshed on authorized retry while durable IDs/hashes remain stable. GET progress reads perform no creation, approval or control replay. A page shares a five-second remote-read budget; cached progress is labeled and still subject to live Portal scope checks.

## Evidence so far

- AgentOS52 automated cases, typecheck and lint passed; one inherited lint warning.
- Portal45 automated cases, workflow acceptance scripts, typecheck and lint passed; two inherited lint warnings. Focused teacher-handler12 cases include20 offline cached tasks within a shared deadline.
- Actual native PostgreSQL, two HTTP services and real signed clients passed Portal submission/approval, dropped replies, teacher isolation, stale decisions, pause/resume/cancel, mapped draft/evidence, monotonic revisions and mapping revocation. No sending occurred.
- Actual AgentOS browser acceptance passed normal-teacher console/API denial and operator development behavior.
- Independent reviews identified and confirmed fixes for effect scope authorization, revoked-class list disclosure, missing progress reconciliation and offline read delay.

The native tests run only against independently provisioned synthetic databases with guarded names. Raw connection strings, accounts, signing keys and screenshots remain ignored private artifacts. `tests/teacher-pair.ts` provides the reproducible cross-service acceptance entry point; it requires explicitly selected synthetic databases. Browser and final build results will be appended after qualification.

## Remaining rollout limits

The first capability accepts owned `daily-summary/1` sources explicitly marked synthetic, with matching class/date/version/hash. It rejects the real offline CSV `daily-export/1` contract. This is not a live attendance import or mail integration. Persistent Worker hosting, local inference, Google OAuth, complete pixel animation and business cron require separate qualification. Hermes memory/Skills learning is a proposal described in `HERMES_LEARNING_PLAN.md`.

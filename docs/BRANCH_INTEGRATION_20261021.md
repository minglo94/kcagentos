# Branch integration and safe upgrade — 21 October 2026

## Scope and inventory

User authorized merging all project GitHub branches into main. This AgentOS integration starts from main `ae1cd3b` and merges the only branch with unique work, Phase 2. No branch deletion, production deployment, real student activation or sending is part of this change.

| Remote branch | Inventoried tip | Already ancestor of starting main? | Unique commits |
|---|---|---|---:|
| claude/phase-1-task-list-yv3nz9 | 75bfd4affb7502d15210d2243abb43561289f231 | Yes | 0 |
| codex/agentos-foundation | 24c4004953e208c23719b90664a7ceb3a084fbcf | Yes | 0 |
| codex/portal-teacher-entry | caf5c7913ff6eed10332ce2d393097972963c393 | Yes | 0 |
| codex/agentos-phase2 | fedb88b6d85a807824819b10f4eff5626100787c | No | 15 |

The Phase 2 merge makes all inventoried tips ancestors of the integration commit; GitHub main verification remains a separate publication step. Existing unrelated browser edits are preserved in the root-managed stash.

## Conflict decisions

- Authentication combines explicit local/verified AD providers and absolute lifetime/revision revocation with main's protected synthetic test provider. `getIdentitySession` remains available for explicit teacher rejection; `getSession` exposes only active ADMIN operators. Teachers continue using Portal only.
- School approvals, weekly summary and notification endpoints retain main's closed Portal-authority behavior. Phase 2's dormant direct WhatsApp sending implementation is not restored. Browser job mutation guards remain in main's routes.
- Worker/store combine Phase 2 synthetic policy hashes, mandatory audit attempts, protected file scopes and claim recovery with main's scoped signed Portal execution, durable operation ledger, heartbeat cadence, live lease/status fencing and version-bound decisions.
- Teacher transport token/HMAC, independent Ed25519 authority proofs, atomic nonces and current issuer/staff mappings remain enforced. Portal draft results are persisted independently before audit/parent completion, so revocation, cancellation or audit expiry cannot erase an accepted receipt.
- Schema/migrations are additive unions: local credentials/directory identities/login budgets and task audits coexist with Portal operations, teacher mappings, requests, decisions and commands. Fixture migrations include all seven migrations.
- Main's ESLint, XML parser, ZIP/document protections and dependency repair remain. Phase 2 adds ldapts and moves tsx into runtime dependencies for the Worker image. Its document compatibility test now exercises the actual bounded XML parser, avoiding a second parser dependency.
- Deployment/demo/controlled-file assets remain synthetic qualification tools. They do not authorize production activation. Main's Portal teacher browser qualification is still pending.

## Linux requirement and existing deployments

Task execution and audited job creation require Linux (including WSL/Linux), Node >=22.13, `AGENTOS_TASK_DATA_MODE=synthetic`, and an existing canonical audit directory outside the application checkout, owned by the service account and mode 0700. Configure `AGENTOS_AUDIT_ROOT` to that absolute Linux path. Controlled files additionally depend on `/proc/self/fd`; their configured input/output/audit roots must not overlap.

Native Windows cannot satisfy these POSIX storage guarantees and fails closed. Windows editing, typechecking and production bundling remain possible; a successful Windows build is not worker/runtime acceptance. Use Linux Node, npm and Prisma engines in a Linux filesystem checkout; do not reuse Windows node_modules or a `/mnt/c` audit directory. Optional local inference still requires the explicit loopback model URL/name; no model is supplied.

Example synthetic Linux setup (supply private database/pairing configuration separately):

```sh
npm ci
export AGENTOS_TASK_DATA_MODE=synthetic
install -d -m 700 "$HOME/.local/share/agentos-audit"
export AGENTOS_AUDIT_ROOT="$HOME/.local/share/agentos-audit"
npm run db:migrate
npm run office:worker
```

Existing protected Vercel test deployments retain their earlier immutable code. This merge does not deploy a new runtime or make ephemeral serverless storage suitable for the persistent audit Worker.

## Legacy Portal jobs: explicit requalification

The new additive task-audit migration intentionally leaves legacy jobs with a null policy hash. Old approvals cannot silently authorize a new policy. Approval/dispatch reports `LEGACY_POLICY_REQUALIFICATION_REQUIRED` until an operator reviews the job.

For a mapped fixed-template school Portal job with no operation ever attempted:

1. Stop/drain its Worker and confirm no lease remains. Do not clear a live lease manually.
2. Preview `npm run portal:requalify -- --admin ADMIN_USER_ID --job JOB_ID` using the synthetic Linux environment above.
3. After reviewing the preview, apply the same command with `--apply`.
4. Teacher refreshes the existing task in Portal and approves its new exact version. Old signed decisions are stale and old decision records remain historical.

The helper rechecks active ADMIN and teacher mapping in a Serializable transaction, binds current restricted policy, increments planVersion, clears approvedVersion, resets steps and returns to PENDING_PLAN_APPROVAL. Preview does not mutate the job. Terminal, leased, already-policy-bound, unmapped or non-template jobs are refused.

**Any existing PortalOperation blocks this upgrade with `OPERATIONS_REQUIRE_RECONCILIATION`**, including accepted, completed and unknown outcomes. Changing version changes operation keys; automatically rolling them over could duplicate external work. Preserve the original operation identity and reconcile its Portal state with the operator before choosing a separately reviewed recovery. This release deliberately does not provide an automatic upgrade/retry for those jobs. Legacy development/manual jobs likewise need separately reviewed re-creation rather than inheriting approvals.

## Verification

Verified 22 October 2026:

- Final Linux full suite: 104/104 passed, no skips, including merged fresh-schema fixtures, auth revocation, Hong Kong database-timezone login budget, teacher authority/replay/scope, explicit legacy requalification and revoked-actor receipt persistence.
- Windows typecheck and lint passed; production build passed. Native Windows task tests fail closed as expected and are not claimed as worker acceptance.
- Full dependency audit: zero vulnerabilities. The XML document compatibility test uses the production bounded parser; no legacy mammoth dependency was restored.
- Native PostgreSQL upgrade migrations passed for both guarded synthetic teacher databases. Actual two-service acceptance passed: Portal-only submission/approval, lost replies and immutable retry, teacher isolation, stale approval, pause/resume/cancel, mapped draft/evidence, monotonic progress, revoked mapping and no sending.
- Portal PR5 exact-head CI passed both verification runs (isolated migrations, backup restore rehearsal, DB/API and nonroot standalone container acceptance). Its tested application tree is unchanged by the ancestry-only main reconciliation. Portal main is 83239e4 and all inventoried remote branches are its ancestors.
- Independent fresh review identified two Important AgentOS integration issues and two Portal UI issues; all four were fixed, regression-tested and confirmed closed by scoped review. Actual AD/model/deployment qualification and operational unknown-effect reconciliation were outside that read-only review and remain explicit gates.

PGlite fixtures do not prove native multi-worker PostgreSQL qualification. Actual teacher Portal browser qualification, real AD/Google login, local model inference, real school data, mail and business cron remain separate release gates. No new deployment is claimed by this merge. Earlier protected Vercel pilot evidence is historical.

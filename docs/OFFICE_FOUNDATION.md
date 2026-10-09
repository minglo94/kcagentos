# Office foundation: implementation and verification

2026-10-09 · User authorized implementation and selected layout A. User confirmed no local model is configured yet; this milestone delivers the connection/test foundation, not live AI or production deployment.

## Delivered

- Authenticated `/office`: supervisor goal, team seats, durable job list, steps, plan approvals, manual evidence, pause/resume/cancel/replan and event timeline. Seats display real step state; full Pixel Agents bridge is pending.
- PostgreSQL parent jobs, ordered replayable events, plan version/hash approvals and staff evidence. Same-version repeated decisions are idempotent; stale or contradictory decisions are rejected.
- Separate Worker with transactional claims, expiring leases, heartbeat and fenced results. Interrupted execution pauses; unapproved plans do not execute. Manual steps wait for staff evidence. Only development read-only Codex steps have an automatic executor.
- Restricted Hermes planning subprocess: dedicated profile, no tools, no private config inheritance, loopback model only, bounded JSON and fail-closed output validation. No live inference is claimed.
- Codex stdio app-server adapter: dedicated empty-config profile, isolated child environment, disabled connectors/customizations, read-only network-disabled turn policy and default-denied approval requests. Real initialization only was verified, not a model turn or OS-level sandbox.
- Existing school features stay intact. Portal business execution, data, reports and approval authority are not duplicated. No cron, email, deployment, write executor or worktree mutation is enabled.
- Bundled fonts replace build-time Google font downloads, allowing this part of startup/build to work without external font access. Serif headings use installed/system fallbacks.

## Local startup

Requires Node 22+ (validated here on Node 24), PostgreSQL and the existing Google staff login configuration. No unauthenticated or bypass login was added.

1. `npm ci`.
2. Create ignored `.env.local` with the existing app settings and `DATABASE_URL` pointing to a dedicated development database. Do not put real records in test databases.
3. For a **new empty database**, run `npm run db:migrate`. This creates the existing schema baseline then adds Office tables.
4. Start `npm run dev -- --hostname 127.0.0.1`; sign in through the existing school account; open `/office`.
5. In another terminal run `npm run office:worker`. It reads `.env.local` independently. Jobs persist when the browser closes.

For an **existing populated database**, back up and verify its schema matches migration `20261009000000_baseline` before marking that baseline applied with `prisma migrate resolve --applied 20261009000000_baseline`. Only then deploy the additive Office migration. Do not run reset/db-push or blindly baseline an incompatible database. No existing deployment/database was migrated in this milestone.

## Optional adapters

Hermes settings: `HERMES_PYTHON`, `HERMES_SOURCE_DIR`, `AGENTOS_HERMES_HOME`. See [HERMES_BRIDGE.md](HERMES_BRIDGE.md). Without configuration a planning job reports `HERMES_NOT_CONFIGURED`; it never generates a fake plan.

Codex settings: `AGENTOS_CODEX_COMMAND`, `AGENTOS_CODEX_WORKSPACE`, `AGENTOS_CODEX_HOME`. Create a dedicated absolute home named `agentos-codex`; config must be absent/empty, without plugins, skills or hooks. Configure its own authentication separately; never copy credentials into Git or use a personal profile. Project `.codex/config.toml` is rejected. Machine-managed configuration and actual sandbox enforcement require further qualification before live jobs. Worker declines every runtime permission request in this slice.

The host owns model/provider settings. Job text cannot choose arbitrary commands, paths, URLs or executors. All school operations currently remain manual until Portal exposes scoped capabilities.

## Checks

- `npm run typecheck`, `npm run lint`, `npm test`.
- Hermes interpreter: `python -m unittest discover -s tests -p hermes_planner_test.py`.
- `npm run test:browser`, with `CHROMIUM_BIN` if using an existing installed Chromium. Synthetic users/secret/fixtures are generated inside an ephemeral database. This test exercises real Next authentication/routes and UI, not real school SSO or model inference.
- `npm run build` with app configuration. Do not run Prisma generation/build concurrently with a running Windows app: loaded query-engine DLLs prevent generation.

Store tests apply both migrations to isolated PGlite PostgreSQL and use the real Prisma client. PGlite is a single-backend fixture, **not** evidence of production multi-worker PostgreSQL serialization. The browser fixture releases its seeding connection before Next owns the backend; worker completion is tested separately. Real PostgreSQL concurrency, school Google SSO, actual model calls, Portal, cron and Spark remain subsequent acceptance gates.

Screenshot output `.test-artifacts/office.png` is synthetic, local and ignored by Git. Dependency audit output is also ignored. Existing dependency vulnerabilities require a separate tested upgrade before any production release.

## Next milestone

Configure/validate a local model when available, qualify real PostgreSQL concurrent claims/approval races, then connect the Portal parentJobId/operationId/idempotency contract. Add real Pixel Agents visualization and business schedules only after the underlying workflow is verified. This is a foundation PR, not completion of the full product plan.

# AgentOS synthetic Zeabur review

This deploys the current AgentOS UI for review with a **new, empty AgentOS database** and synthetic data. It does not connect to Keichi Portal, the school AD, NAS, Ollama, email, WhatsApp, or student records. Use a separate Zeabur service and database; do not point it at the existing Portal database. The review image is `Dockerfile.zeabur` on branch `codex/agentos-phase2` ([draft PR #14](https://github.com/minglo94/kcagentos/pull/14)). The PR is stacked on the foundation branch, so deploy this branch directly until both PRs are merged.

## Create the review services

1. In Zeabur, create a separate **PostgreSQL** service and an **AgentOS web** service from `minglo94/kcagentos`, branch `codex/agentos-phase2`. Choose the Dockerfile build method and set `ZBPACK_DOCKERFILE_NAME=zeabur` on the web service so it builds `Dockerfile.zeabur`, rather than the Spark Dockerfile. Give the web service a temporary HTTPS domain. Keep the database private to the project.
2. Attach a persistent volume to the **web service** at `/data`. A service volume is required for protected task-audit payloads. Do not use a public/static mount or a volume shared with another service. Set at least one replica; this review setup is qualified with one web replica only.
3. Set these protected web-service variables (using the database service's private connection string):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Connection string for the **new review PostgreSQL** database |
   | `NEXTAUTH_URL` | Exact HTTPS URL of the review web domain, without a trailing slash |
   | `NEXTAUTH_SECRET` | New random secret of at least 32 characters; keep it stable across redeploys |
   | `AGENTOS_REVIEW_MODE` | `synthetic` |
   | `AGENTOS_TASK_DATA_MODE` | `synthetic` |
   | `AGENTOS_LOCAL_AUTH_ENABLED` | `true` |
   | `AGENTOS_AD_AUTH_ENABLED` | `false` |
   | `AGENTOS_AUDIT_ROOT` | `/data/audit` |

   Zeabur supplies `PORT`; if it does not, the image listens on 3000. Do not set `SETUP_TOKEN`, school AD/Portal/NAS/model credentials, outbound notification keys, or a worker command on this review service. Keep the review database and volume when redeploying the web image.

4. Deploy the web image. Its startup prepares `/data/audit` with mode 0700, then runs Next as the unprivileged `node` user. The app is expected to answer `503 {"status":"unready"}` at `/api/review/health` until migration and initialization are complete. If it exits with `REVIEW_CONFIGURATION_REQUIRED`, correct the settings and mounted volume before continuing.

## Initialize the new database once

Use Zeabur's service **Overview → Command** one-off command feature, with the web service's configured environment. Run each command separately:

```sh
npm run db:migrate
```

Check that all five migrations applied. Do **not** run migrations against an existing Portal or school database. For a nonempty AgentOS database, follow its separate backup/migration runbook; this fresh-review bootstrap deliberately refuses it.

Temporarily add these protected web-service variables for the first review administrator:

| Variable | Example / rule |
| --- | --- |
| `AGENTOS_REVIEW_ADMIN_NAME` | `Synthetic reviewer` |
| `AGENTOS_REVIEW_ADMIN_EMAIL` | A reviewer-owned email address; no student address |
| `AGENTOS_REVIEW_ADMIN_USERNAME` | A unique local login name |
| `AGENTOS_REVIEW_ADMIN_PASSWORD` | A new private password, 12–128 characters |

Run this one-off command, which uses the existing app user's access to the private audit volume:

```sh
gosu node:node npm run review:bootstrap
```

It creates one active local administrator and one **pending, manual-only synthetic Office plan**. It prints the new job ID, never the password. It refuses a second run (`REVIEW_DATABASE_NOT_EMPTY`). Remove the four temporary `AGENTOS_REVIEW_ADMIN_*` variables from the web service after bootstrap and redeploy; retain the stable `NEXTAUTH_SECRET`. Manage later local accounts through the authenticated administrator UI.

## Review in the browser

1. Open `https://<review-domain>/api/review/health`: expect HTTP 200 with only `{"status":"ready"}`. A 503 means the service, migration, administrator or audit volume is not ready.
2. Open `/login`, select local account, and sign in with the review username and private password. Open `/office`: the **Review synthetic Office workflow** job should be pending plan approval. Open `/admin/task-audits` to inspect its protected synthetic input/output attempt records.
3. Review plan approval and UI navigation with synthetic content only. This service has no worker or model; approving the sample plan leaves the manual step queued. It does not run, send, or deliver a class summary. Do not enter real student data in this public review service.

The matching local qualification command is `CHROMIUM_BIN=/usr/bin/chromium npm run test:zeabur:container` after building `kcagentos:zeabur-review` from `Dockerfile.zeabur`; it creates and removes only disposable Docker resources.

## Troubleshooting and removal

- `REVIEW_CONFIGURATION_REQUIRED`: check every required flag, `NEXTAUTH_SECRET`, `PORT`, and the `/data` volume. The entrypoint refuses missing or symlinked audit paths.
- `/api/review/health` stays 503: inspect migration/bootstrap command results and the private audit volume permissions. It intentionally hides internals from public HTTP responses.
- Login redirects to the wrong host: set `NEXTAUTH_URL` to the exact HTTPS review domain and redeploy. Do not change `NEXTAUTH_SECRET` after users sign in unless you intend to expire sessions.
- Remove the review **web service, its dedicated database and its dedicated volume** when the preview is over, using Zeabur's normal service controls. Keep these separate from Keichi and any production AgentOS services. Rolling back the web image can be done by selecting the earlier review deployment while keeping the database/volume; inspect Prisma migration compatibility before rolling back across a schema change.

This is a synthetic preview, not a live school acceptance. Real Ollama on SparkOS, protected LDAPS, NAS mounts, Portal class-summary operations, production backup/migration, full Pixel Agents, scheduling, and Spark deployment retain their own acceptance work in `PHASE2_STATUS.md`.

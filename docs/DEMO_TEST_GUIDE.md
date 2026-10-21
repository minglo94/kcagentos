# School AgentOS demo and test guide

The first run uses **only generated demo data**. It creates a disposable PostgreSQL-compatible database, a fake OpenAI-compatible model on `127.0.0.1`, private input/output/audit directories, and a test-only Portal class-summary fixture. The command removes all of them when it exits. It never connects to Zeabur, school AD, NAS, email or a real model.

## One-command demo

Prerequisites: Linux with Node 22.13+ (Node 24 recommended), npm and the repository checkout. On the AgentOS branch:

```sh
npm ci
env -u DATABASE_URL npm run demo:school
```

Expected JSON fields include `"mode":"synthetic"`, `"model":"loopback-fake"`, `"modelCalls":1`, `"jobStatus":"SUCCEEDED"`, `"portalStatus":"DELIVERY_UNKNOWN"`, `"portalDelivered":false`, `"deniedCapabilities":true`, and audit executor names for `local-model`, `file-read`, `file-write`, and `manual.evidence`. `verifiedInputs` and `verifiedOutputs` should both equal the number of `auditExecutors`; the demo calls the real administrator payload reader, which checks stored SHA-256 hashes, before cleanup. `adminAuditReads` records those inspections. `portalAuditActions` should be 4 for the Portal-owned, in-memory fixture. The temporary data is then deleted; use the separate browser check to see the real administrator audit UI.

`SUCCEEDED` is the **AgentOS demo parent job** after a simulated staff evidence step. Portal delivery stays unknown, so the class summary is **not delivered**. The staged file is deliberately not published as an approved output. If `DATABASE_URL` is set, the script refuses to start; use the `env -u` command above. Do not substitute real student records in this demo.

For repeatable automated checks:

```sh
npm test
npm run typecheck
CHROMIUM_BIN=/usr/bin/chromium npm run test:auth:browser
CHROMIUM_BIN=/usr/bin/chromium npm run test:browser
```

The browser checks start temporary Next servers and synthetic PGlite databases. They show the local-account login, fake-model chat, denied cloud path, protected administrator input/output audit page, approval UI, and job status. Install Chromium or set `CHROMIUM_BIN` to your browser path. Run browser suites one at a time because each owns a local port and Next build cache. The PostgreSQL qualification command (`npm run test:postgres`) needs its separately documented disposable database; see `POSTGRES_QUALIFICATION.md` before running it. A production build is `npm run build`.

## Test a real Ollama on SparkOS Linux with harmless text

Once Ollama is installed on the Spark host, keep it bound to the host loopback interface. For example, in a local terminal:

```sh
ollama pull llama3.2:3b
ollama serve
```

In another terminal, ask a harmless synthetic question through its OpenAI-compatible endpoint:

```sh
curl --fail --silent --show-error http://127.0.0.1:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"llama3.2:3b","stream":false,"messages":[{"role":"user","content":"Reply with the word DEMO."}]}'
```

For AgentOS, the private web/worker environment uses `AGENTOS_LOCAL_MODEL_URL=http://127.0.0.1:11434`, `AGENTOS_LOCAL_MODEL=llama3.2:3b`, `AGENTOS_TASK_DATA_MODE=synthetic`, a protected `AGENTOS_AUDIT_ROOT`, and its dedicated database settings. The worker must run on the host beside Ollama: `127.0.0.1` inside the web container refers to the container, not the host. The available Office planner asks Ollama for a bounded manual-step JSON plan. Review and approve each generated plan in the UI before a worker step runs. A successful harmless inference is only a model protocol check, not a student-data qualification.

## What the Portal source changes

The provided [Keichi Portal repository](https://github.com/minglo94/keichi) was inspected at commit `58f6ff6`. It has role/session-scoped class and homework routes (`src/app/api/classes/...`), class access checks (`src/lib/class-perm.ts`), a PostgreSQL `KnowledgeChunk.embedding` column declared as `vector(1024)`, and a local embedding path for student data (`src/lib/embeddings.ts`). It also has existing AgentTask/AgentDocument and a **single** administrator document approval. Its current `/api/ai/query` requires an Anthropic API key, and no class-summary child-operation, separate content/send approval, durable delivery outbox or AgentOS service-auth endpoint is present. Do not point AgentOS directly at `/api/ai/query`, a database connection, or the current document approval as if either were the approved class-summary contract.

`src/lib/office/portal-class-summary-contract.ts` is a **proposed** status-only wire shape. `tests/fixtures/synthetic-portal.ts` owns fake pupil rows, scope checks, approvals and unknown delivery entirely inside the test process. It has a role-gated in-memory audit for the demo, but no durable Portal audit service. It cannot claim delivery, because the demo has no transport or outbox receipt. The contract tests cover idempotent replay, changed-payload rejection, staff/class/date/source scope, incomplete inputs, plan/artifact/recipient-bound approvals and uncertain delivery. To make it real, the Portal repository must add an authenticated scoped operation API, durable idempotency/event/audit storage, source validation, distinct content and send approvals bound to exact artifact/recipients, and an outbox with reconciliation. Only then can AgentOS implement the corresponding authenticated client and cross-service replay tests. Staff identity mapping must be explicit; matching email alone is insufficient.

## Live acceptance inputs and order

1. On the Spark host, confirm Linux distribution/architecture, available disk/RAM, Docker/systemd, backup target, HTTPS entry point and a harmless Ollama model check. Keep configuration in protected files, not chat or Git.
2. In a school-controlled test environment, qualify LDAPS certificate/CA validation, a least-privilege test account and class scope. Existing synthetic LDAP tests do not verify the school's directory.
3. Add and test the Portal class-summary operation in the Portal repository. It must enforce staff permissions on its own data and return opaque status/references. Rehearse with synthetic classes before any school records. Do not send email during the first rehearsal.
4. Verify NAS is mounted read-only for named input roots and a separate private output/audit root is available to the service identity. Review stored payload retention, restore and egress policy. Current file bundles are staged only.
5. Restore a protected production backup into a separate rehearsal database, compare migration history and identities, run migrations twice, and prove a restore. Only then schedule a reviewed production migration window. `SPARK_DEPLOYMENT.md` has the existing deployment commands and rollback gate.
6. Set school calendar/timezone, missed-run policy, approval owners, capacity and alert recipients before enabling business schedules. The full Pixel view needs a sanitized AgentOS event provider and asset-license review; the upstream Claude watcher is not a school-safe integration.

No live school model, Portal operation, AD service, NAS mount, production migration, schedule, Pixel renderer or Spark deployment was activated by the demo.

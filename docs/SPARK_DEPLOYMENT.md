# Deployment preparation and Spark acceptance

Status: deployment files built and locally qualified on Linux/AMD64. **No school host deployment, production migration, service activation or business cron is authorized by publishing these files.** Spark hardware/OS and live services still need confirmation.

## Prepared files

- `Dockerfile`: Node 24, native Prisma generation, production Next build, non-root runtime and dev dependency removal. Optional BuildKit `proxy_ca` secret supplies a managed-environment CA only during networked build steps.
- `deploy/compose.yaml`: dedicated PostgreSQL volume, web liveness check, loopback-only web/database ports and a separate opt-in migration service. Startup never runs migrations automatically. Local/AD login flags default to false.
- `deploy/compose.ad.yaml`: optional read-only school CA mount; certificate verification stays enabled.
- `deploy/agentos-worker.service`: host worker template with a dedicated account, restart policy, protected environment file and restricted writable directory. It is not installed/enabled by the repository.

Keep Portal in its own service/database/credential boundary. This Compose file does not create a Portal, student database, outbox or duplicate scheduler.

## Host configuration

Confirm CPU architecture, supported Linux/systemd or another process manager, Docker/Compose, disk/backups and Node 22.13+ (Node 24 LTS recommended). The image supports a native platform build; ARM64/Spark GPU compatibility has not been inferred from an AMD64 build. Review current patched image digests before a release.

Copy `deploy/runtime.env.example` to `deploy/private/runtime.env`, restrict its directory/file permissions and fill settings privately. Use a random hexadecimal database password so the connection URL is unambiguous, and a separately generated session secret. No staff credentials, endpoints, certificates or backup contents belong in Git. Avoid printing `docker compose config` or dumping environments; use `config --quiet` for validation.

Build on the target platform:

```sh
docker build -t kcagentos:local .
docker compose --env-file deploy/private/runtime.env -f deploy/compose.yaml config --quiet
```

In a managed environment needing proxy CA trust, add `--secret id=proxy_ca,src="$CODEX_PROXY_CERT"` to the build. The certificate is not stored in the image. Do not disable TLS verification.

After the migration/backup gate and actual host approval, start the dedicated database, explicitly run the maintenance migration, then provision/login and start web:

```sh
docker compose --env-file deploy/private/runtime.env -f deploy/compose.yaml up -d db
docker compose --env-file deploy/private/runtime.env -f deploy/compose.yaml --profile maintenance run --rm migrate
docker compose --env-file deploy/private/runtime.env -f deploy/compose.yaml run --rm --no-deps web npm run auth:bootstrap
docker compose --env-file deploy/private/runtime.env -f deploy/compose.yaml up -d web
```

Bootstrap is for a new database without an administrator. Existing administrators provision through the current user page. Enable local login only after provisioning; enable AD only after school-controlled acceptance. Add both Compose files and privately set `AGENTOS_AD_CA_FILE` when a school CA is needed. Keep ports on loopback until a reviewed HTTPS reverse proxy/access policy is in place.

## Worker and local model

Run the worker on the host initially, beside its dedicated Hermes/Codex profile and loopback model runtime. A model on the host is not reachable as container `127.0.0.1`; do not broaden the planner's network allowlist to make a container work. The prepared web/database image does not claim live-model worker support.

Review the systemd template paths/account on the actual OS. Install the checked-out release and its native dependencies under `/opt/agentos`; supply protected `/etc/agentos/worker.env` and owned `/var/lib/agentos`. Point host `DATABASE_URL` at the dedicated loopback database port. Set only the dedicated profile/workspace settings from `docs/HERMES_BRIDGE.md`. Never inherit personal profiles, connectors or student folders. Keep unsupported executors unavailable.

Validate the unit with `systemd-analyze verify` and qualify real model planning, approval, cancellation, read-only execution, process-group termination and reboot recovery before enabling the service. No worker service has been installed or enabled here. Full Pixel Agents needs a custom provider; its current upstream default Claude transcript watcher is not the AgentOS bridge.

## Production migration gate

1. Record current release and Prisma migration history. Stop writers/worker and take a protected PostgreSQL backup; prove restoration to a separate approved rehearsal database.
2. Verify the existing schema and old migration checksums. A nonempty untracked database requires a deliberate verified baseline; never blindly copy `migrate resolve`, reset it or fabricate migration history.
3. Rehearse all additive migrations against the restored copy. Compare User IDs/roles, job ownership, approved plan versions/hashes and approvals, then run migration deployment again to prove no-op replay. Test staff login/revocation and recovery with authorized test accounts.
4. Approve the concrete production change/backup/restore result, then deploy migrations during the chosen window. Legacy sessions without the new revision/deadline must sign in again.
5. Roll back application versions only with schema compatibility verified. A database restore discards newer writes; stop writers and approve that action explicitly. Do not automatically drop new auth columns/tables.

The synthetic PostgreSQL rehearsal exercises a pre-auth schema with retained users/jobs/approvals; it cannot prove the state or restorability of the real school database.

## Remaining host acceptance

Real LDAPS/certificate chain and staff access; runtime inference on the confirmed Spark/model; Portal scoped identity/operation/approval contract and synthetic class-summary acceptance; full Pixel provider/asset license review; schedule settings/calendar/notification approval; disk/memory limits, overnight load, machine reboot, graceful shutdown, backup restore and HTTPS access. The web liveness check proves process response, not model, AD, Portal or production readiness.

## Local image/runtime evidence — 2026-10-09

Built `kcagentos:qualification` from the lockfile with Node 24, actual native Prisma generation and production Next 15.5.27 compilation. Local image SHA: d5fe874fd459548c4c3b12aed3e4eb43b6803d821537ea10ef364b92fd7d9916 belonged to the successful consolidated-copy build; use the current `docker image inspect` result for immutable release selection.

`npm run test:container` creates a generated Compose project and disposable PostgreSQL volume, explicitly migrates it, seeds synthetic staff credentials, then drives Chromium through actual production login. It checks anonymous/teacher boundaries, durable job creation, disabled-user session revocation, non-root image user, runtime tsx loading and absent ESLint tooling with a read-only web filesystem. It passed and removed only its own containers/volume. Set `CHROMIUM_BIN` if needed and build `kcagentos:qualification` first. The existing PostgreSQL suite passed 13/13; zero generated qualification schemas remained.

This confirms Linux/AMD64 packaging and local credentials, not Spark ARM/GPU compatibility, real AD, model inference, Portal execution, host-worker activation or production migration.

## Task-audit rollout prerequisite — 2026-10-10

The new migration adds `TaskAttempt`/`TaskArtifact` and a policy snapshot/hash on `OfficeJob`. Rehearse it with synthetic records before touching a school database. The web and worker need a protected, existing `AGENTOS_AUDIT_ROOT` with mode 0700, outside the checkout/static tree, writable by the service identity; only synthetic mode is supported. Current Compose does not mount this root or a local inference endpoint, so it deliberately cannot accept school tasks. Qualify a common protected storage boundary for web and host worker without exposing files through the image or URLs.

`AGENTOS_LOCAL_MODEL_URL` is a server-owned loopback URL and `AGENTOS_LOCAL_MODEL` selects its model. `AGENTOS_DEVELOPMENT_ACTORS` is an explicit list of active user IDs permitted to request the configured development workspace; ordinary team labels confer no access. The old Hermes profile instructions above remain a bridge reference, while `scripts/office-worker.ts` now uses the configured loopback model for synthetic manual planning. Do not enable real student processing via `AGENTOS_TASK_DATA_MODE`; values other than `synthetic` are rejected until the NAS/Portal/storage/isolation gates have been implemented and verified.

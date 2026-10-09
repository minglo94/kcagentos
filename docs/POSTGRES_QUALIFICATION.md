# Office PostgreSQL qualification

2026-10-09 · Phase 2 continuation from foundation commit `de8725c`.

The opt-in `npm run test:postgres` suite validates the existing Office store and worker against real PostgreSQL, using two independent Prisma clients with different backend PIDs. It does not replace the default PGlite tests or change application behavior.

## Run locally

Requires the installed Node dependencies and a disposable PostgreSQL database named `agentos_qualification` on loopback. Use synthetic credentials for this database only.

```sh
docker run --detach --rm --name agentos-qualification \
  --publish 127.0.0.1:55432:5432 \
  -e POSTGRES_DB=agentos_qualification \
  -e POSTGRES_USER=agentos_test \
  -e POSTGRES_PASSWORD=synthetic-test-only postgres:16

# Wait for pg_isready to report accepting connections before running tests.
docker exec agentos-qualification pg_isready -U agentos_test -d agentos_qualification

AGENTOS_TEST_DATABASE_URL='postgresql://agentos_test:synthetic-test-only@127.0.0.1:55432/agentos_qualification' \
  npm run test:postgres

docker stop agentos-qualification
```

The runner requires an explicit test URL, rejects non-loopback hosts and other database names, and overrides the schema with a generated `qualification_<uuid>` name. It deploys all four checked-in migrations into that schema, checks their completed migration records, and removes only that schema on teardown. It never resets or baselines an existing application database. Abruptly killing the test process can leave a generated schema; remove only that test schema after checking its identity, or discard the disposable container.

## Verified behavior

Nine checks passed against PostgreSQL 16.15 on Linux:

1. Simultaneous planning claims call one planner and record one claim while its result is blocked.
2. Duplicate simultaneous approvals create one decision and one decision event.
3. Conflicting approve/reject requests have one authoritative winner; job state matches that decision.
4. Simultaneous execution claims invoke an approved read-only step once and record one result.
5. Simultaneous lease recovery records one recovery; a late planner cannot overwrite the replacement plan.
6. After a database client reconnects, expired execution pauses without replay; stale evidence is rejected and explicit resume accepts fresh evidence.
7. Cancellation from the other client prevents the in-flight result from completing the step.
8. A separate process running the real `runNext` core is killed during planning; its lease persists, recovery is recorded once, and a replacement installs one plan.
9. A separate process is killed during execution; recovery pauses the job, prevents automatic replay, and staff resume accepts one fresh result.

The existing 17 Node tests, six Python bridge tests and typecheck also passed. Lint reported the existing approvals-client hook dependency warning and no errors. The test schema count was zero after teardown. No runtime source changes were needed.

## Limits and next gates

This is synthetic, bounded concurrency and process-crash qualification, not a sustained load test, OS sandbox test, or production deployment. Crash fixtures run the real `runNext` core and heartbeat in separate Node processes, use `SIGKILL`, then advance the persisted lease expiry to avoid a thirty-second wait. They do not run the full `scripts/office-worker.ts` loop, kill model subprocesses or test a machine reboot. The earlier database-client reconnect test remains separate. Planners and read-only services are fixtures; no model turns, student records, Portal calls, email or cron run. Existing production schema compatibility and school AD/local-account login remain unverified. Browser E2E and production build were not rerun for this test-only continuation; their earlier foundation results remain historical evidence.

Next: implement the reviewed school AD/local-account design; configure the dedicated local model profile and validate real planning; confirm the private Portal capability/identity/operation/approval contract, then implement the synthetic class-summary workflow from `AGENTOS_PLAN.md` section 11. Keep production dependency upgrades and real authentication/database migration qualification as separate gates. Full Pixel Agents and business schedules follow verified execution.

## Authentication races and bounded load — 2026-10-09

Qualification now includes shared five-attempt login limits, concurrent first-administrator creation, credential username conflicts and unique AD GUID linking. Six independent PostgreSQL backends plan and execute 32 synthetic approved jobs; each planner/executor runs once, all jobs finish, and no leases remain. This exposed immediate retry exhaustion under contention. Queue claims now use read-committed `FOR UPDATE SKIP LOCKED`, while version/token state changes retain serializable transactions with bounded backoff (eight attempts). The first successful rerun passed 12/12.

This is a small synthetic concurrency qualification, not production capacity, prolonged soak, a host reboot or a live model/Portal load test. Process SIGKILL checks still use the real worker core with synthetic blocked adapters and accelerated lease expiry.

## Existing-installation rehearsal

The 13th check creates a separate generated `_upgrade` schema containing the original baseline/office tables and synthetic retained User, Job and Approval records. It records only those fixture migrations, deploys the additive auth migrations, verifies identities/ownership/plan hashes and existing approvals, confirms no local/AD credential creation, then deploys again and verifies four applied migrations with no data duplication. Finally it drops only that generated fixture schema. This does not authorize baseline marking, reset or migration against an actual existing school database; restore and compare that database separately first.

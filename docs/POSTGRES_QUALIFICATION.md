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

The runner requires an explicit test URL, rejects non-loopback hosts and other database names, and overrides the schema with a generated `qualification_<uuid>` name. It deploys both checked-in migrations into that schema, checks their completed migration records, and removes only that schema on teardown. It never resets or baselines an existing application database. Abruptly killing the test process can leave a generated schema; remove only that test schema after checking its identity, or discard the disposable container.

## Verified behavior

Seven checks passed against PostgreSQL 16.15 on Linux:

1. Simultaneous planning claims call one planner and record one claim while its result is blocked.
2. Duplicate simultaneous approvals create one decision and one decision event.
3. Conflicting approve/reject requests have one authoritative winner; job state matches that decision.
4. Simultaneous execution claims invoke an approved read-only step once and record one result.
5. Simultaneous lease recovery records one recovery; a late planner cannot overwrite the replacement plan.
6. After a database client reconnects, expired execution pauses without replay; stale evidence is rejected and explicit resume accepts fresh evidence.
7. Cancellation from the other client prevents the in-flight result from completing the step.

The existing 17 Node tests, six Python bridge tests and typecheck also passed. Lint reported the existing approvals-client hook dependency warning and no errors. The test schema count was zero after teardown. No runtime source changes were needed.

## Limits and next gates

This is synthetic, bounded two-client qualification, not a sustained load test, multi-process Worker crash test, OS sandbox test, or production deployment. The database-client reconnect test does not kill a Worker process. Planners and read-only services are fixtures; no model turns, student records, Portal calls, email or cron run. Existing production schema compatibility and school Google SSO remain unverified. Browser E2E and production build were not rerun for this test-only continuation; their earlier foundation results remain historical evidence.

Next: configure the dedicated local model profile and validate real planning; confirm the private Portal capability/identity/operation/approval contract, then implement the synthetic class-summary workflow from `AGENTOS_PLAN.md` section 11. Keep production dependency upgrades and real SSO/database migration qualification as separate gates. Full Pixel Agents and business schedules follow verified execution.

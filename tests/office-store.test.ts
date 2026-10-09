import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";
import { approvePlan, completeManual, controlJob, createJob, installPlan, owned } from "../src/lib/office/store";
import { hashPlan, planSchema, type OfficePlan } from "../src/lib/office/plan";
import { recoverExpired, runNext } from "../src/lib/office/worker";

let pg: PGlite, server: PGLiteSocketServer, db: PrismaClient, user: string;
const plan: OfficePlan = { summary: "Draft a report", acceptance: ["Staff reviewed evidence"], steps: [
  { id: "collect", title: "Review source", agent: "clerk", executor: "manual", dependsOn: [], instructions: "Check source dates and missing rows" },
] };
before(async () => {
  pg = await PGlite.create();
  for (const migration of ["20261009000000_baseline", "20261009000100_office", "20261009000200_school_auth"]) await pg.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, "utf-8"));
  server = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0 });
  await server.start();
  db = new PrismaClient({ datasources: { db: { url: `postgresql://postgres:postgres@${server.getServerConn()}/postgres?connection_limit=1` } } });
  user = (await db.user.create({ data: { email: "synthetic@example.test", name: "Synthetic tester", subjects: [] } })).id;
});
after(async () => { await db?.$disconnect(); await server?.stop(); await pg?.close(); });

test("rejects cycles, repeated step IDs and unsupported external executors", () => {
  assert.throws(() => planSchema.parse({ ...plan, steps: [{ ...plan.steps[0], dependsOn: ["collect"] }] }));
  assert.throws(() => planSchema.parse({ ...plan, steps: [plan.steps[0], plan.steps[0]] }));
  assert.throws(() => planSchema.parse({ ...plan, steps: [{ ...plan.steps[0], executor: "email.send" }] }));
});
test("durable plan approval is scoped, content-bound and idempotent", async () => {
  const job = await createJob(db, user, "Prepare synthetic report", "school");
  await assert.rejects(() => owned(db, job.id, "other-user"), /JOB_NOT_FOUND/);
  await runNext(db, { plan: async () => plan });
  const ready = await owned(db, job.id, user);
  assert.equal(ready.status, "PENDING_PLAN_APPROVAL");
  assert.equal(ready.planHash, hashPlan(plan));
  await assert.rejects(() => approvePlan(db, job.id, user, ready.planVersion, "wrong", "approve"), /STALE_PLAN/);
  await Promise.all([approvePlan(db, job.id, user, ready.planVersion, ready.planHash!, "approve"), approvePlan(db, job.id, user, ready.planVersion, ready.planHash!, "approve")]);
  assert.equal(await db.officeApproval.count({ where: { jobId: job.id } }), 1);
  await assert.rejects(() => approvePlan(db, job.id, user, ready.planVersion, ready.planHash!, "reject"), /ALREADY_DECIDED/);
  await runNext(db, { plan: async () => { throw new Error("Must not replan"); } });
  assert.equal((await owned(db, job.id, user)).status, "WAITING_INPUT");
  await completeManual(db, job.id, user, "collect", "Synthetic source verified", ready.planVersion, ready.planHash!);
  await runNext(db, { plan: async () => plan });
  assert.equal((await owned(db, job.id, user)).status, "SUCCEEDED");
});
test("unapproved plan never reaches executor; cancel fences planner results", async () => {
  const job = await createJob(db, user, "Another synthetic report", "school");
  await runNext(db, { plan: async () => { await controlJob(db, job.id, user, "cancel"); return plan; } });
  assert.equal((await owned(db, job.id, user)).status, "CANCELLED");
  assert.equal(await db.officeStep.count({ where: { jobId: job.id } }), 0);
});
test("replan invalidates old approvals and resume cannot bypass rejection", async () => {
  const job = await createJob(db, user, "Replanning synthetic report", "school");
  await runNext(db, { plan: async () => plan });
  let ready = await owned(db, job.id, user);
  await approvePlan(db, job.id, user, ready.planVersion, ready.planHash!, "reject", "Revise scope");
  await assert.rejects(() => controlJob(db, job.id, user, "resume"), /APPROVAL_REQUIRED/);
  await controlJob(db, job.id, user, "replan");
  await runNext(db, { plan: async () => ({ ...plan, summary: "Revised draft" }) });
  const revised = await owned(db, job.id, user);
  assert.equal(revised.planVersion, ready.planVersion + 1);
  await assert.rejects(() => approvePlan(db, job.id, user, ready.planVersion, ready.planHash!, "approve"), /STALE_PLAN/);
});
test("expired worker leases pause execution without blindly replaying actions", async () => {
  const job = await createJob(db, user, "Restart test report", "school");
  await db.officeJob.update({ where: { id: job.id }, data: { status: "RUNNING", leaseToken: "dead-worker", leaseUntil: new Date(0) } });
  assert.equal(await recoverExpired(db), 1);
  assert.equal((await owned(db, job.id, user)).status, "PAUSED");
  await assert.rejects(() => installPlan(db, job.id, plan, "dead-worker"), /LEASE_LOST/);
});
test("queued jobs without approval never call an executor", async () => {
  const job = await createJob(db, user, "Approval barrier test", "development");
  await db.officeJob.update({ where: { id: job.id }, data: { status: "QUEUED", plan, planVersion: 1, planHash: hashPlan(plan) } });
  let invoked = false;
  await runNext(db, { plan: async () => { invoked = true; return plan; }, readOnly: async () => { invoked = true; return "findings"; } });
  assert.equal(invoked, false);
  assert.equal((await owned(db, job.id, user)).errorCode, "APPROVAL_REQUIRED");
});
test("pause fences an in-flight read-only result", async () => {
  const job = await createJob(db, user, "Paused inspection test", "development");
  const inspection: OfficePlan = { ...plan, steps: [{ ...plan.steps[0], agent: "archie", executor: "codex.readonly" }] };
  await runNext(db, { plan: async () => inspection });
  const ready = await owned(db, job.id, user);
  await approvePlan(db, job.id, user, ready.planVersion, ready.planHash!, "approve");
  await runNext(db, { plan: async () => inspection, readOnly: async () => { await controlJob(db, job.id, user, "pause"); return "stale result"; } });
  assert.equal((await owned(db, job.id, user)).status, "PAUSED");
  assert.equal((await db.officeStep.findFirstOrThrow({ where: { jobId: job.id } })).result, null);
});
test("evidence from an old plan cannot complete a reused step ID", async () => {
  const job = await createJob(db, user, "Stale evidence test", "school");
  await runNext(db, { plan: async () => plan });
  const first = await owned(db, job.id, user);
  await approvePlan(db, job.id, user, first.planVersion, first.planHash!, "approve");
  await runNext(db, { plan: async () => plan });
  await controlJob(db, job.id, user, "pause");
  await controlJob(db, job.id, user, "replan");
  await runNext(db, { plan: async () => ({ ...plan, summary: "Different requirements", steps: [{ ...plan.steps[0], instructions: "Review a different source" }] }) });
  const second = await owned(db, job.id, user);
  await approvePlan(db, job.id, user, second.planVersion, second.planHash!, "approve");
  await runNext(db, { plan: async () => plan });
  await assert.rejects(() => completeManual(db, job.id, user, "collect", "Old source verified", first.planVersion, first.planHash!), /STALE_PLAN/);
  assert.equal((await db.officeStep.findFirstOrThrow({ where: { jobId: job.id } })).status, "WAITING_INPUT");
});

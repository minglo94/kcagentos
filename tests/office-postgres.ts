import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fork, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { approvePlan, controlJob, createJob, owned } from "../src/lib/office/store";
import { type OfficePlan } from "../src/lib/office/plan";
import { recoverExpired, runNext } from "../src/lib/office/worker";
import { reserveAttempt, bootstrapLocalAdmin, createLocalUser, linkDirectoryUser } from "../src/lib/school-auth/store";

// Deliberately separate from npm test: requires a disposable, local PostgreSQL.
const supplied = process.env.AGENTOS_TEST_DATABASE_URL;
if (!supplied) throw new Error("Set AGENTOS_TEST_DATABASE_URL to a local agentos_qualification database");
const url = new URL(supplied);
if (!["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/agentos_qualification") {
  throw new Error("Qualification only accepts local PostgreSQL database agentos_qualification");
}
const schema = `qualification_${randomUUID().replaceAll("-", "")}`;
url.searchParams.set("schema", schema);
url.searchParams.set("connection_limit", "1");
const client = () => new PrismaClient({ datasources: { db: { url: url.toString() } } });
let db: PrismaClient, peer: PrismaClient, user: string;
const plan: OfficePlan = {
  summary: "Inspect synthetic source", acceptance: ["Synthetic evidence recorded"],
  steps: [{ id: "inspect", title: "Inspect", agent: "archie", executor: "codex.readonly", dependsOn: [], instructions: "Inspect synthetic fixture" }],
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Concurrent operation did not settle within 5s")), 5000);
    })]);
  } finally { clearTimeout(timer); }
}
async function readyJob() {
  const job = await createJob(db, user, "Synthetic PostgreSQL qualification", "development");
  await runNext(db, { plan: async () => plan });
  return owned(db, job.id, user);
}
async function approvedJob() {
  const job = await readyJob();
  await approvePlan(db, job.id, user, job.planVersion, job.planHash!, "approve");
  return job;
}

async function blockedProcess(phase: "planning" | "executing") {
  const child = fork(fileURLToPath(new URL("./fixtures/office-worker-process.ts", import.meta.url)), [], {
    execArgv: ["--import", "tsx"], silent: true,
    env: { NODE_ENV: "test", PATH: process.env.PATH, AGENTOS_TEST_DATABASE_URL: url.toString() },
  });
  // Fixture errors are intentionally sanitized; no connection strings are logged.
  child.stdout?.resume(); child.stderr?.resume();
  const exited = new Promise<NodeJS.Signals | null>(resolve => child.once("exit", (_, signal) => resolve(signal)));
  let backendPid: number | undefined;
  const entered = new Promise<void>((resolve, reject) => {
    child.on("error", () => reject(new Error("Qualification subprocess could not start")));
    child.once("exit", () => reject(new Error("Qualification subprocess exited before entering its service")));
    child.on("message", message => {
      const value = message as { backendPid?: number; phase?: string; error?: string };
      if (value.backendPid) backendPid = value.backendPid;
      if (value.phase === phase) resolve();
      if (value.error) reject(new Error(value.error));
    });
  });
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    return bounded(exited);
  };
  try { await bounded(entered); }
  catch (error) { await stop(); throw error; }
  assert.ok(backendPid);
  return { backendPid, stop };
}

before(async () => {
  db = client(); peer = client();
  const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url.toString() }, encoding: "utf8", timeout: 60000,
  });
  // Do not echo command output: a connection error may contain credentials.
  assert.equal(migration.status, 0, "Isolated schema migration failed; check local PostgreSQL readiness");
  const migrations = await db.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  assert.deepEqual(migrations.map(row => row.migration_name), ["20261009000000_baseline", "20261009000100_office", "20261009000200_school_auth", "20261009000300_auth_review"]);
  const versions = await db.$queryRaw<Array<{ version: string }>>`SELECT version()`;
  assert.match(versions[0].version, /^PostgreSQL /);
  const pids = await Promise.all([db, peer].map(connection => connection.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`));
  assert.notEqual(pids[0][0].pid, pids[1][0].pid, "Tests require independent PostgreSQL backends");
  user = (await db.user.create({ data: { email: "qualification@example.test", name: "Synthetic tester", subjects: [] } })).id;
});
beforeEach(async () => { await db.officeJob.deleteMany(); });
after(async () => {
  await peer?.$disconnect();
  if (db) {
    // Identifier is generated above, never derived from the supplied URL.
    try { await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await db.$disconnect(); }
  }
});

test("two workers claim a planning job once while the winning planner is blocked", async () => {
  const job = await createJob(db, user, "Concurrent planning", "development");
  const entered = deferred(), gate = deferred(); let calls = 0;
  const services = { plan: async () => { calls++; entered.resolve(); await gate.promise; return plan; } };
  const workers = [runNext(db, services), runNext(peer, services)];
  try {
    // The winner cannot finish until released; the loser must return false.
    assert.equal(await bounded(Promise.race(workers)), false);
    await bounded(entered.promise);
    assert.equal(calls, 1);
    assert.equal(await db.officeEvent.count({ where: { jobId: job.id, type: "worker.claimed" } }), 1);
  } finally { gate.resolve(); await Promise.all(workers); }
  assert.equal((await owned(db, job.id, user)).status, "PENDING_PLAN_APPROVAL");
});

test("duplicate concurrent approvals create one decision and one event", async () => {
  const job = await readyJob();
  await Promise.all([db, peer].map(connection => approvePlan(connection, job.id, user, job.planVersion, job.planHash!, "approve")));
  assert.equal(await db.officeApproval.count({ where: { jobId: job.id } }), 1);
  assert.equal(await db.officeEvent.count({ where: { jobId: job.id, type: "plan.decision" } }), 1);
  const current = await owned(db, job.id, user);
  assert.equal(current.status, "QUEUED");
  assert.equal(current.approvedVersion, job.planVersion);
});

test("opposing concurrent approvals have one authoritative winner", async () => {
  const job = await readyJob();
  const decisions = await Promise.allSettled([
    approvePlan(db, job.id, user, job.planVersion, job.planHash!, "approve"),
    approvePlan(peer, job.id, user, job.planVersion, job.planHash!, "reject"),
  ]);
  assert.equal(decisions.filter(result => result.status === "fulfilled").length, 1);
  const loser = decisions.find(result => result.status === "rejected");
  assert.ok(loser?.status === "rejected");
  assert.match(String(loser.reason), /ALREADY_DECIDED/);
  const approval = await db.officeApproval.findMany({ where: { jobId: job.id } });
  assert.equal(approval.length, 1);
  const current = await owned(db, job.id, user);
  assert.equal(current.status, approval[0].decision === "approve" ? "QUEUED" : "PAUSED");
  assert.equal(current.approvedVersion, approval[0].decision === "approve" ? job.planVersion : null);
  assert.equal(await db.officeEvent.count({ where: { jobId: job.id, type: "plan.decision" } }), 1);
});

test("two workers execute an approved step once", async () => {
  const job = await approvedJob();
  const gate = deferred(); let calls = 0;
  const services = { plan: async () => plan, readOnly: async () => { calls++; await gate.promise; return "Synthetic checked result"; } };
  const workers = [runNext(db, services), runNext(peer, services)];
  try { assert.equal(await bounded(Promise.race(workers)), false); }
  finally { gate.resolve(); await Promise.all(workers); }
  assert.equal(calls, 1);
  const step = await db.officeStep.findFirstOrThrow({ where: { jobId: job.id } });
  assert.equal(step.attempts, 1);
  assert.equal(step.result, "Synthetic checked result");
  assert.equal(await db.officeEvent.count({ where: { jobId: job.id, type: "step.completed" } }), 1);
  await runNext(peer, services);
  assert.equal((await owned(db, job.id, user)).status, "SUCCEEDED");
});

test("concurrent recovery fences a stale planner after a new worker installs its plan", async () => {
  const job = await createJob(db, user, "Recover stale planning", "development");
  const entered = deferred(), gate = deferred();
  const oldWorker = runNext(db, { plan: async () => { entered.resolve(); await gate.promise; return plan; } });
  try {
    await bounded(entered.promise);
    await peer.officeJob.update({ where: { id: job.id }, data: { leaseUntil: new Date(0) } });
    const counts = await Promise.all([recoverExpired(db), recoverExpired(peer)]);
    assert.equal(counts.reduce((sum, count) => sum + count, 0), 1);
    await runNext(peer, { plan: async () => ({ ...plan, summary: "Replacement plan" }) });
  } finally { gate.resolve(); await oldWorker; }
  const current = await owned(db, job.id, user);
  assert.equal(current.status, "PENDING_PLAN_APPROVAL");
  assert.equal(current.planVersion, 1);
  assert.equal((current.plan as { summary: string }).summary, "Replacement plan");
  assert.equal(await db.officeEvent.count({ where: { jobId: job.id, type: "plan.ready" } }), 1);
  assert.equal(await db.officeEvent.count({ where: { jobId: job.id, type: "worker.recovered" } }), 1);
});

test("expired execution survives client restart, pauses and rejects stale results", async () => {
  const job = await approvedJob();
  const entered = deferred(), gate = deferred();
  const oldWorker = runNext(db, { plan: async () => plan, readOnly: async () => {
    entered.resolve(); await gate.promise; return "Stale evidence";
  } });
  try {
    await bounded(entered.promise);
    await peer.officeJob.update({ where: { id: job.id }, data: { leaseUntil: new Date(0) } });
    await peer.$disconnect(); peer = client();
    assert.equal(await recoverExpired(peer), 1);
  } finally { gate.resolve(); await oldWorker; }
  assert.equal((await owned(peer, job.id, user)).status, "PAUSED");
  assert.equal(await runNext(peer, { plan: async () => { throw new Error("Must not replay"); } }), false);
  const step = await peer.officeStep.findFirstOrThrow({ where: { jobId: job.id } });
  assert.equal(step.status, "QUEUED");
  assert.equal(step.result, null);
  await controlJob(peer, job.id, user, "resume");
  await runNext(peer, { plan: async () => plan, readOnly: async () => "Fresh evidence" });
  assert.equal((await peer.officeStep.findFirstOrThrow({ where: { jobId: job.id } })).result, "Fresh evidence");
});

test("a second client cancelling execution fences the in-flight result", async () => {
  const job = await approvedJob();
  const entered = deferred(), gate = deferred();
  const worker = runNext(db, { plan: async () => plan, readOnly: async () => {
    entered.resolve(); await gate.promise; return "Cancelled result";
  } });
  try {
    await bounded(entered.promise);
    await controlJob(peer, job.id, user, "cancel");
  } finally { gate.resolve(); await worker; }
  assert.equal((await owned(db, job.id, user)).status, "CANCELLED");
  assert.equal((await db.officeStep.findFirstOrThrow({ where: { jobId: job.id } })).result, null);
  assert.equal(await db.officeEvent.count({ where: { jobId: job.id, type: "step.completed" } }), 0);
});

test("killed planner process leaves a durable lease and a replacement can plan once", async () => {
  const job = await createJob(db, user, "Synthetic planner crash", "development");
  const worker = await blockedProcess("planning");
  try {
    const [{ pid }] = await db.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    assert.notEqual(worker.backendPid, pid);
    const claimed = await owned(db, job.id, user);
    assert.equal(claimed.status, "PLANNING");
    assert.ok(claimed.leaseToken);
    assert.equal(await worker.stop(), "SIGKILL");
    assert.equal((await owned(db, job.id, user)).leaseToken, claimed.leaseToken);
    // Advance the persisted expiry; do not wait 30s or alter the worker clock.
    await db.officeJob.update({ where: { id: job.id }, data: { leaseUntil: new Date(0) } });
    assert.equal(await recoverExpired(peer), 1);
    assert.equal(await recoverExpired(db), 0);
    await runNext(peer, { plan: async () => ({ ...plan, summary: "Post-crash replacement" }) });
    const current = await owned(db, job.id, user);
    assert.equal(current.status, "PENDING_PLAN_APPROVAL");
    assert.equal(current.planVersion, 1);
    assert.equal(await db.officeEvent.count({ where: { jobId: job.id, type: "plan.ready" } }), 1);
  } finally { await worker.stop(); }
});

test("killed execution process pauses on recovery until staff explicitly resume", async () => {
  const job = await approvedJob();
  const worker = await blockedProcess("executing");
  try {
    assert.equal((await owned(db, job.id, user)).status, "RUNNING");
    assert.equal((await db.officeStep.findFirstOrThrow({ where: { jobId: job.id } })).attempts, 1);
    assert.equal(await worker.stop(), "SIGKILL");
    await db.officeJob.update({ where: { id: job.id }, data: { leaseUntil: new Date(0) } });
    assert.equal(await recoverExpired(peer), 1);
    const paused = await owned(db, job.id, user);
    assert.equal(paused.status, "PAUSED");
    assert.equal(paused.errorCode, "WORKER_INTERRUPTED");
    let executions = 0;
    const services = { plan: async () => plan, readOnly: async () => { executions++; return "Post-crash evidence"; } };
    assert.equal(await runNext(peer, services), false);
    assert.equal(executions, 0);
    assert.equal((await db.officeStep.findFirstOrThrow({ where: { jobId: job.id } })).result, null);
    await controlJob(db, job.id, user, "resume");
    await runNext(peer, services);
    assert.equal(executions, 1);
    const step = await db.officeStep.findFirstOrThrow({ where: { jobId: job.id } });
    assert.equal(step.attempts, 2);
    assert.equal(step.result, "Post-crash evidence");
    await runNext(peer, services);
    assert.equal((await owned(db, job.id, user)).status, "SUCCEEDED");
    assert.equal(await db.officeEvent.count({ where: { jobId: job.id, type: "step.completed" } }), 1);
  } finally { await worker.stop(); }
});

test("independent backends atomically share the five-attempt login budget", async () => {
  const reservations = await Promise.all(Array.from({ length: 10 }, (_, i) => reserveAttempt(i % 2 ? db : peer, "local", "race.budget")));
  assert.equal(reservations.filter(Boolean).length, 5);
  assert.equal(await reserveAttempt(peer, "local", "race.budget"), false);
  assert.equal(await reserveAttempt(peer, "school-ad", "race.budget"), true);
});
test("concurrent bootstrap, credential and directory conflicts preserve one identity", async () => {
  const attempts = await Promise.allSettled([db, peer].map((connection, index) => bootstrapLocalAdmin(connection, { name: "Synthetic admin", email: `bootstrap${index}@example.test`, username: `bootstrap.admin.${index}`, password: "synthetic-admin-password" })));
  assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.user.count({ where: { role: "ADMIN" } }), 1);
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const duplicates = await Promise.allSettled([db, peer].map((connection, index) => createLocalUser(connection, admin.id, { name: "Synthetic teacher", email: `duplicate${index}@example.test`, username: "duplicate.teacher", password: "synthetic-teacher-password" })));
  assert.equal(duplicates.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.localCredential.count({ where: { username: "duplicate.teacher" } }), 1);
  const identity = { directoryId: "qualification", objectGuid: "23".repeat(16) };
  const links = await Promise.allSettled([linkDirectoryUser(db, admin.id, user, identity), linkDirectoryUser(peer, admin.id, admin.id, identity)]);
  assert.equal(links.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(await db.directoryIdentity.count({ where: identity }), 1);
});

test("six independent workers drain 32 approved jobs without duplicate execution", async () => {
  const workers = Array.from({ length: 6 }, client);
  const planning = new Map<string, number>(), execution = new Map<string, number>();
  const services = {
    plan: async (goal: string) => {
      planning.set(goal, (planning.get(goal) ?? 0) + 1);
      await new Promise(done => setTimeout(done, 10));
      return { ...plan, steps: [{ ...plan.steps[0], instructions: goal }] };
    },
    readOnly: async (instructions: string) => {
      execution.set(instructions, (execution.get(instructions) ?? 0) + 1);
      await new Promise(done => setTimeout(done, 10));
      return "Synthetic load evidence";
    },
  };
  const drain = async () => {
    const outcomes = await Promise.allSettled(workers.map(async connection => { while (await runNext(connection, services)) { /* real claims/leases */ } }));
    for (const outcome of outcomes) if (outcome.status === "rejected") throw outcome.reason;
  };
  try {
    const pids = await Promise.all(workers.map(connection => connection.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`));
    assert.equal(new Set(pids.map(rows => rows[0].pid)).size, 6);
    for (let index = 0; index < 32; index++) await createJob(db, user, `Synthetic load goal ${index}`, "development");
    await drain();
    const jobs = await db.officeJob.findMany();
    assert.equal(jobs.length, 32);
    assert.ok(jobs.every(job => job.status === "PENDING_PLAN_APPROVAL"));
    for (const job of jobs) await approvePlan(db, job.id, user, job.planVersion, job.planHash!, "approve");
    await drain();
    assert.equal(await db.officeJob.count({ where: { status: "SUCCEEDED", leaseToken: null } }), 32,
      JSON.stringify(await db.officeJob.findMany({ where: { status: { not: "SUCCEEDED" } }, select: { status: true, errorCode: true } })));
    assert.equal(planning.size, 32); assert.ok(Array.from(planning.values()).every(count => count === 1));
    assert.equal(execution.size, 32); assert.ok(Array.from(execution.values()).every(count => count === 1));
    assert.equal(await db.officeEvent.count({ where: { type: "step.completed" } }), 32);
    assert.equal(await db.officeEvent.count({ where: { type: "job.completed" } }), 32);
    assert.equal(await recoverExpired(db), 0);
  } finally { await Promise.all(workers.map(connection => connection.$disconnect())); }
});

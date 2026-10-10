import type { CodexAudit } from "./readonly";
import { resolvePolicy, policyHash, assertCapability, requireSyntheticExecution, type ExecutionPolicy } from "../task-policy/policy";
import { beginAttempt, appendOutput, finishAttempt, finishInTransaction, recoverAttempts } from "../task-audit/store";
import { recordOutput } from "../task-audit/invoke";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { emit, installPlan, serial } from "./store";
import { planSchema, type OfficePlan } from "./plan";

export type WorkerServices = {
  plan(goal: string, team: string, signal: AbortSignal, policy?: ExecutionPolicy, parentId?: string): Promise<OfficePlan>;
  readOnly?(instructions: string, signal: AbortSignal, policy?: ExecutionPolicy, audit?: CodexAudit): Promise<string>;
};
const leaseMs = 30_000;

export async function recoverExpired(db: PrismaClient) {
  await recoverAttempts(db);
  return serial(db, async tx => {
    const stale = await tx.officeJob.findMany({ where: { leaseUntil: { lte: new Date() }, leaseToken: { not: null } } });
    for (const job of stale) {
      await tx.taskAttempt.updateMany({where:{jobId:job.id,leaseToken:job.leaseToken,status:"RUNNING"},data:{status:"INTERRUPTED",finishedAt:new Date(),errorCode:"WORKER_INTERRUPTED"}});
      const planning = job.status === "PLANNING";
      await tx.officeJob.update({ where: { id: job.id }, data: { status: planning ? "PLANNING" : "PAUSED", leaseToken: null, leaseUntil: null, errorCode: "WORKER_INTERRUPTED" } });
      await tx.officeStep.updateMany({ where: { jobId: job.id, status: "RUNNING" }, data: { status: "QUEUED" } });
      await emit(tx, job.id, "worker.recovered", { status: planning ? "PLANNING" : "PAUSED" });
    }
    return stale.length;
  });
}

export async function runNext(db: PrismaClient, services: WorkerServices, shutdown?: AbortSignal): Promise<boolean> {
  const token = randomUUID();
  const job = await db.$transaction(async tx => {
    // Lock one available row without forcing every worker to retry the oldest
    // candidate. All later writes retain their token/version fencing.
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "OfficeJob"
      WHERE "status" IN ('PLANNING', 'QUEUED') AND "leaseToken" IS NULL
      ORDER BY "createdAt", "id" LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!rows.length) return null;
    const candidate = await tx.officeJob.findUniqueOrThrow({ where: { id: rows[0].id } });
    const updated = await tx.officeJob.update({ where: { id: candidate.id }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + leaseMs), ...(candidate.status === "QUEUED" ? { status: "RUNNING" } : {}) } });
    await emit(tx, updated.id, "worker.claimed", { status: updated.status });
    return updated;
  }, { isolationLevel: "ReadCommitted" });
  if (!job) return false;
  const controller = new AbortController();
  const abort = () => controller.abort();
  shutdown?.addEventListener("abort", abort, { once: true });
  if (shutdown?.aborted) abort();
  let beating = false;
  const heartbeat = setInterval(async () => {
    if (beating) return;
    beating = true;
    try {
      const result = await db.officeJob.updateMany({ where: { id: job.id, leaseToken: token, status: { in: ["RUNNING", "PLANNING"] }, leaseUntil: { gt: new Date() } }, data: { leaseUntil: new Date(Date.now() + leaseMs) } });
      if (!result.count) controller.abort();
    } catch { controller.abort(); }
    finally { beating = false; }
  }, 2000);
  let attemptId: string | undefined, executionAttemptId: string | undefined;
  try {
    requireSyntheticExecution();
    const policy = await resolvePolicy(db, job.userId, job.team);
    if (job.policyHash !== policyHash(policy)) throw new Error("POLICY_CHANGED");
    const attempt = await beginAttempt(db, {actorId:job.userId,policy,jobId:job.id,invocationKey:token,executor:job.status === "PLANNING" ? "planner" : "worker",input:Buffer.from(JSON.stringify({goal:job.goal,team:job.team,plan:job.plan})),leaseToken:token,planVersion:job.planVersion});
    attemptId = attempt.id;
    if (job.status === "PLANNING") {
      const plan = await services.plan(job.goal, job.team, controller.signal, policy, attemptId);
      if (controller.signal.aborted) throw new Error("JOB_INTERRUPTED");
      await recordOutput(db, attemptId, Buffer.from(JSON.stringify(plan)));
      await installPlan(db, job.id, plan, token, attemptId);
    } else {
      if (job.approvedVersion !== job.planVersion) throw new Error("APPROVAL_REQUIRED");
      const plan = planSchema.parse(job.plan);
      const current = await db.officeStep.findMany({ where: { jobId: job.id } });
      const completed = new Set(current.filter(step => step.status === "SUCCEEDED").map(step => step.key));
      const next = plan.steps.find(step => !completed.has(step.id) && step.dependsOn.every(id => completed.has(id)));
      if (!next) {
        if (completed.size !== plan.steps.length) throw new Error("PLAN_INCOMPLETE");
        await recordOutput(db, attemptId, Buffer.from("Job completed"));
        await finishLease(db, job.id, token, "SUCCEEDED", "job.completed", attemptId);
      } else if (next.executor === "manual") {
        await recordOutput(db, attemptId, Buffer.from(JSON.stringify({status:"WAITING_INPUT",key:next.id})));
        await serial(db, async tx => {
          const live = await tx.officeJob.findFirst({ where: { id: job.id, leaseToken: token, status: "RUNNING", leaseUntil: { gt: new Date() } } });
          if (!live) throw new Error("LEASE_LOST");
          await finishInTransaction(tx, attemptId!, "SUCCEEDED");
          await tx.officeStep.update({ where: { jobId_key: { jobId: job.id, key: next.id } }, data: { status: "WAITING_INPUT" } });
          await tx.officeJob.update({ where: { id: job.id }, data: { status: "WAITING_INPUT", leaseToken: null, leaseUntil: null } });
          await emit(tx, job.id, "step.waiting", { key: next.id, agent: next.agent, status: "WAITING_INPUT" });
        });
      } else {
        assertCapability(policy, "codexReadonly");
        if (!services.readOnly) throw new Error("CODEX_NOT_CONFIGURED");
        await serial(db, async tx => {
          const live = await tx.officeJob.findFirst({ where: { id: job.id, leaseToken: token, status: "RUNNING", leaseUntil: { gt: new Date() } } });
          if (!live) throw new Error("JOB_INTERRUPTED");
          await tx.officeStep.update({ where: { jobId_key: { jobId: job.id, key: next.id } }, data: { status: "RUNNING", attempts: { increment: 1 } } });
          await emit(tx, job.id, "step.started", { key: next.id, agent: next.agent });
        });
        let outputSequence = 0;
        const result = await services.readOnly(next.instructions, controller.signal, policy, {
          input: async text => {
            if (executionAttemptId) throw new Error("AUDIT_SEQUENCE");
            executionAttemptId = (await beginAttempt(db,{actorId:job.userId,policy,parentId:attemptId,jobId:job.id,stepId:next.id,invocationKey:randomUUID(),executor:"codex.readonly",leaseToken:token,planVersion:job.planVersion,input:Buffer.from(text)})).id;
          },
          output: async text => {
            if (!executionAttemptId) throw new Error("AUDIT_REQUIRED");
            const bytes = Buffer.from(text);
            for (let offset=0; offset<bytes.length; offset+=65536) await appendOutput(db,executionAttemptId,outputSequence++,bytes.subarray(offset,offset+65536));
          },
        });
        await recordOutput(db, attemptId, Buffer.from(result));
        if (controller.signal.aborted || !result.trim()) throw new Error("JOB_INTERRUPTED");
        await serial(db, async tx => {
          const live = await tx.officeJob.findFirst({ where: { id: job.id, leaseToken: token, status: "RUNNING", leaseUntil: { gt: new Date() } } });
          if (!live) throw new Error("LEASE_LOST");
          if (executionAttemptId) await finishInTransaction(tx, executionAttemptId, "SUCCEEDED");
          await finishInTransaction(tx, attemptId!, "SUCCEEDED");
          await tx.officeStep.update({ where: { jobId_key: { jobId: job.id, key: next.id } }, data: { status: "SUCCEEDED", result: result.slice(0, 20_000) } });
          await tx.officeJob.update({ where: { id: job.id }, data: { status: "QUEUED", leaseToken: null, leaseUntil: null } });
          await emit(tx, job.id, "step.completed", { key: next.id, agent: next.agent, status: "QUEUED" });
        });
      }
    }
  } catch (error) {
    if (executionAttemptId) await finishAttempt(db, executionAttemptId, controller.signal.aborted ? "CANCELLED" : "FAILED", "EXECUTION_FAILED").catch(() => {});
    if (attemptId) await finishAttempt(db, attemptId, error instanceof Error && error.message === "POLICY_DENIED" ? "DENIED" : controller.signal.aborted ? "CANCELLED" : "FAILED", "EXECUTION_FAILED").catch(() => {});
    const known = new Set(["POLICY_CHANGED", "POLICY_DENIED", "SCHOOL_EXECUTION_NOT_READY", "LOCAL_MODEL_NOT_CONFIGURED", "AUDIT_STORAGE_UNAVAILABLE", "HERMES_NOT_CONFIGURED", "HERMES_TIMEOUT", "HERMES_INVALID_PLAN", "HERMES_UNAVAILABLE", "HERMES_START_FAILED", "CODEX_NOT_CONFIGURED", "APPROVAL_REQUIRED", "JOB_INTERRUPTED"]);
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? `DATABASE_${error.code}` : error instanceof Error && known.has(error.message) ? error.message : "WORKER_FAILED";
    await serial(db, async tx => {
      const changed = await tx.officeJob.updateMany({ where: { id: job.id, leaseToken: token }, data: { status: "FAILED", errorCode: code, leaseToken: null, leaseUntil: null } });
      if (changed.count) await emit(tx, job.id, "job.failed", { code, status: "FAILED" });
    });
  } finally {
    clearInterval(heartbeat); shutdown?.removeEventListener("abort", abort);
  }
  return true;
}

async function finishLease(db: PrismaClient, id: string, token: string, status: "SUCCEEDED", event: string, attemptId: string) {
  await serial(db, async tx => {
    await finishInTransaction(tx, attemptId, "SUCCEEDED");
    const updated = await tx.officeJob.updateMany({ where: { id, leaseToken: token, status: "RUNNING", leaseUntil: { gt: new Date() } }, data: { status, leaseToken: null, leaseUntil: null } });
    if (updated.count) await emit(tx, id, event, { status });
  });
}

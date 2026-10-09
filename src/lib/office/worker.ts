import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { emit, installPlan, serial } from "./store";
import { planSchema, type OfficePlan } from "./plan";

export type WorkerServices = {
  plan(goal: string, team: string, signal: AbortSignal): Promise<OfficePlan>;
  readOnly?(instructions: string, signal: AbortSignal): Promise<string>;
};
const leaseMs = 30_000;

export async function recoverExpired(db: PrismaClient) {
  return serial(db, async tx => {
    const stale = await tx.officeJob.findMany({ where: { leaseUntil: { lte: new Date() }, leaseToken: { not: null } } });
    for (const job of stale) {
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
  const job = await serial(db, async tx => {
    const candidate = await tx.officeJob.findFirst({ where: { status: { in: ["PLANNING", "QUEUED"] }, leaseToken: null }, orderBy: { createdAt: "asc" } });
    if (!candidate) return null;
    const updated = await tx.officeJob.update({ where: { id: candidate.id }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + leaseMs), ...(candidate.status === "QUEUED" ? { status: "RUNNING" } : {}) } });
    await emit(tx, updated.id, "worker.claimed", { status: updated.status });
    return updated;
  });
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
  try {
    if (job.status === "PLANNING") {
      const plan = await services.plan(job.goal, job.team, controller.signal);
      if (controller.signal.aborted) throw new Error("JOB_INTERRUPTED");
      await installPlan(db, job.id, plan, token);
    } else {
      if (job.approvedVersion !== job.planVersion) throw new Error("APPROVAL_REQUIRED");
      const plan = planSchema.parse(job.plan);
      const current = await db.officeStep.findMany({ where: { jobId: job.id } });
      const completed = new Set(current.filter(step => step.status === "SUCCEEDED").map(step => step.key));
      const next = plan.steps.find(step => !completed.has(step.id) && step.dependsOn.every(id => completed.has(id)));
      if (!next) {
        if (completed.size !== plan.steps.length) throw new Error("PLAN_INCOMPLETE");
        await finishLease(db, job.id, token, "SUCCEEDED", "job.completed");
      } else if (next.executor === "manual") {
        await serial(db, async tx => {
          const live = await tx.officeJob.findFirst({ where: { id: job.id, leaseToken: token, status: "RUNNING", leaseUntil: { gt: new Date() } } });
          if (!live) return;
          await tx.officeStep.update({ where: { jobId_key: { jobId: job.id, key: next.id } }, data: { status: "WAITING_INPUT" } });
          await tx.officeJob.update({ where: { id: job.id }, data: { status: "WAITING_INPUT", leaseToken: null, leaseUntil: null } });
          await emit(tx, job.id, "step.waiting", { key: next.id, agent: next.agent, status: "WAITING_INPUT" });
        });
      } else {
        if (!services.readOnly) throw new Error("CODEX_NOT_CONFIGURED");
        await serial(db, async tx => {
          const live = await tx.officeJob.findFirst({ where: { id: job.id, leaseToken: token, status: "RUNNING", leaseUntil: { gt: new Date() } } });
          if (!live) throw new Error("JOB_INTERRUPTED");
          await tx.officeStep.update({ where: { jobId_key: { jobId: job.id, key: next.id } }, data: { status: "RUNNING", attempts: { increment: 1 } } });
          await emit(tx, job.id, "step.started", { key: next.id, agent: next.agent });
        });
        const result = await services.readOnly(next.instructions, controller.signal);
        if (controller.signal.aborted || !result.trim()) throw new Error("JOB_INTERRUPTED");
        await serial(db, async tx => {
          const live = await tx.officeJob.findFirst({ where: { id: job.id, leaseToken: token, status: "RUNNING", leaseUntil: { gt: new Date() } } });
          if (!live) return;
          await tx.officeStep.update({ where: { jobId_key: { jobId: job.id, key: next.id } }, data: { status: "SUCCEEDED", result: result.slice(0, 20_000) } });
          await tx.officeJob.update({ where: { id: job.id }, data: { status: "QUEUED", leaseToken: null, leaseUntil: null } });
          await emit(tx, job.id, "step.completed", { key: next.id, agent: next.agent, status: "QUEUED" });
        });
      }
    }
  } catch (error) {
    const known = new Set(["HERMES_NOT_CONFIGURED", "HERMES_TIMEOUT", "HERMES_INVALID_PLAN", "HERMES_UNAVAILABLE", "HERMES_START_FAILED", "CODEX_NOT_CONFIGURED", "APPROVAL_REQUIRED", "JOB_INTERRUPTED"]);
    const code = error instanceof Error && known.has(error.message) ? error.message : "WORKER_FAILED";
    await serial(db, async tx => {
      const changed = await tx.officeJob.updateMany({ where: { id: job.id, leaseToken: token }, data: { status: "FAILED", errorCode: code, leaseToken: null, leaseUntil: null } });
      if (changed.count) await emit(tx, job.id, "job.failed", { code, status: "FAILED" });
    });
  } finally {
    clearInterval(heartbeat); shutdown?.removeEventListener("abort", abort);
  }
  return true;
}

async function finishLease(db: PrismaClient, id: string, token: string, status: "SUCCEEDED", event: string) {
  await serial(db, async tx => {
    const updated = await tx.officeJob.updateMany({ where: { id, leaseToken: token, status: "RUNNING", leaseUntil: { gt: new Date() } }, data: { status, leaseToken: null, leaseUntil: null } });
    if (updated.count) await emit(tx, id, event, { status });
  });
}

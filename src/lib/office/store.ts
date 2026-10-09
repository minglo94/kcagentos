import { Prisma, PrismaClient, type OfficeStatus } from "@prisma/client";
import { hashPlan, OfficeError, planSchema, type OfficePlan } from "./plan";

type Tx = Prisma.TransactionClient;
export const emit = (tx: Tx, jobId: string, type: string, data: Prisma.InputJsonObject = {}) => tx.officeEvent.create({ data: { jobId, type, data } });

export async function serial<T>(db: PrismaClient, action: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(action, { isolationLevel: "Serializable" }); }
    catch (error) {
      if (attempt < 7 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
        // Bounded backoff prevents synchronized writers from exhausting all
        // retries before the competing transaction can finish.
        await new Promise(resolve => setTimeout(resolve, Math.min(100, 5 * 2 ** attempt) + Math.floor(Math.random() * 10)));
        continue;
      }
      throw error;
    }
  }
}

export async function owned(tx: Tx | PrismaClient, id: string, userId: string) {
  const job = await tx.officeJob.findFirst({ where: { id, userId } });
  if (!job) throw new OfficeError(404, "JOB_NOT_FOUND");
  return job;
}

export async function createJob(db: PrismaClient, userId: string, goal: string, team: string) {
  return serial(db, async tx => {
    const job = await tx.officeJob.create({ data: { userId, goal, team } });
    await emit(tx, job.id, "job.created", { status: job.status });
    return job;
  });
}

export async function installPlan(db: PrismaClient, jobId: string, plan: OfficePlan, leaseToken: string) {
  const parsed = planSchema.parse(plan);
  return serial(db, async tx => {
    const job = await tx.officeJob.findFirst({ where: { id: jobId, status: "PLANNING", leaseToken, leaseUntil: { gt: new Date() } } });
    if (!job) throw new OfficeError(409, "LEASE_LOST");
    if (parsed.steps.some(step => step.executor === "codex.readonly" && (job.team !== "development" || !["archie", "reviewer"].includes(step.agent)))) throw new OfficeError(400, "INVALID_EXECUTOR_SCOPE");
    const updated = await tx.officeJob.update({ where: { id: jobId }, data: {
      plan: parsed, planHash: hashPlan(parsed), planVersion: { increment: 1 }, approvedVersion: null,
      status: "PENDING_PLAN_APPROVAL", leaseToken: null, leaseUntil: null, errorCode: null,
    } });
    await tx.officeStep.deleteMany({ where: { jobId } });
    await tx.officeStep.createMany({ data: parsed.steps.map(step => ({ jobId, key: step.id })) });
    await emit(tx, jobId, "plan.ready", { version: updated.planVersion, status: updated.status });
    return updated;
  });
}

export async function approvePlan(db: PrismaClient, jobId: string, userId: string, version: number, hash: string, decision: "approve" | "reject", reason?: string) {
  return serial(db, async tx => {
    const job = await owned(tx, jobId, userId);
    if (job.planVersion !== version || job.planHash !== hash) throw new OfficeError(409, "STALE_PLAN");
    const existing = await tx.officeApproval.findUnique({ where: { jobId_planVersion: { jobId, planVersion: version } } });
    if (existing) {
      if (existing.decision !== decision) throw new OfficeError(409, "ALREADY_DECIDED");
      return job;
    }
    if (job.status !== "PENDING_PLAN_APPROVAL") throw new OfficeError(409, "NOT_AWAITING_APPROVAL");
    await tx.officeApproval.create({ data: { jobId, planVersion: version, planHash: hash, actorId: userId, decision, reason } });
    const updated = await tx.officeJob.update({ where: { id: jobId }, data: {
      status: decision === "approve" ? "QUEUED" : "PAUSED", approvedVersion: decision === "approve" ? version : null,
    } });
    await emit(tx, jobId, "plan.decision", { decision, version, status: updated.status });
    return updated;
  });
}

export async function controlJob(db: PrismaClient, id: string, userId: string, action: "pause" | "resume" | "cancel" | "replan") {
  return serial(db, async tx => {
    const job = await owned(tx, id, userId);
    if (["SUCCEEDED", "CANCELLED"].includes(job.status)) throw new OfficeError(409, "JOB_FINISHED");
    let status: OfficeStatus;
    if (action === "cancel") status = "CANCELLED";
    else if (action === "pause") status = "PAUSED";
    else if (action === "replan") {
      if (["RUNNING", "QUEUED", "WAITING_INPUT"].includes(job.status)) throw new OfficeError(409, "PAUSE_BEFORE_REPLAN");
      status = "PLANNING";
    } else {
      if (job.status !== "PAUSED" || job.approvedVersion !== job.planVersion) throw new OfficeError(409, "APPROVAL_REQUIRED");
      status = "QUEUED";
    }
    // Lease fencing stops stale workers writing after pause/cancel.
    const updated = await tx.officeJob.update({ where: { id }, data: { status, leaseToken: null, leaseUntil: null,
      ...(action === "replan" ? { approvedVersion: null, plan: Prisma.DbNull, planHash: null } : {}),
    } });
    if (action === "pause") await tx.officeStep.updateMany({ where: { jobId: id, status: "RUNNING" }, data: { status: "QUEUED" } });
    await emit(tx, id, "job.control", { action, status });
    return updated;
  });
}

export async function completeManual(db: PrismaClient, id: string, userId: string, key: string, evidence: string, version: number, hash: string) {
  return serial(db, async tx => {
    const job = await owned(tx, id, userId);
    if (job.planVersion !== version || job.planHash !== hash) throw new OfficeError(409, "STALE_PLAN");
    if (job.status !== "WAITING_INPUT" || job.approvedVersion !== job.planVersion) throw new OfficeError(409, "NOT_WAITING_INPUT");
    const step = await tx.officeStep.findUnique({ where: { jobId_key: { jobId: id, key } } });
    if (!step || step.status !== "WAITING_INPUT") throw new OfficeError(409, "STEP_NOT_WAITING");
    await tx.officeStep.update({ where: { id: step.id }, data: { status: "SUCCEEDED", result: evidence } });
    await tx.officeJob.update({ where: { id }, data: { status: "QUEUED" } });
    await emit(tx, id, "step.completed", { key, source: "staff", status: "QUEUED" });
  });
}

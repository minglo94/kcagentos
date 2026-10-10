import { randomUUID } from "node:crypto";
import { resolvePolicy, policyHash, requireSyntheticExecution } from "../task-policy/policy";
import { recordOutput } from "../task-audit/invoke";
import { beginAttempt, finishAttempt, finishInTransaction } from "../task-audit/store";
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
  requireSyntheticExecution();
  const policy = await resolvePolicy(db, userId, team);
  const id = randomUUID();
  const attempt = await beginAttempt(db, {actorId:userId,policy,jobId:id,invocationKey:randomUUID(),executor:"job.create",input:Buffer.from(JSON.stringify({goal,team}))});
  try {
  await recordOutput(db, attempt.id, Buffer.from(JSON.stringify({id,status:"PLANNING"})));
  return await serial(db, async tx => {
    await finishInTransaction(tx, attempt.id, "SUCCEEDED");
    const job = await tx.officeJob.create({ data: { id, userId, goal, team, executionPolicy:policy as unknown as Prisma.InputJsonObject, policyHash:policyHash(policy) } });
    await emit(tx, job.id, "job.created", { status: job.status });
    return job;
  });
  } catch(e) { await finishAttempt(db, attempt.id, "FAILED", "JOB_CREATE_FAILED").catch(()=>{}); throw e; }
}

export async function installPlan(db: PrismaClient, jobId: string, plan: OfficePlan, leaseToken: string, attemptId?: string) {
  const parsed = planSchema.parse(plan);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "OfficeJob" WHERE "id"=${jobId} FOR UPDATE`;
    const job = await tx.officeJob.findFirst({ where: { id: jobId, status: "PLANNING", leaseToken, leaseUntil: { gt: new Date() } } });
    if (!job) throw new OfficeError(409, "LEASE_LOST");
    if (parsed.steps.some(step => step.executor === "codex.readonly" && (job.team !== "development" || !["archie", "reviewer"].includes(step.agent)))) throw new OfficeError(400, "INVALID_EXECUTOR_SCOPE");
    if (attemptId) await finishInTransaction(tx, attemptId, "SUCCEEDED");
    const updated = await tx.officeJob.update({ where: { id: jobId }, data: {
      plan: parsed, planHash: hashPlan(parsed), planVersion: { increment: 1 }, approvedVersion: null,
      status: "PENDING_PLAN_APPROVAL", leaseToken: null, leaseUntil: null, errorCode: null,
    } });
    await tx.officeStep.deleteMany({ where: { jobId } });
    await tx.officeStep.createMany({ data: parsed.steps.map(step => ({ jobId, key: step.id })) });
    await emit(tx, jobId, "plan.ready", { version: updated.planVersion, status: updated.status });
    return updated;
  }, {isolationLevel:"ReadCommitted"});
}

export async function approvePlan(db: PrismaClient, jobId: string, userId: string, version: number, hash: string, decision: "approve" | "reject", reason?: string) {
  const initial = await owned(db, jobId, userId);
  const currentPolicy = await resolvePolicy(db,userId,initial.team);
  return serial(db, async tx => {
    const job = await owned(tx, jobId, userId);
    if (job.policyHash !== policyHash(currentPolicy)) throw new OfficeError(409, "POLICY_CHANGED");
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
  const initial = await owned(db,id,userId);
  const currentPolicy = await resolvePolicy(db,userId,initial.team);
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
      ...(action === "replan" ? { approvedVersion: null, plan: Prisma.DbNull, planHash: null, executionPolicy:currentPolicy as unknown as Prisma.InputJsonObject, policyHash:policyHash(currentPolicy) } : {}),
    } });
    if (action === "pause") await tx.officeStep.updateMany({ where: { jobId: id, status: "RUNNING" }, data: { status: "QUEUED" } });
    await emit(tx, id, "job.control", { action, status });
    return updated;
  });
}

export async function completeManual(db: PrismaClient, id: string, userId: string, key: string, evidence: string, version: number, hash: string) {
  requireSyntheticExecution();
  const initial = await owned(db, id, userId);
  const policy = await resolvePolicy(db,userId,initial.team);
  const attempt = await beginAttempt(db,{actorId:userId,policy,jobId:id,stepId:key,invocationKey:randomUUID(),executor:"manual.evidence",input:Buffer.from(JSON.stringify({key,evidence,version,hash}))});
  try {
  await recordOutput(db,attempt.id,Buffer.from("Evidence accepted"));

  return await serial(db, async tx => {
    const job = await owned(tx, id, userId);
    if (job.policyHash !== policyHash(policy)) throw new OfficeError(409,"POLICY_CHANGED");
    if (job.planVersion !== version || job.planHash !== hash) throw new OfficeError(409, "STALE_PLAN");
    if (job.status !== "WAITING_INPUT" || job.approvedVersion !== job.planVersion) throw new OfficeError(409, "NOT_WAITING_INPUT");
    const step = await tx.officeStep.findUnique({ where: { jobId_key: { jobId: id, key } } });
    if (!step || step.status !== "WAITING_INPUT") throw new OfficeError(409, "STEP_NOT_WAITING");
    await finishInTransaction(tx,attempt.id,"SUCCEEDED");
    await tx.officeStep.update({ where: { id: step.id }, data: { status: "SUCCEEDED", result: evidence } });
    await tx.officeJob.update({ where: { id }, data: { status: "QUEUED" } });
    await emit(tx, id, "step.completed", { key, source: "staff", status: "QUEUED" });
  });
  } catch(e) { await finishAttempt(db,attempt.id,"FAILED","EVIDENCE_REJECTED").catch(()=>{});throw e; }
}

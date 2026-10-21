import { resolvePolicy, policyHash, requireSyntheticExecution } from "../task-policy/policy";
import { finishInTransaction } from "../task-audit/store";
import { createHash } from "node:crypto";
import { PrismaClient, type Prisma, type OfficeJob } from "@prisma/client";
import { hashPlan, OfficeError, planSchema } from "./plan";
import { emit, owned, serial } from "./store";
import { hashPortalRequest, portalInputSchema, portalResponseSchema, type PortalInput, type PortalRequest } from "./portal-contract";
import type { PortalClient } from "./portal-contract";
import { currentTeacherMapping } from './teacher-auth';

export async function assertTeacherExecution(db: PrismaClient | Prisma.TransactionClient, job: OfficeJob) {
  const link=await db.portalTeacherRequest.findUnique({where:{jobId:job.id}});
  if(!link)return; // Preserve explicitly configured pinned v1 jobs.
  const mapping=await currentTeacherMapping(db,link.issuer,link.portalStaffId);
  if(mapping.id!==link.mappingId||mapping.userId!==job.userId)throw new OfficeError(403,'PORTAL_ACCESS_DENIED');
  const decision=await db.portalTeacherDecision.findFirst({where:{requestId:link.requestId,planVersion:job.planVersion,planHash:job.planHash!,decision:'approve'}});
  if(!decision)throw new OfficeError(403,'APPROVAL_REQUIRED');
}

export async function createPortalDraftJob(db: PrismaClient, userId: string, input: PortalInput) {
  return serial(db, tx => createPortalDraftJobTx(tx, userId, input));
}
export async function createPortalDraftJobTx(tx: Prisma.TransactionClient, userId: string, input: PortalInput) {
  requireSyntheticExecution();
  const args = portalInputSchema.parse(input);
  const plan = planSchema.parse({ summary: "總管使用班務草稿流程 v1；只調用 Portal 核對及產出，不發送。這是固定模板，並非模型生成。", acceptance: ["Portal 核對來源日期、身份、完整性及行數", "取得 Portal 草稿版本及來源證據引用；正式內容審批及發送仍在 Portal"], steps: [{ id: "daily_summary", agent: "andy", executor: "portal.draft", title: "核對並建立班務草稿", instructions: "按已批准班別及來源批次建立草稿；缺漏、身份或日期不符停止。", dependsOn: [], portalInput: args }] });
    const staff = await tx.user.findFirst({ where: { id: userId, isActive: true } });
    if (!staff) throw new OfficeError(403, "PORTAL_ACCESS_DENIED");
    const policy=await resolvePolicy(tx,userId,"school");
    const job = await tx.officeJob.create({ data: { userId, executionPolicy:policy as unknown as Prisma.InputJsonObject, policyHash:policyHash(policy), team: "school", goal: `班務草稿 · ${args.date}`, status: "PENDING_PLAN_APPROVAL", plan, planHash: hashPlan(plan), planVersion: 1 } });
    await tx.officeStep.create({ data: { jobId: job.id, key: "daily_summary" } });
    await emit(tx, job.id, "plan.ready", { version: 1, template: "class.daily-summary.v1", status: job.status });
    return job;
}

export async function queuePortalRefresh(db: PrismaClient, id: string, userId: string, version: number, hash: string) {
  return serial(db, tx => queuePortalRefreshTx(tx, id, userId, version, hash));
}
export async function queuePortalRefreshTx(tx: Prisma.TransactionClient, id: string, userId: string, version: number, hash: string) {
    const job = await owned(tx, id, userId);
    if (job.planVersion !== version || job.planHash !== hash) throw new OfficeError(409, "STALE_PLAN");
    if (job.status !== "WAITING_INPUT" || job.approvedVersion !== version) throw new OfficeError(409, "NOT_WAITING_PORTAL");
    const step = await tx.officeStep.findFirst({ where: { jobId: id, status: "WAITING_PORTAL" } });
    if (!step) throw new OfficeError(409, "NOT_WAITING_PORTAL");
    await tx.officeJob.update({ where: { id }, data: { status: "QUEUED" } });
    await emit(tx, id, "portal.refresh_requested", { status: "QUEUED" });
}

export async function runPortalDraft(db: PrismaClient, job: OfficeJob, key: string, input: PortalInput, leaseToken: string, client: PortalClient, signal: AbortSignal, attemptId?: string) {
  const args = portalInputSchema.parse(input);
  const request = await serial(db, async tx => {
    const live = await tx.officeJob.findFirst({ where: { id: job.id, leaseToken, status: "RUNNING", approvedVersion: job.planVersion, leaseUntil: { gt: new Date() } } });
    if (!live) throw new Error("JOB_INTERRUPTED");
    await assertTeacherExecution(tx,live);
    const staff = await tx.user.findFirst({ where: { id: job.userId, isActive: true } });
    if (!staff) throw new Error("PORTAL_ACCESS_DENIED");
    const body = { parentJobId: job.id, planVersion: job.planVersion, stepKey: key, idempotencyKey: createHash("sha256").update(`${job.id}:${job.planVersion}:${key}`).digest("hex"), staff: { subject: staff.id, email: staff.email }, capability: "class.daily-summary.draft" as const, workflowVersion: 1 as const, input: args };
    const requestHash = hashPortalRequest(body);
    const record = await tx.portalOperation.upsert({ where: { jobId_planVersion_stepKey: { jobId: job.id, planVersion: job.planVersion, stepKey: key } }, update: {}, create: { jobId: job.id, planVersion: job.planVersion, stepKey: key, idempotencyKey: body.idempotencyKey, requestHash } });
    if (record.requestHash !== requestHash) throw new Error("PORTAL_CONFLICT");
    await tx.officeStep.update({ where: { jobId_key: { jobId: job.id, key } }, data: { status: "RUNNING", attempts: { increment: 1 } } });
    return { ...body, requestHash } satisfies PortalRequest;
  });
  // Reconcile first, including after uncertain POST outcomes and process restart.
  // Portal must atomically deduplicate the same request key/hash.
  let result;
  try {
    await assertTeacherExecution(db,job);
    result = await client.lookup(request, signal);
    if (!result) {
      const accepted = await db.portalOperation.findUniqueOrThrow({ where: { idempotencyKey: request.idempotencyKey } });
      if (accepted.operationId) throw new Error("PORTAL_RESULT_UNKNOWN");
      const live = await db.officeJob.findFirst({ where: { id: job.id, leaseToken, status: "RUNNING", leaseUntil: { gt: new Date() } } });
      if (!live || signal.aborted) throw new Error("JOB_INTERRUPTED");
      await assertTeacherExecution(db,live);
      result = await client.submit(request, signal);
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : "PORTAL_RESULT_UNKNOWN";
    if (!["PORTAL_RESULT_UNKNOWN", "PORTAL_INVALID_RESPONSE"].includes(message)) throw error;
    await serial(db, async tx => {
      await tx.portalOperation.updateMany({ where: { idempotencyKey: request.idempotencyKey, status: { notIn: ["DRAFT_READY", "FAILED"] } }, data: { status: "RESULT_UNKNOWN" } });
    });
    await serial(db,async tx=>{
      if(attemptId) {
        const live=await tx.officeJob.findFirst({where:{id:job.id,leaseToken,status:"RUNNING",leaseUntil:{gt:new Date()}}});
        await finishInTransaction(tx,attemptId,live?"SUCCEEDED":"INTERRUPTED");
      }
      const changed = await tx.officeJob.updateMany({ where: { id: job.id, leaseToken, status: "RUNNING", leaseUntil: { gt: new Date() } }, data: { status: "WAITING_INPUT", leaseToken: null, leaseUntil: null, errorCode: "PORTAL_RESULT_UNKNOWN" } });
      if (changed.count) {
        await tx.officeStep.update({ where: { jobId_key: { jobId: job.id, key } }, data: { status: "WAITING_PORTAL" } });
        await emit(tx, job.id, "portal.result_unknown", { status: "WAITING_INPUT" });
      }
    });
    return;
  }
  await serial(db, async tx => {
    const old = await tx.portalOperation.findUniqueOrThrow({ where: { idempotencyKey: request.idempotencyKey } });
    if (old.operationId && old.operationId !== result.operationId) throw new Error("PORTAL_CONFLICT");
    if (old.revision > result.revision) throw new Error("PORTAL_CONFLICT");
    if (["DRAFT_READY", "FAILED"].includes(old.status) && old.status !== result.status) throw new Error("PORTAL_CONFLICT");
    if (old.revision === result.revision && old.snapshot && JSON.stringify(portalResponseSchema.parse(old.snapshot)) !== JSON.stringify(result)) throw new Error("PORTAL_CONFLICT");
    // Record accepted external operation even if the parent was paused/cancelled in flight.
    await tx.portalOperation.update({ where: { id: old.id }, data: { operationId: result.operationId, status: result.status, revision: result.revision, snapshot: result } });
  });
  // Portal may have accepted the operation before revocation, cancellation or
  // audit expiry. Its durable receipt must survive any parent/audit rejection.
  await serial(db, async tx => {
    const live = await tx.officeJob.findFirst({ where: { id: job.id, leaseToken, status: "RUNNING", planVersion:job.planVersion, approvedVersion:job.planVersion, leaseUntil: { gt: new Date() } } });
    if (!live || signal.aborted) {if(attemptId)await finishInTransaction(tx,attemptId,"INTERRUPTED");return;}
    await assertTeacherExecution(tx,live);
    if(attemptId) await finishInTransaction(tx,attemptId,"SUCCEEDED");
    const done = result.status === "DRAFT_READY";
    const failed = result.status === "FAILED";
    await tx.officeStep.update({ where: { jobId_key: { jobId: job.id, key } }, data: { operationId: result.operationId, status: done ? "SUCCEEDED" : failed ? "FAILED" : "WAITING_PORTAL", result: done ? "Portal 草稿及核對證據已就緒；尚未發送。" : null } });
    await tx.officeJob.update({ where: { id: job.id }, data: { status: done ? "QUEUED" : failed ? "FAILED" : "WAITING_INPUT", leaseToken: null, leaseUntil: null, errorCode: failed ? "PORTAL_OPERATION_FAILED" : null } });
    await emit(tx, job.id, "portal.updated", { operationId: result.operationId, revision: result.revision, state: result.status, status: done ? "QUEUED" : failed ? "FAILED" : "WAITING_INPUT" });
  });
}

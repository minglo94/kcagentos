import { Prisma, PrismaClient } from '@prisma/client';
import { accountAdmin } from '../school-auth/store';
import { policyHash, requireSyntheticExecution, resolvePolicy } from '../task-policy/policy';
import { currentTeacherMapping } from './teacher-auth';
import { OfficeError, planSchema } from './plan';
import { emit, serial } from './store';

/** Explicit upgrade only: old approvals never authorize a newly bound policy. */
export async function requalifyLegacyPortalJob(db:PrismaClient, adminId:string, jobId:string, apply=false) {
  requireSyntheticExecution();
  return serial(db,async tx=>{
    await accountAdmin(tx,adminId);
    const job=await tx.officeJob.findUnique({where:{id:jobId},include:{teacherRequest:true}});
    if(!job?.teacherRequest || job.team!=='school')throw new OfficeError(409,'MAPPED_PORTAL_JOB_REQUIRED');
    if(job.policyHash || job.executionPolicy)throw new OfficeError(409,'ALREADY_POLICY_BOUND');
    if(job.leaseToken || ['SUCCEEDED','CANCELLED'].includes(job.status))throw new OfficeError(409,'QUIESCENT_JOB_REQUIRED');
    // A new plan version creates new operation keys. Never roll over an operation
    // that Portal might already have accepted, including an unknown reply.
    if(await tx.portalOperation.count({where:{jobId}}))throw new OfficeError(409,'OPERATIONS_REQUIRE_RECONCILIATION');
    const mapping=await currentTeacherMapping(tx,job.teacherRequest.issuer,job.teacherRequest.portalStaffId);
    if(mapping.id!==job.teacherRequest.mappingId || mapping.userId!==job.userId)throw new OfficeError(403,'PORTAL_ACCESS_DENIED');
    const plan=planSchema.parse(job.plan);
    if(plan.steps.length!==1 || plan.steps[0].executor!=='portal.draft' || plan.steps[0].agent!=='andy' || !plan.steps[0].portalInput)throw new OfficeError(409,'FIXED_PORTAL_PLAN_REQUIRED');
    const policy=await resolvePolicy(tx,job.userId,'school');
    const result={jobId,fromVersion:job.planVersion,toVersion:job.planVersion+1,applied:apply};
    if(!apply)return result;
    await tx.officeJob.update({where:{id:jobId},data:{executionPolicy:policy as unknown as Prisma.InputJsonObject,policyHash:policyHash(policy),planVersion:{increment:1},approvedVersion:null,status:'PENDING_PLAN_APPROVAL',errorCode:null}});
    await tx.officeStep.updateMany({where:{jobId},data:{status:'QUEUED',result:null}});
    await tx.auditLog.create({data:{userId:adminId,action:'PORTAL_POLICY_REQUALIFIED',engine:'operator',docType:`job:${jobId}`}});
    await emit(tx,jobId,'plan.policy_requalified',{version:result.toVersion,status:'PENDING_PLAN_APPROVAL'});
    return result;
  });
}

import { Prisma, PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { authenticateTeacher, currentTeacherMapping, readTeacherBody, type TeacherEnv } from './teacher-auth';
import { hashTeacherBody, hashTeacherRequest, hashTeacherDecision, hashTeacherCommand, teacherRequestSchema, teacherDecisionSchema, teacherCommandSchema, teacherSnapshotSchema } from './teacher-contract';
import { OfficeError, planSchema } from './plan';
import { approvePlanTx, controlJobTx, serial } from './store';
import { createPortalDraftJobTx, queuePortalRefreshTx } from './portal-workflow';
import { portalResponseSchema } from './portal-contract';
import { TeacherAuthorityError, verifyTeacherAuthority } from './teacher-authority';

type Tx=Prisma.TransactionClient;
async function scoped(tx:Tx, requestId:string, issuer:string, actor:string) {
  const mapping=await currentTeacherMapping(tx,issuer,actor);
  const link=await tx.portalTeacherRequest.findFirst({where:{requestId,issuer,portalStaffId:actor,mappingId:mapping.id},include:{job:true}});
  if(!link || link.job.userId!==mapping.userId)throw new OfficeError(404,'REQUEST_NOT_FOUND');
  return {link,mapping};
}
async function snapshot(tx:Tx,requestId:string,issuer:string,actor:string) {
  const {link}=await scoped(tx,requestId,issuer,actor);
  const job=await tx.officeJob.findUniqueOrThrow({where:{id:link.jobId},include:{steps:true,portalOperations:{orderBy:{createdAt:'desc'},take:30},events:{orderBy:{id:'desc'},take:100}}});
  const plan=planSchema.parse(job.plan);
  // Only the fixed draft executor is permitted across the teacher boundary.
  if(plan.steps.some(s=>s.executor!=='portal.draft'||!s.portalInput))throw new OfficeError(503,'INVALID_SNAPSHOT');
  const parsed=teacherSnapshotSchema.parse({requestId,jobId:job.id,revision:link.revision,status:job.status,planVersion:job.planVersion,planHash:job.planHash,approvedVersion:job.approvedVersion,
    plan,steps:job.steps.map(step=>({key:step.key,status:step.status,result:step.status==='SUCCEEDED'?'Portal 草稿及核對證據已就緒；尚未發送。':null})),
    portalOperations:job.portalOperations.map(operation=>{
      const external=operation.snapshot?portalResponseSchema.parse(operation.snapshot):null;
      return {operationId:operation.operationId,planVersion:operation.planVersion,stepKey:operation.stepKey,status:operation.status,revision:operation.revision,...(external?.evidence?{evidence:external.evidence}:{}),...(external?.approvalRef?{approvalRef:external.approvalRef}:{})};
    }),events:job.events.reverse().map(event=>({id:event.id,type:event.type,createdAt:event.createdAt.toISOString()})),errorCode:job.errorCode});
  // Revision changes for every permitted snapshot change, including operation evidence
  // arriving after cancellation, where the worker intentionally emits no parent event.
  const hash=hashTeacherBody(JSON.stringify({...parsed,revision:0}));
  if(link.snapshotHash!==hash){
    const updated=await tx.portalTeacherRequest.update({where:{requestId},data:{snapshotHash:hash,revision:{increment:1}}});
    parsed.revision=updated.revision;
  }
  if(Buffer.byteLength(JSON.stringify(parsed),'utf8')>65536)throw new OfficeError(503,'SNAPSHOT_TOO_LARGE');
  return parsed;
}
function respond(value:unknown,status=200){return Response.json(value,{status,headers:{'cache-control':'no-store'}});}
function failure(error:unknown){
  if(error instanceof TeacherAuthorityError)return respond({error:error.message},error.status);
  if(error instanceof OfficeError)return respond({error:error.code},error.status);
  if(error instanceof ZodError||error instanceof SyntaxError||error instanceof TypeError)return respond({error:'INVALID_INPUT'},400);
  return respond({error:'SERVICE_UNAVAILABLE'},503);
}
export interface TeacherHandlers {
  create(req:Request):Promise<Response>;
  snapshot(req:Request,requestId:string):Promise<Response>;
  decision(req:Request,requestId:string):Promise<Response>;
  command(req:Request,requestId:string):Promise<Response>;
}
export function makeTeacherHandlers(db:PrismaClient,env:TeacherEnv):TeacherHandlers {
  const wrap=(work:(req:Request,id?:string)=>Promise<Response>)=>async(req:Request,id?:string)=>{try{return await work(req,id);}catch(error){return failure(error);}};
  return {
    create:wrap(async req=>{
      if(req.method!=='POST'||new URL(req.url).pathname!=='/api/portal/v1/requests'||new URL(req.url).search)throw new OfficeError(404,'REQUEST_NOT_FOUND');
      const raw=await readTeacherBody(req),auth=await authenticateTeacher(db,env,req,raw);
      const body=teacherRequestSchema.parse(JSON.parse(raw));
      if(body.actor!==auth.assertion.subject)throw new OfficeError(401,'INVALID_ASSERTION');
      verifyTeacherAuthority('request',hashTeacherRequest(body),body.authorityProof,env.PORTAL_SCOPE_PUBLIC_KEY||'');
      return serial(db,async tx=>{
        const mapping=await currentTeacherMapping(tx,auth.assertion.issuer,body.actor);
        let link=await tx.portalTeacherRequest.findUnique({where:{requestId:body.requestId}});
        const existed=Boolean(link),requestHash=hashTeacherRequest(body);
        if(link&&(link.requestHash!==requestHash||link.mappingId!==mapping.id||link.issuer!==auth.assertion.issuer))throw new OfficeError(409,'REQUEST_CONFLICT');
        if(!link){const job=await createPortalDraftJobTx(tx,mapping.userId,body.input);link=await tx.portalTeacherRequest.create({data:{requestId:body.requestId,issuer:auth.assertion.issuer,portalStaffId:body.actor,mappingId:mapping.id,requestHash,jobId:job.id}});}
        return respond(await snapshot(tx,link.requestId,link.issuer,body.actor),existed?200:201);
      });
    }),
    snapshot:wrap(async(req,id)=>{
      if(!id||req.method!=='GET'||new URL(req.url).pathname!==`/api/portal/v1/requests/${encodeURIComponent(id)}`||new URL(req.url).search)throw new OfficeError(404,'REQUEST_NOT_FOUND');
      const raw=await readTeacherBody(req);if(raw)throw new OfficeError(400,'INVALID_INPUT');
      const auth=await authenticateTeacher(db,env,req,raw);
      return serial(db,async tx=>respond(await snapshot(tx,id,auth.assertion.issuer,auth.assertion.subject)));
    }),
    decision:wrap(async(req,id)=>{
      if(!id||req.method!=='POST'||new URL(req.url).pathname!==`/api/portal/v1/requests/${encodeURIComponent(id)}/decisions`||new URL(req.url).search)throw new OfficeError(404,'REQUEST_NOT_FOUND');
      const raw=await readTeacherBody(req),auth=await authenticateTeacher(db,env,req,raw),body=teacherDecisionSchema.parse(JSON.parse(raw));
      if(body.actor!==auth.assertion.subject||body.requestId!==id)throw new OfficeError(401,'INVALID_ASSERTION');
      verifyTeacherAuthority('decision',hashTeacherDecision(body),body.authorityProof,env.PORTAL_SCOPE_PUBLIC_KEY||'');
      return serial(db,async tx=>{
        const {link,mapping}=await scoped(tx,id,auth.assertion.issuer,body.actor);
        if(link.job.planVersion!==body.version||link.job.planHash!==body.hash)throw new OfficeError(409,'STALE_PLAN');
        const existing=await tx.portalTeacherDecision.findUnique({where:{decisionId:body.decisionId}}),decisionHash=hashTeacherDecision(body);
        if(existing&&(existing.decisionHash!==decisionHash||existing.requestId!==id))throw new OfficeError(409,'DECISION_CONFLICT');
        if(!existing){
          await approvePlanTx(tx,link.jobId,mapping.userId,body.version,body.hash,body.decision);
          await tx.portalTeacherDecision.create({data:{decisionId:body.decisionId,requestId:id,decisionHash,planVersion:body.version,planHash:body.hash,decision:body.decision}});
        }
        return respond(await snapshot(tx,id,auth.assertion.issuer,body.actor));
      });
    }),
    command:wrap(async(req,id)=>{
      if(!id||req.method!=='POST'||new URL(req.url).pathname!==`/api/portal/v1/requests/${encodeURIComponent(id)}/commands`||new URL(req.url).search)throw new OfficeError(404,'REQUEST_NOT_FOUND');
      const raw=await readTeacherBody(req),auth=await authenticateTeacher(db,env,req,raw),body=teacherCommandSchema.parse(JSON.parse(raw));
      if(body.actor!==auth.assertion.subject||body.requestId!==id)throw new OfficeError(401,'INVALID_ASSERTION');
      verifyTeacherAuthority('command',hashTeacherCommand(body),body.authorityProof,env.PORTAL_SCOPE_PUBLIC_KEY||'');
      return serial(db,async tx=>{
        const {link,mapping}=await scoped(tx,id,auth.assertion.issuer,body.actor);
        if(link.job.planVersion!==body.version||link.job.planHash!==body.hash)throw new OfficeError(409,'STALE_PLAN');
        const existing=await tx.portalTeacherCommand.findUnique({where:{commandId:body.commandId}}),commandHash=hashTeacherCommand(body);
        if(existing&&(existing.commandHash!==commandHash||existing.requestId!==id))throw new OfficeError(409,'COMMAND_CONFLICT');
        if(!existing){
          if(body.action==='refresh')await queuePortalRefreshTx(tx,link.jobId,mapping.userId,body.version,body.hash);
          else await controlJobTx(tx,link.jobId,mapping.userId,body.action);
          await tx.portalTeacherCommand.create({data:{commandId:body.commandId,requestId:id,commandHash,action:body.action}});
        }
        return respond(await snapshot(tx,id,auth.assertion.issuer,body.actor));
      });
    }),
  };
}

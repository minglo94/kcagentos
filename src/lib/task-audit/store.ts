import {randomUUID} from 'node:crypto';
import {Prisma,PrismaClient} from '@prisma/client';
import type {ExecutionPolicy} from '../task-policy/policy';
import {PayloadStore,MAX_AUDIT_BYTES} from './payloads';
export type AttemptStatus='SUCCEEDED'|'FAILED'|'CANCELLED'|'INTERRUPTED'|'DENIED';
export type AttemptInput={policy:ExecutionPolicy;actorId:string;parentId?:string;jobId?:string;stepId?:string;invocationKey:string;executor:string;model?:string;input:Uint8Array;leaseToken?:string;planVersion?:number};
export async function beginAttempt(db:PrismaClient,input:AttemptInput):Promise<{id:string}> {
 if(input.actorId!==input.policy.actorId)throw new Error('POLICY_DENIED');
 if(input.input.byteLength>MAX_AUDIT_BYTES)throw new Error('AUDIT_TOO_LARGE');
 if(await db.taskAttempt.findUnique({where:{invocationKey:input.invocationKey}}))throw new Error('ATTEMPT_EXISTS');
 const id=randomUUID();const artifact=await new PayloadStore().put(id,'input',0,input.input);
 try {await db.taskAttempt.create({data:{id,invocationKey:input.invocationKey,actorId:input.actorId,parentId:input.parentId,jobId:input.jobId,stepId:input.stepId,policy:input.policy as unknown as Prisma.InputJsonObject,executor:input.executor,model:input.model,leaseToken:input.leaseToken,planVersion:input.planVersion,deadline:new Date(Date.now()+10*60*1000),artifacts:{create:{direction:'input',sequence:0,...artifact}}}});}
 catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError && e.code==='P2002')throw new Error('ATTEMPT_EXISTS');throw e;}
 return {id};
}
export async function assertLive(tx:Prisma.TransactionClient,id:string,depth=0) {
 if(depth>8)throw new Error('POLICY_DENIED');
 await tx.$queryRaw`SELECT "id" FROM "TaskAttempt" WHERE "id"=${id} FOR UPDATE`;
 const a=await tx.taskAttempt.findUniqueOrThrow({where:{id}});
 if(a.parentId){const parent=await assertLive(tx,a.parentId,depth+1);if(parent.actorId!==a.actorId)throw new Error('POLICY_DENIED');}
 if(a.status!=='RUNNING')throw new Error('ATTEMPT_FINISHED');
 if(a.deadline<=new Date())throw new Error('ATTEMPT_EXPIRED');
 if(!await tx.user.findFirst({where:{id:a.actorId,isActive:true},select:{id:true}}))throw new Error('POLICY_DENIED');
 if(a.leaseToken && (!a.jobId || !await tx.officeJob.findFirst({where:{id:a.jobId,leaseToken:a.leaseToken,planVersion:a.planVersion??undefined,leaseUntil:{gt:new Date()},status:{in:['PLANNING','RUNNING']}}})))throw new Error('LEASE_LOST');
 return a;
}
export async function appendOutput(db:PrismaClient,attemptId:string,sequence:number,content:Uint8Array) {
 if(content.byteLength>65536)throw new Error('AUDIT_TOO_LARGE');
 const artifact=await new PayloadStore().put(attemptId,'output',sequence,content);
 await db.$transaction(async tx=>{
  await assertLive(tx,attemptId);
  const previous=await tx.taskArtifact.aggregate({where:{attemptId,direction:'output'},_count:true,_sum:{bytes:true}});
  if(previous._count!==sequence)throw new Error('AUDIT_SEQUENCE');
  if((previous._sum.bytes??0)+content.byteLength>MAX_AUDIT_BYTES)throw new Error('AUDIT_TOO_LARGE');
  await tx.taskArtifact.create({data:{attemptId,direction:'output',sequence,...artifact}});
 }, {isolationLevel:"ReadCommitted"});
}
export async function finishInTransaction(tx:Prisma.TransactionClient,id:string,status:AttemptStatus,errorCode?:string) {
 if(status==='SUCCEEDED')await assertLive(tx,id);
 const result=await tx.taskAttempt.updateMany({where:{id,status:'RUNNING'},data:{status,finishedAt:new Date(),errorCode}});
 if(!result.count)throw new Error('ATTEMPT_FINISHED');
}
export async function finishAttempt(db:PrismaClient,id:string,status:AttemptStatus,errorCode?:string) {
 await db.$transaction(tx=>finishInTransaction(tx,id,status,errorCode),{isolationLevel:"ReadCommitted"});
}
export async function recoverAttempts(db:PrismaClient) {
 await db.taskAttempt.updateMany({where:{status:'RUNNING',deadline:{lte:new Date()}},data:{status:'INTERRUPTED',finishedAt:new Date(),errorCode:'ATTEMPT_EXPIRED'}});
}

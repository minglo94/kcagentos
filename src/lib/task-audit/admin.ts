import {createHash} from 'node:crypto';
import type {Prisma,PrismaClient} from '@prisma/client';
import {PayloadStore} from './payloads';
async function admin(db:PrismaClient,actorId:string) {
 if(!await db.user.findFirst({where:{id:actorId,isActive:true,role:'ADMIN'},select:{id:true}}))throw new Error('ADMIN_REQUIRED');
}
export async function listAudits(db:PrismaClient,actorId:string,filters:{jobId?:string;status?:string;before?:Date;beforeId?:string}) {
 await admin(db,actorId);
 await db.auditLog.create({data:{userId:actorId,action:"TASK_AUDIT_LIST",engine:"system"}});
 return db.taskAttempt.findMany({where:{jobId:filters.jobId,status:filters.status,
   ...(filters.before ? {OR:filters.beforeId ? [{createdAt:{lt:filters.before}},{createdAt:filters.before,id:{lt:filters.beforeId}}] : [{createdAt:{lt:filters.before}}]} : {})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:50,select:{id:true,actorId:true,parentId:true,jobId:true,stepId:true,executor:true,model:true,status:true,errorCode:true,createdAt:true,finishedAt:true}});
}
async function inspected(db:PrismaClient,actorId:string,id:string) {
 // Fresh role check and inspection record are one transaction. No user-controlled ref is read.
 return db.$transaction(async tx=>{
  if(!await tx.user.findFirst({where:{id:actorId,isActive:true,role:'ADMIN'},select:{id:true}}))throw new Error('ADMIN_REQUIRED');
  const row=await tx.taskAttempt.findUnique({where:{id},include:{artifacts:{orderBy:[{direction:'asc'},{sequence:'asc'}]}}});
  if(!row)throw new Error('AUDIT_NOT_FOUND');
  await tx.auditLog.create({data:{userId:actorId,action:'TASK_AUDIT_READ',agentId:id,engine:'system'}});
  return row;
 });
}
export async function readAudit(db:PrismaClient,actorId:string,id:string) {
 const row=await inspected(db,actorId,id);
 // Neither private filesystem refs nor lease tokens belong in API responses.
 return {id:row.id,actorId:row.actorId,parentId:row.parentId,jobId:row.jobId,stepId:row.stepId,policy:row.policy as Prisma.JsonValue,executor:row.executor,model:row.model,status:row.status,errorCode:row.errorCode,createdAt:row.createdAt,finishedAt:row.finishedAt,artifacts:row.artifacts.map(({direction,sequence,sha256,bytes})=>({direction,sequence,sha256,bytes}))};
}
export async function readAuditPayload(db:PrismaClient,actorId:string,id:string,direction:'input'|'output') {
 const row=await inspected(db,actorId,id);const artifacts=row.artifacts.filter(a=>a.direction===direction);
 if(!artifacts.length)return {available:false,text:'',partial:row.status!=='SUCCEEDED'};
 const chunks:Buffer[]=[];
 for(const a of artifacts){const bytes=await new PayloadStore().read(a.ref);if(bytes.length!==a.bytes||createHash('sha256').update(bytes).digest('hex')!==a.sha256)throw new Error('AUDIT_STORAGE_UNAVAILABLE');chunks.push(bytes);}
 await admin(db,actorId); // Recheck after storage I/O too.
 return {available:true,text:Buffer.concat(chunks).toString('utf8'),partial:row.status!=='SUCCEEDED'};
}

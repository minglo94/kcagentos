import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
import type {ExecutionPolicy} from './policy';
import {beginAttempt,finishAttempt} from '../task-audit/store';
import {recordOutput} from '../task-audit/invoke';
import {readControlledFile,stageControlledOutput,removeStagedOutput} from './controlled-files';

type Env=Record<string,string|undefined>;
type Correlation={parentId?:string;jobId?:string;stepId?:string};
function errorCode(error:unknown):string {
 const message=error instanceof Error?error.message:'';
 return ['POLICY_DENIED','FILE_ACCESS_DENIED','FILE_SOURCE_UNAVAILABLE','FILE_TOO_LARGE','FILE_CONFIG_INVALID','SCHOOL_EXECUTION_NOT_READY'].includes(message)?message:'FILE_OPERATION_FAILED';
}
async function invokeFile<T>(db:PrismaClient,policy:ExecutionPolicy,executor:string,input:object,run:(attemptId:string)=>Promise<T>,context:Correlation={}):Promise<T> {
 const attempt=await beginAttempt(db,{actorId:policy.actorId,policy,invocationKey:randomUUID(),executor,...context,input:Buffer.from(JSON.stringify(input))});
 try {
  const result=await run(attempt.id);
  await recordOutput(db,attempt.id,Buffer.from(JSON.stringify(result)));
  await finishAttempt(db,attempt.id,'SUCCEEDED');
  return result;
 }catch(e){const code=errorCode(e);await finishAttempt(db,attempt.id,code==='POLICY_DENIED'||code==='FILE_ACCESS_DENIED'?'DENIED':'FAILED',code).catch(()=>{});throw e;}
}
export async function auditedFileRead(db:PrismaClient,policy:ExecutionPolicy,sourceId:string,path:string,env:Env=process.env,context:Correlation={}) {
 return invokeFile(db,policy,'file-read',{sourceId,path},()=>readControlledFile(policy,sourceId,path,env),context);
}
export async function auditedFileWrite(db:PrismaClient,policy:ExecutionPolicy,name:string,content:string,env:Env=process.env,context:Correlation={}) {
 const attempt=await beginAttempt(db,{actorId:policy.actorId,policy,invocationKey:randomUUID(),executor:'file-write',...context,input:Buffer.from(JSON.stringify({name,content}))});
 try {
  const result=await stageControlledOutput(policy,attempt.id,name,content,env);
  await recordOutput(db,attempt.id,Buffer.from(JSON.stringify(result)));
  await finishAttempt(db,attempt.id,'SUCCEEDED');
  return result;
 }catch(e){await removeStagedOutput(policy,attempt.id,env).catch(()=>{});const code=errorCode(e);await finishAttempt(db,attempt.id,code==='POLICY_DENIED'||code==='FILE_ACCESS_DENIED'?'DENIED':'FAILED',code).catch(()=>{});throw e;}
}

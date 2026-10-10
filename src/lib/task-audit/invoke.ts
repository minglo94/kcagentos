import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
import {beginAttempt,appendOutput,finishAttempt,type AttemptInput} from './store';
export async function recordOutput(db:PrismaClient,id:string,content:Uint8Array) {
 let sequence=0;
 for(let offset=0;offset<content.byteLength;offset+=65536)await appendOutput(db,id,sequence++,content.subarray(offset,offset+65536));
}
export async function* auditedStream(db:PrismaClient,input:Omit<AttemptInput,'invocationKey'>,source:()=>AsyncGenerator<string>,signal?:AbortSignal):AsyncGenerator<string> {
 const a=await beginAttempt(db,{...input,invocationKey:randomUUID()});let terminal=false,sequence=0;
 try {
  if(signal?.aborted)throw new Error('JOB_INTERRUPTED');
  for await(const chunk of source()) {
   if(signal?.aborted)throw new Error('JOB_INTERRUPTED');
   const bytes=Buffer.from(chunk);
   for(let offset=0;offset<bytes.length;offset+=65536)await appendOutput(db,a.id,sequence++,bytes.subarray(offset,offset+65536));
   yield chunk;
  }
  if(signal?.aborted)throw new Error('JOB_INTERRUPTED');
  await finishAttempt(db,a.id,'SUCCEEDED');terminal=true;
 }catch(e){await finishAttempt(db,a.id,signal?.aborted?'CANCELLED':'FAILED','EXECUTION_FAILED').catch(()=>{});terminal=true;throw e;}
 finally{if(!terminal)await finishAttempt(db,a.id,'CANCELLED','STREAM_CLOSED').catch(()=>{});}
}

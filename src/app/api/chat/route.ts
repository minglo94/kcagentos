import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getSession} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {accountBody,requireSameOrigin} from '@/lib/school-auth/admin-http';
import {resolvePolicy,requireSyntheticExecution,assertCapability} from '@/lib/task-policy/policy';
import {localModelConfig} from '@/lib/task-policy/local-model';
import {beginAttempt,finishAttempt,finishInTransaction} from '@/lib/task-audit/store';
import {recordOutput} from '@/lib/task-audit/invoke';
import {auditedCompletion,auditedLLM} from '@/lib/task-audit/llm';
import {loadCharter,parseRoute,agentId,parseNeedTool,parseDocReady,parseDocType,parseNeedsApproval,parseDocTitle,inferTitleFromContent,stripToolMarkers} from '@/lib/agents';
import {runAgentTool} from '@/lib/agent-tools';
import {serial} from '@/lib/office/store';
const bodySchema=z.object({messages:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(12000)}).strict()).min(1).max(100),engine:z.enum(['claude','ollama','lmstudio']).default('ollama'),engineConfig:z.object({baseUrl:z.string().optional(),model:z.string().optional()}).strict().optional()}).strict();
export async function POST(req:NextRequest) {
 const session=await getSession();if(!session?.user?.id)return NextResponse.json({error:'NOT_AUTHENTICATED'},{status:401});
 let attemptId:string|undefined;
 try {
  requireSameOrigin(req);requireSyntheticExecution();
  const body=bodySchema.parse(await accountBody(req));const policy=await resolvePolicy(prisma,session.user.id);
  const attempt=await beginAttempt(prisma,{actorId:policy.actorId,policy,invocationKey:randomUUID(),executor:'chat',input:Buffer.from(JSON.stringify(body.messages))});attemptId=attempt.id;
  assertCapability(policy,body.engine==='claude'?'cloudInference':'localInference');
  if(body.engineConfig?.baseUrl || body.engineConfig?.model)throw new Error('POLICY_DENIED');
  localModelConfig();
  const stop=new AbortController();const signal=AbortSignal.any([req.signal,stop.signal]);
  const opts={policy,signal,parentId:attempt.id};const encoder=new TextEncoder();
  const stream=new ReadableStream({
   async start(controller) {
    const send=(value:object)=>{if(signal.aborted)throw new Error('JOB_INTERRUPTED');controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));};
    try {
     send({agentId:'A01',status:'running'});
     const dispatch=await auditedCompletion(prisma,body.engine,body.messages,{...opts,system:loadCharter('dispatcher'),maxTokens:512});
     const route=parseRoute(dispatch);
     if(!route) {
      const content=stripToolMarkers(dispatch.replace(/\[ROUTE:\w+\]/g,''));
      await recordOutput(prisma,attempt.id,Buffer.from(content));await finishAttempt(prisma,attempt.id,'SUCCEEDED');
      send({agentId:'A01',text:content,chunk:true});send({agentId:'A01',status:'done',final:true});controller.close();return;
     }
     const specialist=agentId(route);send({agentId:specialist,status:'running',route,privacyHint:false});let content='';
     for await(const chunk of auditedLLM(prisma,body.engine,body.messages,{...opts,system:loadCharter(route)})){content+=chunk;send({agentId:specialist,text:chunk,chunk:true});}
     const tool=parseNeedTool(content);
     if(tool)await runAgentTool(tool,{userId:policy.actorId,policy,parentId:attempt.id}); // Unqualified sources fail closed and are journaled.
     const docReady=parseDocReady(content),docType=parseDocType(content),needsApproval=parseNeedsApproval(content);
     const clean=stripToolMarkers(content.replace(/\[DOCREADY\]|\[DOCTYPE:[^\]]+\]|\[TITLE:[^\]]+\]|\[NEEDS_APPROVAL\]/g,''));
     await recordOutput(prisma,attempt.id,Buffer.from(clean));
     if(signal.aborted)throw new Error('JOB_INTERRUPTED');
     const documentId=await serial(prisma,async tx=>{
      await finishInTransaction(tx,attempt.id,'SUCCEEDED');
      if(!docReady)return null;
      const title=parseDocTitle(content)??inferTitleFromContent(docType,clean);
      const task=await tx.task.create({data:{userId:policy.actorId,agentId:specialist,title,status:needsApproval?'PENDING_APPROVAL':'DONE'}});
      return (await tx.document.create({data:{taskId:task.id,userId:policy.actorId,title,docType,content:clean,approvalStatus:needsApproval?'PENDING':'NOT_REQUIRED'}})).id;
     });
     send({agentId:specialist,status:'done',docReady,documentId,docType,needsApproval,final:true});controller.close();
    }catch {
     await finishAttempt(prisma,attempt.id,signal.aborted?'CANCELLED':'FAILED','EXECUTION_FAILED').catch(()=>{});
     if(!signal.aborted){try{send({error:'TASK_FAILED: inspect the protected task log.'});controller.close();}catch{stop.abort();}}
    }
   },
   cancel(){stop.abort();},
  });
  return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'}});
 }catch(error) {
  if(attemptId)await finishAttempt(prisma,attemptId,'DENIED','POLICY_DENIED').catch(()=>{});
  const code=error instanceof Error && ['POLICY_DENIED','SCHOOL_EXECUTION_NOT_READY','LOCAL_MODEL_NOT_CONFIGURED','AUDIT_STORAGE_UNAVAILABLE'].includes(error.message)?error.message:'INVALID_REQUEST';
  return NextResponse.json({error:code},{status:code==='POLICY_DENIED'?403:code==='INVALID_REQUEST'?400:503});
 }
}

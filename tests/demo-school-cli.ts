/** Disposable demo only. No school endpoint, real model, email or real student data. */
import {createServer} from 'node:http';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {authDb} from './helpers/auth-db';
import {createJob,approvePlan,completeManual} from '../src/lib/office/store';
import {runNext} from '../src/lib/office/worker';
import {resolvePolicy,assertCapability} from '../src/lib/task-policy/policy';
import {auditedCompletion} from '../src/lib/task-audit/llm';
import {auditedFileRead,auditedFileWrite} from '../src/lib/task-policy/file-tools';
import {SyntheticPortal} from './fixtures/synthetic-portal';
import {randomUUID} from 'node:crypto';
import {bootstrapLocalAdmin,createLocalUser} from '../src/lib/school-auth/store';
import {listAudits,readAuditPayload} from '../src/lib/task-audit/admin';

async function main(){
 if(process.env.DATABASE_URL)throw new Error('Demo refuses DATABASE_URL; remove it before running.');
 const root=await mkdtemp(join(tmpdir(),'agentos-school-demo-'));
 const input=join(root,'input'),output=join(root,'output'),audit=join(root,'audit');
 let fixture:Awaited<ReturnType<typeof authDb>>|undefined;
 let modelCalls=0;
 const model=createServer((request,response)=>{
  if(request.method!=='POST'||request.url!=='/v1/chat/completions'){response.writeHead(404).end();return;}
  modelCalls++;request.resume();response.writeHead(200,{'Content-Type':'text/event-stream'});
  response.end(`data: ${JSON.stringify({choices:[{delta:{content:'Synthetic local-model checklist'}}]})}\n\ndata: [DONE]\n\n`);
 });
 try{
  await Promise.all([mkdir(input,{mode:0o700}),mkdir(output,{mode:0o700}),mkdir(audit,{mode:0o700})]);
  await writeFile(join(input,'attendance.txt'),'Synthetic attendance: 3 of 3 records present.\n');
  process.env.AGENTOS_AUDIT_ROOT=audit;process.env.AGENTOS_TASK_DATA_MODE='synthetic';
  fixture=await authDb();
  const admin=await bootstrapLocalAdmin(fixture.db,{name:'Demo admin',email:'demo.admin@example.test',username:'demo.admin',password:'demo-admin-password'});
  const actor=(await createLocalUser(fixture.db,admin.id,{name:'Demo teacher',email:'demo.teacher@example.test',username:'demo.teacher',password:'demo-teacher-password'})).id;
  process.env.AGENTOS_FILE_SOURCES=JSON.stringify({school:input});
  process.env.AGENTOS_FILE_OUTPUT=JSON.stringify({id:'drafts',path:output});
  process.env.AGENTOS_FILE_GRANTS=JSON.stringify({[actor]:{sourceIds:['school'],outputRootId:'drafts'}});
  await new Promise<void>(resolve=>model.listen(0,'127.0.0.1',resolve));
  const address=model.address();if(!address||typeof address==='string')throw new Error('Model fixture unavailable');
  process.env.AGENTOS_LOCAL_MODEL_URL=`http://127.0.0.1:${address.port}`;
  process.env.AGENTOS_LOCAL_MODEL='synthetic-test-model';
  const policy=await resolvePolicy(fixture.db,actor,'school');
  const job=await createJob(fixture.db,actor,'Review synthetic class summary','school');
  const draft={summary:'Review synthetic class summary',acceptance:['Staff records demo evidence'],steps:[{id:'review',title:'Review synthetic draft',agent:'clerk' as const,executor:'manual' as const,dependsOn:[],instructions:'Record synthetic staff review evidence.'}]};
  await runNext(fixture.db,{plan:async()=>draft});
  const planned=await fixture.db.officeJob.findUniqueOrThrow({where:{id:job.id}});
  await approvePlan(fixture.db,job.id,actor,planned.planVersion,planned.planHash!,'approve');
  const source=await auditedFileRead(fixture.db,policy,'school','attendance.txt',process.env,{jobId:job.id});
  const modelText=await auditedCompletion(fixture.db,'ollama',[{role:'user',content:'Summarize the synthetic class checklist.'}],{policy,jobId:job.id});
  await auditedFileWrite(fixture.db,policy,'summary.txt',`${modelText}\n${source.text}`,process.env,{jobId:job.id});
  let deniedCapabilities=false;
  try{assertCapability(policy,'onlineSearch');}catch(error){deniedCapabilities=error instanceof Error&&error.message==='POLICY_DENIED';}
  try{assertCapability(policy,'cloudInference');deniedCapabilities=false;}catch(error){deniedCapabilities=deniedCapabilities&&error instanceof Error&&error.message==='POLICY_DENIED';}
  await runNext(fixture.db,{plan:async()=>draft});
  await completeManual(fixture.db,job.id,actor,'review','Synthetic staff review completed',planned.planVersion,planned.planHash!);
  await runNext(fixture.db,{plan:async()=>draft});
  const portal=new SyntheticPortal();
  const operation=portal.submit({contractVersion:1,parentJobId:job.id,planVersion:planned.planVersion,planHash:planned.planHash,
   workflowId:'class-summary',workflowVersion:1,staffRef:'teacher-a',classRef:'class-a',date:'2026-10-10',
   sourceRefs:{attendance:'attendance-2026-10-10-a',homework:'homework-2026-10-10-a'},idempotencyKey:randomUUID()});
  portal.approveContent(operation.operationId,'teacher-a',operation.artifactRef!,operation.planVersion,operation.planHash);
  portal.approveSend(operation.operationId,'teacher-a',operation.artifactRef!,operation.planVersion,operation.planHash,operation.recipientSetHash!);
  const uncertain=portal.recordDelivery(operation.operationId,'unknown');
  const attempts=await listAudits(fixture.db,admin.id,{jobId:job.id});
  let verifiedInputs=0,verifiedOutputs=0;
  for(const attempt of attempts){
   const inputPayload=await readAuditPayload(fixture.db,admin.id,attempt.id,'input');
   const outputPayload=await readAuditPayload(fixture.db,admin.id,attempt.id,'output');
   if(inputPayload.available&&inputPayload.text)verifiedInputs++;
   if(outputPayload.available&&outputPayload.text)verifiedOutputs++;
  }
  const adminAuditReads=await fixture.db.auditLog.count({where:{userId:admin.id,action:'TASK_AUDIT_READ'}});
  const auditExecutors=attempts.map(row=>row.executor);
  const finalJob=await fixture.db.officeJob.findUniqueOrThrow({where:{id:job.id}});
  console.log(JSON.stringify({mode:'synthetic',model:'loopback-fake',modelCalls,jobStatus:finalJob.status,
   portalStatus:uncertain.status,portalDelivered:false,deniedCapabilities,auditExecutors,
   verifiedInputs,verifiedOutputs,adminAuditReads,portalAuditActions:portal.inspectAudit('admin').length}));
 }finally{
  await fixture?.close();
  await new Promise<void>(resolve=>model.close(()=>resolve()));
  await rm(root,{recursive:true,force:true});
 }
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'Demo failed');process.exitCode=1;});

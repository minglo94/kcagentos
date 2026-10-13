/** Cross-repository native acceptance. Explicit isolated DBs required; no production data. */
import assert from 'node:assert/strict';
import { randomUUID,generateKeyPairSync } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { makeTeacherHandlers } from '../src/lib/office/teacher-ingress';
import { runNext } from '../src/lib/office/worker';
import { createPortalClient } from '../src/lib/office/portal-client';

async function wire(handler:(req:Request,res:ServerResponse)=>Promise<Response|null>){
 let origin='';
 const server=createServer((req:IncomingMessage,res:ServerResponse)=>{void(async()=>{
  const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));
  const body=Buffer.concat(chunks);const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
  const request=new Request(origin+req.url,{method:req.method,headers,...(body.length?{body}:{} )});
  const reply=await handler(request,res);if(!reply)return;
  res.writeHead(reply.status,Object.fromEntries(reply.headers.entries()));res.end(Buffer.from(await reply.arrayBuffer()));
 })().catch(()=>{if(!res.destroyed){res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"TEST_SERVER_FAILED"}');}});});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');origin=`http://127.0.0.1:${address.port}`;
 return {origin,close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}

async function main(){
 assert.equal(process.env.RUN_TEACHER_PAIR,'1','Explicit native fixture opt-in required');
 const agentosUrl=process.env.TEACHER_AGENTOS_DATABASE_URL!,portalUrl=process.env.TEACHER_PORTAL_DATABASE_URL!;
 for(const [value,prefix] of [[agentosUrl,'/agentos_teacher_'],[portalUrl,'/portal_teacher_']])assert.ok(new URL(value).pathname.startsWith(prefix),'Isolated teacher database required');
 const portalRoot=path.resolve(process.env.TEACHER_PORTAL_ROOT||'../keichi-portal-bridge');
 const load=(file:string)=>import(pathToFileURL(path.join(portalRoot,file)).href);
 const {makeTeacherTaskHandlers}=await load('src/lib/agentos-teacher/http.ts');
 const {makeTeacherClient}=await load('src/lib/agentos-teacher/client.ts');
 const {makeReferenceHandlers}=await load('src/lib/agentos-reference-bridge.ts');
 const {syntheticFixture}=await load('src/lib/local-workflows/fixture.ts');
 const {summarize}=await load('src/lib/local-workflows/core.ts');
 const {storeSnapshot}=await load('src/lib/agentos-teacher/store.ts');
 const portalRequire=createRequire(path.join(portalRoot,'package.json'));
 const PortalPrisma=portalRequire('@prisma/client').PrismaClient;
 const db=new PrismaClient({datasources:{db:{url:agentosUrl}},transactionOptions:{maxWait:10000,timeout:20000}});
 const transaction=db.$transaction.bind(db);
 (db as any).$transaction=async(...args:any[])=>{try{return await(transaction as any)(...args);}catch(error:any){console.error('Native transaction diagnostic:',error?.constructor?.name,error?.code);throw error;}};
 const portal=new PortalPrisma({datasources:{db:{url:portalUrl}},transactionOptions:{maxWait:10000,timeout:20000}});
 const token='synthetic-teacher-token-'.padEnd(64,'t'),secret='synthetic-teacher-assertion-'.padEnd(64,'s');
 const authority=generateKeyPairSync('ed25519');
 const authorityPrivate=authority.privateKey.export({format:'pem',type:'pkcs8'}).toString();
 const authorityPublic=authority.publicKey.export({format:'pem',type:'spki'}).toString();
 const executionToken='synthetic-execution-token-'.padEnd(64,'e'),executionSecret='synthetic-execution-assertion-'.padEnd(64,'x');
 let ingress:any,dropCreate=false,dropDecision=false;
 const upstream=await wire(async(req,res)=>{
  const pathname=new URL(req.url).pathname;let reply:Response;
  if(pathname==='/api/portal/v1/requests')reply=await ingress.create(req);
  else{const match=pathname.match(/^\/api\/portal\/v1\/requests\/([^/]+)(?:\/(decisions|commands))?$/);if(!match)return new Response(null,{status:404});reply=match[2]==='decisions'?await ingress.decision(req,match[1]):match[2]==='commands'?await ingress.command(req,match[1]):await ingress.snapshot(req,match[1]);}
  if((dropCreate&&pathname==='/api/portal/v1/requests')||(dropDecision&&pathname.endsWith('/decisions'))){dropCreate=false;dropDecision=false;res.destroy();return null;}return reply;
 });
 ingress=makeTeacherHandlers(db,{PORTAL_INGRESS_ENABLED:'true',PORTAL_INGRESS_ORIGIN:upstream.origin,PORTAL_INGRESS_SERVICE_TOKEN:token,PORTAL_INGRESS_ASSERTION_SECRET:secret,PORTAL_SCOPE_PUBLIC_KEY:authorityPublic});
 let receiving:any;
 const execution=await wire(async(req)=>{const pathname=new URL(req.url).pathname;return pathname==='/api/agentos/v1/operations'?receiving.POST(req):receiving.GET(req,decodeURIComponent(pathname.split('/').at(-1)!));});
 receiving=makeReferenceHandlers(portal,{AGENTOS_BRIDGE_ENABLED:'true',AGENTOS_BRIDGE_IDENTITY_MODE:'mapped',AGENTOS_BRIDGE_SECRET:executionToken,AGENTOS_BRIDGE_ASSERTION_SECRET:executionSecret,AGENTOS_BRIDGE_AUDIENCE_ORIGIN:execution.origin});
 const client=makeTeacherClient({AGENTOS_TASKS_ENABLED:'true',AGENTOS_BASE_URL:upstream.origin,AGENTOS_SERVICE_TOKEN:token,AGENTOS_ASSERTION_SECRET:secret});
 const teacherOrigin='http://127.0.0.1:3999';
 const ui=makeTeacherTaskHandlers(portal,{authenticate:async(req:Request)=>{const id=req.headers.get('x-synthetic-actor');return id?{id}:null;},client,env:{AUTH_URL:teacherOrigin,AGENTOS_TASKS_ENABLED:'true',AGENTOS_SCOPE_PRIVATE_KEY:authorityPrivate}});
 const suffix=randomUUID();const users:any[]=[];const sources:any[]=[];
 try{
  // Only previous records created by this native fixture, in prefix-guarded test DBs.
  await db.officeJob.updateMany({where:{user:{email:{startsWith:'native-pair-'}},status:{in:['PLANNING','QUEUED','RUNNING','WAITING_INPUT']}},data:{status:'CANCELLED',leaseToken:null,leaseUntil:null}});
  for(let index=1;index<=2;index++){
   const email=`native-pair-${index}-${suffix}@example.test`;
   const staff=await portal.user.create({data:{email,name:`Synthetic teacher ${index}`,role:'TEACHER',departments:[],committees:[]}});
   const actor=await db.user.create({data:{email,name:`Synthetic teacher ${index}`,role:'TEACHER',subjects:[],isActive:true}});
   const schoolClass=await portal.class.create({data:{teacherId:staff.id,homeroomTeacherId:staff.id,name:'Synthetic pair class',classCode:`pair-${index}-${suffix}`}});
   await db.portalTeacherMapping.create({data:{issuer:'keichi-local',portalStaffId:staff.id,userId:actor.id,isActive:true}});
   await portal.agentosStaffMapping.create({data:{localStaffId:staff.id,agentosSubject:actor.id,active:true}});
   const input=syntheticFixture(schoolClass.id);input.rows[2].attendance='PRESENT';input.rows[2].homeworkMissing=0;const prepared=summarize(input);
   const source=await portal.localWorkflowOperation.create({data:{ownerId:staff.id,classId:schoolClass.id,idempotencyKey:input.idempotencyKey,payload:prepared.input,payloadHash:prepared.payloadHash,evidence:prepared.evidence,recipients:input.recipients}});
   users.push({staff,actor,schoolClass});sources.push(source);
  }
  const request=(actor:string,value?:unknown,origin=teacherOrigin)=>new Request(teacherOrigin+'/api/teacher/agentos-tasks',{method:value===undefined?'GET':'POST',headers:{'x-synthetic-actor':actor,'content-type':'application/json',origin},...(value===undefined?{}:{body:JSON.stringify(value)})});
  const createInput=(index:number,key=randomUUID())=>({classRef:users[index].schoolClass.id,sourceBatchRef:sources[index].id,date:'2026-10-09',idempotencyKey:key});
  assert.equal((await ui.create(request(users[0].staff.id,createInput(0),'https://untrusted.invalid'))).status,403);
  assert.equal((await ui.create(request(users[1].staff.id,createInput(0)))).status,403);
  console.log('Native pair: owner and Origin rejection verified');
  const idempotent=createInput(0);dropCreate=true;
  const uncertain=await ui.create(request(users[0].staff.id,idempotent));assert.equal(uncertain.status,202);let task=await uncertain.json();assert.ok(task.id);assert.equal(task.snapshot,null);
  assert.equal((await portal.agentosTeacherTask.findUniqueOrThrow({where:{id:task.id}})).deliveryState,'UNKNOWN');
  assert.equal(await db.portalTeacherRequest.count({where:{requestId:task.id}}),1);
  const retry=await ui.action(request(users[0].staff.id,{action:'retry'}),task.id);assert.equal(retry.status,200);task=await retry.json();assert.equal(task.snapshot.status,'PENDING_PLAN_APPROVAL');
  console.log('Native pair: lost creation reply reconciled');
  assert.equal((await ui.create(request(users[0].staff.id,idempotent))).status,200);assert.equal(await db.portalTeacherRequest.count({where:{requestId:task.id}}),1);
  assert.equal((await ui.detail(request(users[1].staff.id),task.id)).status,403);
  assert.equal(await runNext(db,{plan:async()=>{throw Error('Unexpected inference');}}),false,'No work before teacher approval');
  const action=(name:string,t=task)=>({action:name,version:t.snapshot.planVersion,hash:t.snapshot.planHash});
  assert.equal((await ui.action(request(users[0].staff.id,{...action('approve'),hash:'0'.repeat(64)}),task.id)).status,409);
  dropDecision=true;const approved=await ui.action(request(users[0].staff.id,action('approve')),task.id);assert.equal(approved.status,202);
  const localDecision=await portal.agentosTeacherDecision.findFirstOrThrow({where:{taskId:task.id}});assert.equal(localDecision.deliveryState,'UNKNOWN');
  assert.equal(await db.officeApproval.count({where:{jobId:task.snapshot.jobId}}),1);
  task=await(await ui.action(request(users[0].staff.id,{action:'retry'}),task.id)).json();assert.equal(task.snapshot.approvedVersion,task.snapshot.planVersion);
  console.log('Native pair: lost approval reply reconciled');
  assert.equal(await db.officeApproval.count({where:{jobId:task.snapshot.jobId}}),1);
  task=await(await ui.action(request(users[0].staff.id,action('pause')),task.id)).json();assert.equal(task.snapshot.status,'PAUSED');
  task=await(await ui.action(request(users[0].staff.id,action('resume')),task.id)).json();assert.equal(task.snapshot.status,'QUEUED');
  const portalClient=createPortalClient({baseUrl:execution.origin,serviceToken:executionToken,assertionSecret:executionSecret,timeoutMs:120000});
  await runNext(db,{plan:async()=>{throw Error('Unexpected inference');},portal:portalClient});
  const operation=await db.portalOperation.findFirstOrThrow({where:{jobId:task.snapshot.jobId}});assert.equal(operation.status,'DRAFT_READY');
  await runNext(db,{plan:async()=>{throw Error('Unexpected inference');},portal:portalClient});
  const before=task.snapshot;task=await(await ui.action(request(users[0].staff.id,action('refresh')),task.id)).json();assert.equal(task.snapshot.status,'SUCCEEDED');
  assert.equal(task.snapshot.portalOperations[0].status,'DRAFT_READY');assert.equal(task.snapshot.portalOperations[0].evidence.checks.sourceRows,3);
  const delayed=await storeSnapshot(portal,task.id,before);assert.equal(delayed.revision,task.snapshot.revision,'Delayed snapshot cannot regress completed task');
  const child=await portal.localWorkflowOperation.findUniqueOrThrow({where:{id:operation.operationId!}});assert.equal(child.contentApproval,null);assert.equal(child.sendApproval,null);assert.equal(child.sendResult,null);
  const encoded=JSON.stringify(task);for(const denied of ['SYN-001',users[0].staff.email,token,secret])assert.equal(encoded.includes(denied),false);
  let second=await(await ui.create(request(users[1].staff.id,createInput(1)))).json();assert.equal(second.snapshot.status,'PENDING_PLAN_APPROVAL');
  second=await(await ui.action(request(users[1].staff.id,action('cancel',second)),second.id)).json();assert.equal(second.snapshot.status,'CANCELLED');
  assert.equal(await portal.agentosReferenceBinding.count({where:{parentJobId:second.snapshot.jobId}}),0);
  const thirdResponse=await ui.create(request(users[1].staff.id,createInput(1)));assert.equal(thirdResponse.status,200);let third=await thirdResponse.json();
  third=await(await ui.action(request(users[1].staff.id,action('approve',third)),third.id)).json();
  await db.portalTeacherMapping.update({where:{issuer_portalStaffId:{issuer:'keichi-local',portalStaffId:users[1].staff.id}},data:{isActive:false}});
  await runNext(db,{plan:async()=>{throw Error('Unexpected inference');},portal:portalClient});
  assert.equal((await db.officeJob.findUniqueOrThrow({where:{id:third.snapshot.jobId}})).status,'FAILED');
  assert.equal(await portal.agentosReferenceBinding.count({where:{parentJobId:third.snapshot.jobId}}),0,'Revoked mapping prevents child execution');
  console.log('Native two-service teacher acceptance PASS: Portal-only submission/approval, dropped replies reconciled, teacher isolation, stale approvals, pause/resume/cancel, mapped draft, monotonic progress, revoked mapping and no sending.');
 }finally{await upstream.close();await execution.close();await db.$disconnect();await portal.$disconnect();}
}
void main().catch(error=>{console.error('Teacher native acceptance failed:',error instanceof Error?error.message:'unknown');process.exitCode=1;});

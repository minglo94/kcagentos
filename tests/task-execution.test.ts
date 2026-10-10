import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {authDb} from './helpers/auth-db';
import {createJob,controlJob,owned} from '../src/lib/office/store';
import {runNext} from '../src/lib/office/worker';
import {auditedStream} from '../src/lib/task-audit/invoke';
import {restrictedPolicy} from '../src/lib/task-policy/policy';
let f:Awaited<ReturnType<typeof authDb>>,actor:string,root:string;
before(async()=>{f=await authDb();actor=(await f.db.user.create({data:{email:'execution@example.test',name:'Synthetic',subjects:[]}})).id;root=await mkdtemp(join(tmpdir(),'agentos-execution-'));process.env.AGENTOS_AUDIT_ROOT=root;process.env.AGENTOS_TASK_DATA_MODE='synthetic';});
after(async()=>{await f?.close();await rm(root,{recursive:true,force:true});});
const plan={summary:'Synthetic',acceptance:['Reviewed'],steps:[{id:'review',title:'Review',agent:'clerk' as const,executor:'manual' as const,dependsOn:[],instructions:'Synthetic input'}]};
test('worker records actual planner input and output before plan success',async()=>{
 const j=await createJob(f.db,actor,'Synthetic goal','school');await runNext(f.db,{plan:async()=>plan});
 assert.equal((await owned(f.db,j.id,actor)).status,'PENDING_PLAN_APPROVAL');
 const attempts=await f.db.taskAttempt.findMany({where:{jobId:j.id},include:{artifacts:true}});
 assert.ok(attempts.some(a=>a.executor==='planner'&&a.status==='SUCCEEDED'&&a.artifacts.length>=2));
});
test('stale planner result cannot become a successful audit record',async()=>{
 const j=await createJob(f.db,actor,'Synthetic cancelled','school');
 await runNext(f.db,{plan:async()=>{await controlJob(f.db,j.id,actor,'cancel');return plan;}});
 assert.equal((await owned(f.db,j.id,actor)).status,'CANCELLED');
 assert.equal(await f.db.taskAttempt.count({where:{jobId:j.id,executor:'planner',status:'SUCCEEDED'}}),0);
});
test('stream cancellation retains partial output and closes attempt',async()=>{
 const stream=auditedStream(f.db,{actorId:actor,policy:restrictedPolicy(actor),executor:'synthetic-stream',input:Buffer.from('synthetic prompt')},async function*(){yield 'first';yield 'second';});
 assert.equal((await stream.next()).value,'first');await stream.return(undefined);
 const a=await f.db.taskAttempt.findFirstOrThrow({where:{executor:'synthetic-stream'},include:{artifacts:true}});
 assert.equal(a.status,'CANCELLED');assert.equal(a.artifacts.filter(x=>x.direction==='output').length,1);
});
test('a recovered parent fences its nested streaming attempt',async()=>{
 const {beginAttempt}=await import('../src/lib/task-audit/store');const {recoverExpired}=await import('../src/lib/office/worker');
 const j=await createJob(f.db,actor,'Synthetic nested cancellation','school');
 await f.db.officeJob.update({where:{id:j.id},data:{leaseToken:'nested-lease',leaseUntil:new Date(Date.now()+30000)}});
 const parent=await beginAttempt(f.db,{actorId:actor,policy:restrictedPolicy(actor),jobId:j.id,leaseToken:'nested-lease',planVersion:0,executor:'planner',invocationKey:'nested-parent',input:Buffer.from('synthetic')});
 const child=auditedStream(f.db,{actorId:actor,policy:restrictedPolicy(actor),parentId:parent.id,executor:'nested-model',input:Buffer.from('synthetic prompt')},async function*(){yield 'first';yield 'stale';});
 assert.equal((await child.next()).value,'first');
 await f.db.officeJob.update({where:{id:j.id},data:{leaseUntil:new Date(0)}});await recoverExpired(f.db);
 await assert.rejects(child.next(),/ATTEMPT_FINISHED|LEASE_LOST/);
 assert.equal(await f.db.taskAttempt.count({where:{parentId:parent.id,status:'SUCCEEDED'}}),0);
 await controlJob(f.db,j.id,actor,'cancel');
});
test('a client development label cannot bypass the server actor allowlist',async()=>{
 const {resolvePolicy}=await import('../src/lib/task-policy/policy');const oldActors=process.env.AGENTOS_DEVELOPMENT_ACTORS,oldWorkspace=process.env.AGENTOS_CODEX_WORKSPACE;
 process.env.AGENTOS_CODEX_WORKSPACE=process.cwd();process.env.AGENTOS_DEVELOPMENT_ACTORS='different-actor';
 try{assert.equal((await resolvePolicy(f.db,actor,'development')).classification,'restricted');process.env.AGENTOS_DEVELOPMENT_ACTORS=actor;assert.equal((await resolvePolicy(f.db,actor,'school')).classification,'restricted');assert.equal((await resolvePolicy(f.db,actor,'development')).classification,'development');}
 finally{if(oldActors===undefined)delete process.env.AGENTOS_DEVELOPMENT_ACTORS;else process.env.AGENTOS_DEVELOPMENT_ACTORS=oldActors;if(oldWorkspace===undefined)delete process.env.AGENTOS_CODEX_WORKSPACE;else process.env.AGENTOS_CODEX_WORKSPACE=oldWorkspace;}
});
test('changed server scope invalidates a queued job before dispatch',async()=>{
 const j=await createJob(f.db,actor,'Synthetic scope change','development');
 const oldActors=process.env.AGENTOS_DEVELOPMENT_ACTORS,oldWorkspace=process.env.AGENTOS_CODEX_WORKSPACE;
 process.env.AGENTOS_CODEX_WORKSPACE=process.cwd();process.env.AGENTOS_DEVELOPMENT_ACTORS=actor;let calls=0;
 try{await runNext(f.db,{plan:async()=>{calls++;return plan;}});assert.equal(calls,0);assert.equal((await owned(f.db,j.id,actor)).errorCode,'POLICY_CHANGED');}
 finally{if(oldActors===undefined)delete process.env.AGENTOS_DEVELOPMENT_ACTORS;else process.env.AGENTOS_DEVELOPMENT_ACTORS=oldActors;if(oldWorkspace===undefined)delete process.env.AGENTOS_CODEX_WORKSPACE;else process.env.AGENTOS_CODEX_WORKSPACE=oldWorkspace;}
});

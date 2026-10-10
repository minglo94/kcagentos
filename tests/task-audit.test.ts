import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {authDb} from './helpers/auth-db';
import {PayloadStore} from '../src/lib/task-audit/payloads';
import {beginAttempt,appendOutput,finishAttempt} from '../src/lib/task-audit/store';
import {restrictedPolicy} from '../src/lib/task-policy/policy';
let fixture: Awaited<ReturnType<typeof authDb>>, root:string, actorId:string;
before(async()=>{fixture=await authDb(); root=await mkdtemp(join(tmpdir(),'agentos-audit-'));process.env.AGENTOS_AUDIT_ROOT=root;actorId=(await fixture.db.user.create({data:{email:'audit@example.test',name:'Synthetic',subjects:[]}})).id;});
after(async()=>{await fixture?.close();await rm(root,{recursive:true,force:true});delete process.env.AGENTOS_AUDIT_ROOT;});
const input=()=>({policy:restrictedPolicy(actorId),actorId,invocationKey:randomUUID(),executor:'test',input:Buffer.from('synthetic input')});
test('durable input precedes execution and terminal attempts are immutable',async()=>{
 const spec=input();const a=await beginAttempt(fixture.db,spec);
 await assert.rejects(beginAttempt(fixture.db,spec),/ATTEMPT_EXISTS/);
 await appendOutput(fixture.db,a.id,0,Buffer.from('synthetic output'));
 await finishAttempt(fixture.db,a.id,'SUCCEEDED');
 await assert.rejects(finishAttempt(fixture.db,a.id,'FAILED'),/ATTEMPT_FINISHED/);
 await assert.rejects(appendOutput(fixture.db,a.id,1,Buffer.from('late')),/ATTEMPT_FINISHED/);
 const row=await fixture.db.taskAttempt.findUniqueOrThrow({where:{id:a.id},include:{artifacts:true}});
 assert.equal(row.status,'SUCCEEDED');assert.equal(row.artifacts.length,2);
 const bytes=await new PayloadStore(root).read(row.artifacts.find(x=>x.direction==='input')!.ref);
 assert.equal(bytes.toString(),'synthetic input');
});
test('payloads reject unsafe references and symbolic links',async()=>{
 const store=new PayloadStore(root); await assert.rejects(store.read('../outside'),/AUDIT_STORAGE_UNAVAILABLE/);
 const link=join(root,'alias');await symlink(root,link); await assert.rejects(new PayloadStore(link).put(randomUUID(),'input',0,Buffer.from('x')),/AUDIT_STORAGE_UNAVAILABLE/);
});
test('storage failure and oversize inputs leave no runnable attempt',async()=>{
 const count=await fixture.db.taskAttempt.count();const old=process.env.AGENTOS_AUDIT_ROOT;delete process.env.AGENTOS_AUDIT_ROOT;
 try {await assert.rejects(beginAttempt(fixture.db,input()),/AUDIT_STORAGE_UNAVAILABLE/);}finally{process.env.AGENTOS_AUDIT_ROOT=old;}
 await assert.rejects(beginAttempt(fixture.db,{...input(),input:Buffer.alloc(8*1024*1024+1)}),/AUDIT_TOO_LARGE/);
 assert.equal(await fixture.db.taskAttempt.count(),count);
});
test('output sequence and size bounds prevent a false success',async()=>{
 const a=await beginAttempt(fixture.db,input());
 await assert.rejects(appendOutput(fixture.db,a.id,1,Buffer.from('gap')),/AUDIT_SEQUENCE/);
 await assert.rejects(appendOutput(fixture.db,a.id,0,Buffer.alloc(65537)),/AUDIT_TOO_LARGE/);
 assert.equal((await fixture.db.taskAttempt.findUniqueOrThrow({where:{id:a.id}})).status,'RUNNING');
 await finishAttempt(fixture.db,a.id,'FAILED','AUDIT_TOO_LARGE');
});
test('audit storage cannot live inside the served application checkout',async()=>{
 const {mkdir}=await import('node:fs/promises');const path=join(process.cwd(),'.test-artifacts',`audit-root-${randomUUID()}`);
 await mkdir(path,{mode:0o700});try{await assert.rejects(new PayloadStore(path).put(randomUUID(),'input',0,Buffer.from('synthetic')),/AUDIT_STORAGE_UNAVAILABLE/);}finally{await rm(path,{recursive:true,force:true});}
});

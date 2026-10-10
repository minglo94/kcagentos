import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {configuredFileScope,readControlledFile,stageControlledOutput} from '../src/lib/task-policy/controlled-files';
import {auditedFileRead,auditedFileWrite} from '../src/lib/task-policy/file-tools';
import {authDb} from './helpers/auth-db';
import {runAgentTool} from '../src/lib/agent-tools';
import {resolvePolicy,policyHash,type ExecutionPolicy} from '../src/lib/task-policy/policy';

test('named, actor-scoped synthetic roots allow bounded read and separate atomic output',async()=>{
 const base=await mkdtemp(join(tmpdir(),'agentos-files-'));
 try {
  const input=join(base,'input'),output=join(base,'output');await mkdir(input,{mode:0o700});await mkdir(output,{mode:0o700});
  await mkdir(join(input,'class'),{mode:0o700});await writeFile(join(input,'class','sample.csv'),'pupil,count\nsynthetic,1\n');
  const env={AGENTOS_TASK_DATA_MODE:'synthetic',AGENTOS_FILE_SOURCES:JSON.stringify({school:input}),AGENTOS_FILE_OUTPUT:JSON.stringify({id:'drafts',path:output}),AGENTOS_FILE_GRANTS:JSON.stringify({teacher:{sourceIds:['school'],outputRootId:'drafts'}})};
  const scope=await configuredFileScope('teacher',env);assert.deepEqual(scope.sourceIds,['school']);assert.equal(scope.outputRootId,'drafts');
  const policy:ExecutionPolicy={version:1,actorId:'teacher',classification:'restricted',...scope};
  const file=await readControlledFile(policy,'school','class/sample.csv',env);
  assert.equal(file.text,'pupil,count\nsynthetic,1\n');assert.equal(file.bytes,24);assert.match(file.sha256,/^[a-f0-9]{64}$/);
  const attemptId='00000000-0000-4000-8000-000000000001';
  const staged=await stageControlledOutput(policy,attemptId,'summary.txt','Synthetic summary',env);
  const actorFolder=`.staged-${createHash('sha256').update('teacher').digest('hex').slice(0,32)}`;
  const bundle=JSON.parse(await readFile(join(output,actorFolder,`${attemptId}.json`),'utf8'));
  assert.equal(staged.rootId,'drafts');assert.equal(bundle.content,'Synthetic summary');assert.equal(bundle.manifest.sha256,staged.sha256);
  await assert.rejects(stageControlledOutput(policy,attemptId,'summary.txt','replacement',env),/FILE_ACCESS_DENIED/);
  await assert.rejects(readControlledFile({...policy,actorId:'other'},'school','class/sample.csv',env),/POLICY_DENIED/);
  await assert.rejects(readControlledFile(policy,'other','class/sample.csv',env),/POLICY_DENIED/);
  for(const name of ['../output/summary.txt','/etc/passwd','class/../../output/summary.txt','class\\sample.csv','class//sample.csv'])
   await assert.rejects(readControlledFile(policy,'school',name,env),/FILE_ACCESS_DENIED/);
  await assert.rejects(readControlledFile(policy,'school','class/missing.csv',env),/FILE_SOURCE_UNAVAILABLE/);
  await symlink(output,join(input,'escape'));
  await assert.rejects(readControlledFile(policy,'school','escape/summary.txt',env),/FILE_ACCESS_DENIED/);
  await symlink(join(input,'class','sample.csv'),join(input,'linked.csv'));
  await assert.rejects(readControlledFile(policy,'school','linked.csv',env),/FILE_ACCESS_DENIED/);
  await writeFile(join(input,'oversized.txt'),'x'.repeat(1024*1024+1));
  await assert.rejects(readControlledFile(policy,'school','oversized.txt',env),/FILE_TOO_LARGE/);
  await assert.rejects(stageControlledOutput(policy,randomUUID(),'../escape.txt','x',env),/FILE_ACCESS_DENIED/);
  await assert.rejects(stageControlledOutput(policy,randomUUID(),'bad.exe','x',env),/FILE_ACCESS_DENIED/);
  const moved={...env,AGENTOS_FILE_SOURCES:JSON.stringify({school:output})};
  await assert.rejects(readControlledFile(policy,'school','class/sample.csv',moved),/FILE_CONFIG_INVALID|POLICY_DENIED/);
 } finally {await rm(base,{recursive:true,force:true});}
});

test('file invocations record requested input and actual result for admin inspection',async()=>{
 const base=await mkdtemp(join(tmpdir(),'agentos-file-audit-'));
 const input=join(base,'input'),output=join(base,'output'),audit=join(base,'audit');
 await Promise.all([mkdir(input,{mode:0o700}),mkdir(output,{mode:0o700}),mkdir(audit,{mode:0o700})]);
 await writeFile(join(input,'source.txt'),'synthetic source');
 const fixture=await authDb();const actor=(await fixture.db.user.create({data:{email:'files@example.test',name:'File tester',subjects:[]}})).id;
 const env={AGENTOS_TASK_DATA_MODE:'synthetic',AGENTOS_FILE_SOURCES:JSON.stringify({school:input}),AGENTOS_FILE_OUTPUT:JSON.stringify({id:'drafts',path:output}),AGENTOS_FILE_GRANTS:JSON.stringify({[actor]:{sourceIds:['school'],outputRootId:'drafts'}})};
 const oldAudit=process.env.AGENTOS_AUDIT_ROOT;process.env.AGENTOS_AUDIT_ROOT=audit;
 try {
  const policy:ExecutionPolicy={version:1,actorId:actor,classification:'restricted',...await configuredFileScope(actor,env)};
  const keys=['AGENTOS_FILE_SOURCES','AGENTOS_FILE_OUTPUT','AGENTOS_FILE_GRANTS'] as const;
  const previous=keys.map(key=>process.env[key]);for(const key of keys)process.env[key]=env[key];
  try {const resolved=await resolvePolicy(fixture.db,actor);assert.deepEqual(resolved.sourceIds,['school']);assert.equal(resolved.outputRootId,'drafts');
   process.env.AGENTOS_FILE_GRANTS=JSON.stringify({[actor]:{sourceIds:[],outputRootId:null}});
   assert.notEqual(policyHash(resolved),policyHash(await resolvePolicy(fixture.db,actor)));
  }finally{keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});}
  assert.equal((await auditedFileRead(fixture.db,policy,'school','source.txt',env)).text,'synthetic source');
  const written=await auditedFileWrite(fixture.db,policy,'result.txt','synthetic result',env);
  const actorFolder=`.staged-${createHash('sha256').update(actor).digest('hex').slice(0,32)}`;
  assert.equal(JSON.parse(await readFile(join(output,actorFolder,`${written.attemptId}.json`),'utf8')).content,'synthetic result');
  await assert.rejects(auditedFileRead(fixture.db,policy,'school','missing.txt',env),/FILE_SOURCE_UNAVAILABLE/);
  await assert.rejects(runAgentTool({tool:'document_search',params:{query:'synthetic'}},{userId:actor,policy,db:fixture.db}),/POLICY_DENIED/);
  const attempts=await fixture.db.taskAttempt.findMany({where:{actorId:actor},include:{artifacts:true},orderBy:{createdAt:'asc'}});
  assert.equal(attempts.length,4);assert.deepEqual(attempts.map(a=>a.status).sort(),['DENIED','FAILED','SUCCEEDED','SUCCEEDED']);
  assert.equal(attempts.filter(a=>a.status==='SUCCEEDED').every(a=>a.artifacts.some(f=>f.direction==='input') && a.artifacts.some(f=>f.direction==='output')),true);
 } finally {if(oldAudit===undefined)delete process.env.AGENTOS_AUDIT_ROOT;else process.env.AGENTOS_AUDIT_ROOT=oldAudit;await fixture.close();await rm(base,{recursive:true,force:true});}
});

test('overlap and unconfigured actors fail closed',async()=>{
 const base=await mkdtemp(join(tmpdir(),'agentos-files-overlap-'));
 try {
  const child=join(base,'child');await mkdir(child,{mode:0o700});
  const env={AGENTOS_FILE_SOURCES:JSON.stringify({school:base}),AGENTOS_FILE_OUTPUT:JSON.stringify({id:'drafts',path:child}),AGENTOS_FILE_GRANTS:JSON.stringify({teacher:{sourceIds:['school'],outputRootId:'drafts'}})};
  await assert.rejects(configuredFileScope('teacher',env),/FILE_CONFIG_INVALID/);
  const separated=await mkdtemp(join(tmpdir(),'agentos-files-other-'));
  try {const valid={...env,AGENTOS_FILE_OUTPUT:JSON.stringify({id:'drafts',path:separated})};
   assert.deepEqual((await configuredFileScope('unknown',valid)).sourceIds,[]);
   await assert.rejects(configuredFileScope('teacher',{...valid,AGENTOS_AUDIT_ROOT:separated}),/FILE_CONFIG_INVALID/);
  }
  finally{await rm(separated,{recursive:true,force:true});}
 } finally {await rm(base,{recursive:true,force:true});}
});

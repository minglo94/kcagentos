import {test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/task-env';
import {authDb} from './helpers/auth-db';
import {assertReviewConfiguration,initializeReview} from '../src/lib/review/bootstrap';
import {reviewReady} from '../src/lib/review/readiness';

const credentials={name:'Synthetic reviewer',email:'reviewer@example.test',username:'review.admin',password:'synthetic-review-password'};

test('review initializer refuses non-synthetic or AD-enabled configuration',()=>{
 const safe={AGENTOS_REVIEW_MODE:'synthetic',AGENTOS_TASK_DATA_MODE:'synthetic',AGENTOS_LOCAL_AUTH_ENABLED:'true',AGENTOS_AD_AUTH_ENABLED:'false',AGENTOS_AUDIT_ROOT:'/data/audit'};
 assert.doesNotThrow(()=>assertReviewConfiguration(safe));
 for(const change of [{AGENTOS_REVIEW_MODE:''},{AGENTOS_TASK_DATA_MODE:'school'},{AGENTOS_LOCAL_AUTH_ENABLED:'false'},{AGENTOS_AD_AUTH_ENABLED:'true'},{AGENTOS_AUDIT_ROOT:''}])
  assert.throws(()=>assertReviewConfiguration({...safe,...change}),/REVIEW_CONFIGURATION_REQUIRED/);
});

test('one-off review bootstrap creates local admin and pending synthetic plan on empty database',async()=>{
 const fixture=await authDb();
 const previous={AGENTOS_REVIEW_MODE:process.env.AGENTOS_REVIEW_MODE,AGENTOS_LOCAL_AUTH_ENABLED:process.env.AGENTOS_LOCAL_AUTH_ENABLED,AGENTOS_AD_AUTH_ENABLED:process.env.AGENTOS_AD_AUTH_ENABLED};
 process.env.AGENTOS_REVIEW_MODE='synthetic';process.env.AGENTOS_LOCAL_AUTH_ENABLED='true';process.env.AGENTOS_AD_AUTH_ENABLED='false';
 try{
  const result=await initializeReview(fixture.db,credentials);
  assert.equal(result.jobStatus,'PENDING_PLAN_APPROVAL');
  assert.equal((await fixture.db.user.findUniqueOrThrow({where:{id:result.adminId}})).role,'ADMIN');
  assert.ok(await fixture.db.localCredential.findUnique({where:{userId:result.adminId}}));
  const job=await fixture.db.officeJob.findUniqueOrThrow({where:{id:result.jobId}});
  assert.equal(job.approvedVersion,null);
  assert.equal((await fixture.db.taskAttempt.count({where:{jobId:job.id,status:'SUCCEEDED'}})),2);
  await assert.rejects(initializeReview(fixture.db,credentials),/REVIEW_DATABASE_NOT_EMPTY/);
 }finally{
  for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  await fixture.close();
 }
});

test('review readiness needs schema, active administrator and protected audit root',async()=>{
 const fixture=await authDb();
 const previous={AGENTOS_REVIEW_MODE:process.env.AGENTOS_REVIEW_MODE,AGENTOS_LOCAL_AUTH_ENABLED:process.env.AGENTOS_LOCAL_AUTH_ENABLED,AGENTOS_AD_AUTH_ENABLED:process.env.AGENTOS_AD_AUTH_ENABLED};
 process.env.AGENTOS_REVIEW_MODE='synthetic';process.env.AGENTOS_LOCAL_AUTH_ENABLED='true';process.env.AGENTOS_AD_AUTH_ENABLED='false';
 try{
  assert.equal(await reviewReady(fixture.db),false);
  await initializeReview(fixture.db,credentials);
  assert.equal(await reviewReady(fixture.db),true);
  assert.equal(await reviewReady(fixture.db,{...process.env,AGENTOS_AUDIT_ROOT:'/missing-review-audit'}),false);
  assert.equal(await reviewReady(fixture.db,{...process.env,AGENTOS_REVIEW_MODE:''}),false);
 }finally{
  for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  await fixture.close();
 }
});

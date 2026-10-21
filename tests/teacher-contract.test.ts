import assert from 'node:assert/strict';
import { test } from 'node:test';
import { teacherRequestSchema, teacherDecisionSchema, teacherCommandSchema, teacherSnapshotSchema, hashTeacherRequest } from '../src/lib/office/teacher-contract';
test('teacher ingress accepts references only and hashes normalized requests',()=>{
 const input={requestId:'request-123',actor:'teacher-1',workflowVersion:1,capability:'class.daily-summary.draft',input:{classRef:'class-1',sourceBatchRef:'source-1',date:'2026-10-13'}};
 assert.equal(hashTeacherRequest(input),hashTeacherRequest({...input,input:{date:input.input.date,sourceBatchRef:'source-1',classRef:'class-1'}}));
 assert.equal(teacherRequestSchema.safeParse({...input,rows:[]}).success,false);
 assert.equal(teacherRequestSchema.safeParse({...input,input:{...input.input,date:'2026-02-30'}}).success,false);
 assert.equal(teacherRequestSchema.safeParse({...input,actor:'https://untrusted'}).success,false);
});
test('snapshot cannot claim a ready draft or pending approval without authority evidence',()=>{
 const input={classRef:'class-1',sourceBatchRef:'source-1',date:'2026-10-13'};
 const snapshot={requestId:'request-1',jobId:'job-1',revision:1,status:'QUEUED',planVersion:1,planHash:'a'.repeat(64),approvedVersion:1,
 plan:{summary:'Fixed draft workflow',acceptance:['Reconcile source'],steps:[{id:'daily_summary',title:'Draft',agent:'andy',executor:'portal.draft',instructions:'Draft only',dependsOn:[],portalInput:input}]},steps:[],portalOperations:[],events:[],errorCode:null};
 const op={operationId:'operation-1',planVersion:1,stepKey:'daily_summary',status:'DRAFT_READY',revision:1};
 assert.equal(teacherSnapshotSchema.safeParse({...snapshot,portalOperations:[op]}).success,false);
 assert.equal(teacherSnapshotSchema.safeParse({...snapshot,portalOperations:[{...op,status:'WAITING_CONTENT_APPROVAL'}]}).success,false);
 const evidence={sourceRef:'source-1',artifactRef:'artifact-1',asOf:'2026-10-13T00:00:00Z',checks:{complete:true,identityMatched:true,dateMatched:true,sourceRows:3,reconciledRows:3}};
 assert.equal(teacherSnapshotSchema.safeParse({...snapshot,portalOperations:[{...op,evidence}]}).success,true);
 assert.equal(teacherSnapshotSchema.safeParse({...snapshot,portalOperations:[{...op,evidence:{...evidence,checks:{...evidence.checks,reconciledRows:2}}}]}).success,false);
});
test('teacher decisions and controls require immutable IDs and exact plan identity',()=>{
 const data={decisionId:'decision-123',requestId:'request-123',actor:'teacher-1',version:1,hash:'a'.repeat(64),decision:'approve'};
 assert.equal(teacherDecisionSchema.safeParse(data).success,true);
 assert.equal(teacherDecisionSchema.safeParse({...data,version:0}).success,false);
 assert.equal(teacherDecisionSchema.safeParse({...data,decision:'send'}).success,false);
 assert.equal(teacherCommandSchema.safeParse({commandId:'command-1',requestId:data.requestId,actor:data.actor,version:1,hash:data.hash,action:'cancel'}).success,true);
 assert.equal(teacherCommandSchema.safeParse({commandId:'command-1',requestId:data.requestId,actor:data.actor,version:1,hash:data.hash,action:'replan'}).success,false);
});

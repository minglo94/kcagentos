import assert from 'node:assert/strict';
import { test } from 'node:test';
import { teacherRequestSchema, teacherDecisionSchema, teacherCommandSchema, hashTeacherRequest } from '../src/lib/office/teacher-contract';
test('teacher ingress accepts references only and hashes normalized requests',()=>{
 const input={requestId:'request-123',actor:'teacher-1',workflowVersion:1,capability:'class.daily-summary.draft',input:{classRef:'class-1',sourceBatchRef:'source-1',date:'2026-10-13'}};
 assert.equal(hashTeacherRequest(input),hashTeacherRequest({...input,input:{date:input.input.date,sourceBatchRef:'source-1',classRef:'class-1'}}));
 assert.equal(teacherRequestSchema.safeParse({...input,rows:[]}).success,false);
 assert.equal(teacherRequestSchema.safeParse({...input,input:{...input.input,date:'2026-02-30'}}).success,false);
 assert.equal(teacherRequestSchema.safeParse({...input,actor:'https://untrusted'}).success,false);
});
test('teacher decisions and controls require immutable IDs and exact plan identity',()=>{
 const data={decisionId:'decision-123',requestId:'request-123',actor:'teacher-1',version:1,hash:'a'.repeat(64),decision:'approve'};
 assert.equal(teacherDecisionSchema.safeParse(data).success,true);
 assert.equal(teacherDecisionSchema.safeParse({...data,version:0}).success,false);
 assert.equal(teacherDecisionSchema.safeParse({...data,decision:'send'}).success,false);
 assert.equal(teacherCommandSchema.safeParse({commandId:'command-1',requestId:data.requestId,actor:data.actor,version:1,hash:data.hash,action:'cancel'}).success,true);
 assert.equal(teacherCommandSchema.safeParse({commandId:'command-1',requestId:data.requestId,actor:data.actor,version:1,hash:data.hash,action:'replan'}).success,false);
});

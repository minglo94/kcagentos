import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { issueTeacherAuthority, verifyTeacherAuthority } from '../src/lib/office/teacher-authority';
import { hashTeacherRequest } from '../src/lib/office/teacher-contract';
const pair=generateKeyPairSync('ed25519');
const privateKey=pair.privateKey.export({format:'pem',type:'pkcs8'}).toString();
const publicKey=pair.publicKey.export({format:'pem',type:'spki'}).toString();
const request={requestId:'request-1',actor:'teacher-1',workflowVersion:1,capability:'class.daily-summary.draft',input:{classRef:'class-1',sourceBatchRef:'source-1',date:'2026-10-13'}};
test('Portal authority proof binds purpose and exact scope independently of service credentials',()=>{
 const proof=issueTeacherAuthority('request',hashTeacherRequest(request),privateKey,1000);
 verifyTeacherAuthority('request',hashTeacherRequest(request),proof,publicKey,1001);
 assert.throws(()=>verifyTeacherAuthority('decision',hashTeacherRequest(request),proof,publicKey,1001));
 for(const changed of [{...request,actor:'teacher-2'},{...request,input:{...request.input,classRef:'class-2'}},{...request,input:{...request.input,sourceBatchRef:'source-2'}}])assert.throws(()=>verifyTeacherAuthority('request',hashTeacherRequest(changed),proof,publicKey,1001));
 assert.throws(()=>verifyTeacherAuthority('request',hashTeacherRequest(request),undefined,publicKey,1001));
 assert.throws(()=>verifyTeacherAuthority('request',hashTeacherRequest(request),{...proof,signature:'A'.repeat(86)},publicKey,1001));
});
test('fresh authority proofs preserve immutable delivery hash and reject expired or excessive grants',()=>{
 const first=issueTeacherAuthority('request',hashTeacherRequest(request),privateKey,1000);
 const second=issueTeacherAuthority('request',hashTeacherRequest(request),privateKey,1010);
 assert.equal(hashTeacherRequest({...request,authorityProof:first}),hashTeacherRequest({...request,authorityProof:second}));
 assert.throws(()=>verifyTeacherAuthority('request',hashTeacherRequest(request),first,publicKey,first.expiresAt+1));
 assert.throws(()=>verifyTeacherAuthority('request',hashTeacherRequest(request),first,publicKey,990));
 assert.throws(()=>verifyTeacherAuthority('request',hashTeacherRequest(request),{...first,expiresAt:first.issuedAt+600},publicKey,1001));
 const other=generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'}).toString();
 assert.throws(()=>verifyTeacherAuthority('request',hashTeacherRequest(request),first,other,1001));
});

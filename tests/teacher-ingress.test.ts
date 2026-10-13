import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createHmac, randomUUID, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from '@prisma/client';
import { hashTeacherBody, teacherSnapshotSchema, type TeacherSnapshot } from '../src/lib/office/teacher-contract';
import { runNext } from '../src/lib/office/worker';
import { assertOfficeOperator, assertBrowserJobMutation } from '../src/lib/office/teacher-auth';
import { makeTeacherHandlers } from '../src/lib/office/teacher-ingress';
import { issueTeacherAuthority } from '../src/lib/office/teacher-authority';
import { hashTeacherRequest, hashTeacherDecision, hashTeacherCommand } from '../src/lib/office/teacher-contract';

const authority=generateKeyPairSync('ed25519');
const authorityPrivate=authority.privateKey.export({format:'pem',type:'pkcs8'}).toString();
const env = { PORTAL_INGRESS_ENABLED: 'true', PORTAL_INGRESS_ORIGIN: 'https://agentos.example.test', PORTAL_INGRESS_SERVICE_TOKEN: 't'.repeat(48), PORTAL_INGRESS_ASSERTION_SECRET: 's'.repeat(32),PORTAL_SCOPE_PUBLIC_KEY:authority.publicKey.export({format:'pem',type:'spki'}).toString() };
const base = '/api/portal/v1/requests';
let pg: PGlite, socket: PGLiteSocketServer, db: PrismaClient, handlers: ReturnType<typeof makeTeacherHandlers>, user: string;
before(async () => {
  pg = await PGlite.create();
  for (const name of ['20261009000000_baseline', '20261009000100_office', '20261012000000_portal', '20261013000100_teacher_entry']) await pg.exec(await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8'));
  socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 1 }); await socket.start();
  db = new PrismaClient({ datasources: { db: { url: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?connection_limit=1&pgbouncer=true&statement_cache_size=0` } } });
  user = (await db.user.create({ data: { name: 'Synthetic teacher', email: 'teacher@example.test', subjects: [] } })).id;
  await db.portalTeacherMapping.create({ data: { issuer: 'keichi-local', portalStaffId: 'teacher-a', userId: user } });
  handlers = makeTeacherHandlers(db, env);
});
after(async () => { await db?.$disconnect(); await socket?.stop(); await pg?.close(); });

function signed(path: string, body?: unknown, actor = 'teacher-a', overrides: Record<string, unknown> = {}, headers: Record<string,string> = {}) {
  if(body&&typeof body==='object'&&!Object.prototype.hasOwnProperty.call(body,'authorityProof')){
    const purpose=path.endsWith('/decisions')?'decision':path.endsWith('/commands')?'command':'request';
    try{const hash=purpose==='decision'?hashTeacherDecision(body):purpose==='command'?hashTeacherCommand(body):hashTeacherRequest(body);body={...body,authorityProof:issueTeacherAuthority(purpose,hash,authorityPrivate)};}catch{/* malformed test inputs remain raw for receiver rejection */}
  }
  const raw = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  const method = body === undefined ? 'GET' : 'POST';
  const assertion = { issuer: 'keichi-local', audience: env.PORTAL_INGRESS_ORIGIN, subject: actor, method, path, bodyHash: hashTeacherBody(raw), timestamp: Math.floor(Date.now()/1000), nonce: randomUUID(), ...overrides };
  const encoded = Buffer.from(JSON.stringify(assertion)).toString('base64url');
  return new Request(env.PORTAL_INGRESS_ORIGIN + path, { method, headers: { authorization: `Bearer ${env.PORTAL_INGRESS_SERVICE_TOKEN}`, 'x-portal-assertion': encoded, 'x-portal-signature': createHmac('sha256', env.PORTAL_INGRESS_ASSERTION_SECRET).update(encoded).digest('hex'), 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body: raw } : {}) });
}
const input = { classRef: 'synthetic-class', sourceBatchRef: 'synthetic-batch', date: '2026-10-13' };
const request = (id: string, actor = 'teacher-a') => ({ requestId: id, actor, workflowVersion: 1, capability: 'class.daily-summary.draft', input });
async function create(id: string) { const response = await handlers.create(signed(base, request(id))); assert.equal(response.status, 201); return teacherSnapshotSchema.parse(await response.json()); }
async function decide(snapshot: TeacherSnapshot, id: string, changes: Record<string,unknown> = {}) {
  const path = `${base}/${snapshot.requestId}/decisions`;
  return handlers.decision(signed(path, { decisionId: id, requestId: snapshot.requestId, actor: 'teacher-a', version: snapshot.planVersion, hash: snapshot.planHash, decision: 'approve', ...changes }), snapshot.requestId);
}
async function command(snapshot: TeacherSnapshot, id: string, action: string) {
  const path = `${base}/${snapshot.requestId}/commands`;
  return handlers.command(signed(path, { commandId: id, requestId: snapshot.requestId, actor: 'teacher-a', version: snapshot.planVersion, hash: snapshot.planHash, action }), snapshot.requestId);
}

test('signed ingress rejects wrong audience, expired timestamp, tampering, wrong path, disabled config and replay', async () => {
  for (const change of [{ audience: 'https://evil.example' }, { timestamp: Math.floor(Date.now()/1000)-90 }, { timestamp: Math.floor(Date.now()/1000)+90 }, { path: '/forged' }, { method: 'GET' }, { bodyHash: '0'.repeat(64) }]) assert.equal((await handlers.create(signed(base, request('auth-denied'), 'teacher-a', change))).status, 401);
  assert.equal((await handlers.create(signed(base, request('tampered'), 'teacher-a', {}, { 'x-portal-signature': '0'.repeat(64) }))).status, 401);
  assert.equal((await makeTeacherHandlers(db, { ...env, PORTAL_INGRESS_ENABLED: 'false' }).create(signed(base, request('disabled')))).status, 503);
  const signedRequest = signed(base, request('nonce-replay'));
  const retry = signedRequest.clone();
  assert.equal((await handlers.create(signedRequest)).status, 201);
  assert.equal((await handlers.create(retry)).status, 409);
  assert.equal((await handlers.create(signed(base, ' '.repeat(8193)))).status, 413);
  const normalized = new Request('http://localhost:3000'+base, signed(base, request('normalized-origin'), 'teacher-a', {}, {host:'agentos.example.test'}));
  assert.equal((await handlers.create(normalized)).status,201);
  const wrongHost = new Request('http://localhost:3000'+base, signed(base, request('wrong-public-host'), 'teacher-a', {}, {host:'evil.example'}));
  assert.equal((await handlers.create(wrongHost)).status,403);
  const hostile = new Request('https://evil.example'+base, signed(base, request('hostile')));
  assert.equal((await handlers.create(hostile)).status, 403);
});
test('service authentication cannot mint foreign request scope or teacher decisions',async()=>{
 const core=request('scope-proof-test');
 const proof=issueTeacherAuthority('request',hashTeacherRequest(core),authorityPrivate);
 const foreign={...core,input:{...input,classRef:'another-teacher-class'},authorityProof:proof};
 assert.equal((await handlers.create(signed(base,foreign))).status,403);
 assert.equal((await handlers.create(signed(base,{...request('missing-proof'),authorityProof:undefined}))).status,403);
 const expired=issueTeacherAuthority('request',hashTeacherRequest(core),authorityPrivate,Math.floor(Date.now()/1000)-121);
 assert.equal((await handlers.create(signed(base,{...core,authorityProof:expired}))).status,403);
 assert.equal(await db.portalTeacherRequest.count({where:{requestId:core.requestId}}),0);
 const created=await create('decision-proof-test');
 const path=`${base}/${created.requestId}/decisions`;
 const decision={decisionId:'missing-authority',requestId:created.requestId,actor:'teacher-a',version:created.planVersion,hash:created.planHash,decision:'approve',authorityProof:undefined};
 assert.equal((await handlers.decision(signed(path,decision),created.requestId)).status,403);
 assert.equal((await db.officeJob.findUniqueOrThrow({where:{id:created.jobId}})).approvedVersion,null);
 await command(created,'scope-proof-clean','cancel');
});
test('unmapped or revoked actors fail closed and cannot select an AgentOS owner', async () => {
  assert.equal((await handlers.create(signed(base, request('unmapped', 'missing'), 'missing'))).status, 403);
  assert.equal((await handlers.create(signed(base, { ...request('owner-forged'), userId: user }))).status, 400);
  await db.portalTeacherMapping.update({ where: { issuer_portalStaffId: { issuer: 'keichi-local', portalStaffId: 'teacher-a' } }, data: { isActive: false } });
  try { assert.equal((await handlers.create(signed(base, request('revoked')))).status, 403); }
  finally { await db.portalTeacherMapping.update({ where: { issuer_portalStaffId: { issuer: 'keichi-local', portalStaffId: 'teacher-a' } }, data: { isActive: true } }); }
});
test('immutable concurrent creation returns one fixed unapproved parent and scopes snapshots to actor', async () => {
  const responses = await Promise.all([handlers.create(signed(base, request('duplicate-create'))), handlers.create(signed(base, request('duplicate-create')))]);
  assert.deepEqual(responses.map(r=>r.status).sort(), [200,201]);
  const values = await Promise.all(responses.map(r=>r.json()));
  assert.equal(values[0].jobId, values[1].jobId);
  assert.equal(values[0].status, 'PENDING_PLAN_APPROVAL'); assert.equal(values[0].approvedVersion, null);
  assert.equal(await db.officeJob.count({ where: { id: values[0].jobId } }), 1);
  assert.equal((await handlers.create(signed(base, { ...request('duplicate-create'), input: { ...input, classRef: 'other' } }))).status, 409);
  const second = (await db.user.create({ data: { email: 'second@example.test', name: 'Second', subjects: [] } })).id;
  await db.portalTeacherMapping.create({ data: { issuer: 'keichi-local', portalStaffId: 'teacher-b', userId: second } });
  assert.equal((await handlers.create(signed(base, request('forged-subject'), 'teacher-b'))).status, 401);
  const path = `${base}/duplicate-create`;
  assert.equal((await handlers.snapshot(signed(path, undefined, 'teacher-b'), 'duplicate-create')).status, 404);
  const snapshotResponse = await handlers.snapshot(signed(path), 'duplicate-create'); assert.equal(snapshotResponse.status, 200);
  const snapshot = teacherSnapshotSchema.parse(await snapshotResponse.json());
  assert.equal(snapshot.plan.steps[0].executor, 'portal.draft');
  assert.ok(snapshot.revision >= 1); assert.ok(!JSON.stringify(snapshot).includes('teacher@example.test'));
  await command(snapshot, 'clean-duplicate', 'cancel');
});
test('decisions are version bound, atomic and duplicate approval cannot undo pause or cancel', async () => {
  const snapshot = await create('decision-test');
  assert.equal((await command(snapshot, 'premature-pause', 'pause')).status, 409);
  assert.equal(await db.portalTeacherCommand.count({where:{requestId:snapshot.requestId}}),0);
  assert.equal((await decide(snapshot, 'stale-decision', { version: 2 })).status, 409);
  assert.equal((await decide(snapshot, 'forged-decision', { actor: 'teacher-b' })).status, 401);
  const responses = await Promise.all([decide(snapshot, 'approval-1'), decide(snapshot, 'approval-1')]);
  assert.deepEqual(responses.map(r=>r.status), [200,200]);
  assert.equal(await db.portalTeacherDecision.count({ where: { requestId: snapshot.requestId } }), 1);
  assert.equal(await db.officeApproval.count({ where: { jobId: snapshot.jobId } }), 1);
  assert.equal((await decide(snapshot, 'approval-1', { decision: 'reject' })).status, 409);
  assert.equal((await command(snapshot, 'pause-1', 'pause')).status, 200);
  assert.equal((await command(snapshot, 'pause-1', 'cancel')).status, 409);
  const paused = teacherSnapshotSchema.parse(await (await decide(snapshot, 'approval-1')).json()); assert.equal(paused.status, 'PAUSED');
  assert.equal((await command(snapshot, 'resume-1', 'resume')).status, 200);
  await command(snapshot, 'cancel-1', 'cancel');
  const replay = await command(snapshot, 'resume-1', 'resume'); assert.equal(replay.status, 200);
  assert.equal((await replay.json()).status, 'CANCELLED');
  assert.equal((await decide(snapshot, 'approval-1')).status, 200);
  assert.equal((await db.officeJob.findUniqueOrThrow({ where: { id: snapshot.jobId } })).status, 'CANCELLED');
});
test('current mapped role revocation and missing Portal decision stop school execution', async()=>{
  const snapshot=await create('role-revoked');
  // No approval means this request cannot become worker eligible.
  assert.equal((await db.officeJob.findUniqueOrThrow({where:{id:snapshot.jobId}})).status,'PENDING_PLAN_APPROVAL');
  await decide(snapshot,'role-approve');
  await db.user.update({where:{id:user},data:{role:'OFFICE'}});
  let called=false;
  try {
    await runNext(db,{plan:async()=>{throw new Error('unexpected planning');},portal:{lookup:async()=>{called=true;return null;},submit:async()=>{called=true;throw new Error('unexpected submit');}}});
    assert.equal(called,false);
    assert.equal((await db.officeJob.findUniqueOrThrow({where:{id:snapshot.jobId}})).errorCode,'PORTAL_ACCESS_DENIED');
  }finally{await db.user.update({where:{id:user},data:{role:'TEACHER'}});}
  const forged=await create('missing-decision');
  await db.officeJob.update({where:{id:forged.jobId},data:{status:'QUEUED',approvedVersion:1}});
  await runNext(db,{plan:async()=>{throw new Error('unexpected planning');},portal:{lookup:async()=>{called=true;return null;},submit:async()=>{called=true;throw new Error('unexpected submit');}}});
  assert.equal(called,false);
  assert.equal((await db.officeJob.findUniqueOrThrow({where:{id:forged.jobId}})).errorCode,'APPROVAL_REQUIRED');
});
test('mapped execution fences cancel during HTTP and publishes monotonic redacted accepted evidence',async()=>{
  const snapshot=await create('cancel-race'); await decide(snapshot,'race-approve');
  await runNext(db,{plan:async()=>{throw new Error('unexpected planning');},portal:{lookup:async()=>null,submit:async req=>{
    const response=await command(snapshot,'race-cancel','cancel'); assert.equal(response.status,200);
    return {operationId:'synthetic-op',parentJobId:req.parentJobId,idempotencyKey:req.idempotencyKey,requestHash:req.requestHash,revision:1,status:'ACCEPTED'};
  }}});
  const path=`${base}/${snapshot.requestId}`;
  const response=await handlers.snapshot(signed(path),snapshot.requestId);
  const latest=teacherSnapshotSchema.parse(await response.json());
  assert.equal(latest.status,'CANCELLED');assert.equal(latest.portalOperations[0].operationId,'synthetic-op');
  assert.ok(latest.revision>snapshot.revision);
  assert.equal((await db.officeJob.findUniqueOrThrow({where:{id:snapshot.jobId}})).leaseToken,null);
});
test('queued mapping revocation prevents Portal execution and redacted snapshot revision moves forward', async () => {
  // Clear pending auth fixture so only this approved parent is worker-eligible.
  await db.officeJob.updateMany({ where: { status: 'QUEUED' }, data: { status: 'CANCELLED' } });
  const snapshot = await create('execution-revoked'); await decide(snapshot, 'approve-revoked');
  await db.portalTeacherMapping.update({ where: { issuer_portalStaffId: { issuer: 'keichi-local', portalStaffId: 'teacher-a' } }, data: { isActive: false } });
  let invoked = false;
  try {
    await runNext(db, { plan: async()=>{throw new Error('Unexpected planner');}, portal: { lookup: async()=>{invoked=true;return null;}, submit: async()=>{invoked=true;throw new Error('Unexpected submit');} } });
    assert.equal(invoked, false);
    assert.equal((await db.officeJob.findUniqueOrThrow({ where: { id: snapshot.jobId } })).errorCode, 'PORTAL_ACCESS_DENIED');
  } finally { await db.portalTeacherMapping.update({ where: { issuer_portalStaffId: { issuer: 'keichi-local', portalStaffId: 'teacher-a' } }, data: { isActive: true } }); }
  const path=`${base}/${snapshot.requestId}`;
  const current=teacherSnapshotSchema.parse(await (await handlers.snapshot(signed(path), snapshot.requestId)).json());
  assert.ok(current.revision > snapshot.revision);
});
test('operator role is current and browser mutations cannot authorize any school parent', async()=>{
  await assert.rejects(()=>assertOfficeOperator(db,user), /OPERATOR_REQUIRED/);
  await db.user.update({where:{id:user},data:{role:'ADMIN'}});
  try {
    await assertOfficeOperator(db,user);
    const snapshot=await create('operator-school');
    await assert.rejects(()=>assertBrowserJobMutation(db,snapshot.jobId,user), /PORTAL_AUTHORITY_REQUIRED/);
    await command(snapshot,'operator-school-cancel','cancel');
  } finally {await db.user.update({where:{id:user},data:{role:'TEACHER'}});}
});

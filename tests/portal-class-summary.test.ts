import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SyntheticPortal} from './fixtures/synthetic-portal';
import {portalRequest,portalSnapshot,isPortalDelivered} from '../src/lib/office/portal-class-summary-contract';

function request(overrides:Record<string,unknown>={}) {return {
 contractVersion:1,parentJobId:randomUUID(),planVersion:1,planHash:'a'.repeat(64),
 workflowId:'class-summary',workflowVersion:1,staffRef:'teacher-a',classRef:'class-a',date:'2026-10-10',
 sourceRefs:{attendance:'attendance-2026-10-10-a',homework:'homework-2026-10-10-a'},idempotencyKey:randomUUID(),...overrides,
};}

test('Portal fixture owns records; stable replay returns one opaque child, changed request rejects',()=>{
 const portal=new SyntheticPortal();const input=request();
 const first=portal.submit(input),same=portal.submit(input);
 assert.deepEqual(same,first);assert.equal(portal.operationCount(),1);
 assert.equal(first.status,'DRAFT_READY');assert.equal(first.complete,true);
 assert.ok(first.artifactRef);assert.equal(JSON.stringify(first).includes('pupil-'),false);
 assert.deepEqual(first.events.map(e=>e.id),[1]);
 assert.throws(()=>portal.submit({...input,classRef:'class-b'}),/PORTAL_IDEMPOTENCY_CONFLICT/);
 assert.throws(()=>portalRequest.parse({...input,sql:'SELECT * FROM students'}));
 assert.throws(()=>portalSnapshot.parse({...first,students:[{name:'Synthetic pupil'}]}));
});

test('independent staff scope and source completeness stop the class summary',()=>{
 const portal=new SyntheticPortal();
 assert.throws(()=>portal.submit(request({staffRef:'teacher-b'})),/PORTAL_SCOPE_DENIED/);
 assert.throws(()=>portal.submit(request({date:'2026-10-11'})),/PORTAL_SCOPE_DENIED/);
 assert.throws(()=>portal.submit(request({sourceRefs:{attendance:'other',homework:'homework-2026-10-10-a'}})),/PORTAL_SOURCE_UNAVAILABLE/);
 for(const condition of ['partial','missing','ambiguous'] as const){
  const result=new SyntheticPortal({condition}).submit(request());
  assert.equal(result.status,'SOURCE_BLOCKED');assert.equal(result.complete,false);assert.equal(result.artifactRef,null);
  assert.equal(isPortalDelivered(result),false);
 }
});

test('content/send approvals are version-bound and unknown delivery is not completion',()=>{
 const portal=new SyntheticPortal();const draft=portal.submit(request());
 assert.throws(()=>portal.approveContent(draft.operationId,'teacher-a','stale-artifact',draft.planVersion,draft.planHash),/PORTAL_STALE_ARTIFACT/);
 assert.throws(()=>portal.approveContent(draft.operationId,'teacher-a',draft.artifactRef!,draft.planVersion,'b'.repeat(64)),/PORTAL_STALE_PLAN/);
 assert.throws(()=>portal.approveSend(draft.operationId,'teacher-a',draft.artifactRef!,draft.planVersion,draft.planHash,draft.recipientSetHash!),/PORTAL_APPROVAL_REQUIRED/);
 const content=portal.approveContent(draft.operationId,'teacher-a',draft.artifactRef!,draft.planVersion,draft.planHash);
 assert.equal(content.status,'CONTENT_APPROVED');assert.equal(isPortalDelivered(content),false);
 assert.throws(()=>portal.approveSend(draft.operationId,'teacher-a',draft.artifactRef!,draft.planVersion,draft.planHash,'c'.repeat(64)),/PORTAL_STALE_RECIPIENTS/);
 const send=portal.approveSend(draft.operationId,'teacher-a',draft.artifactRef!,draft.planVersion,draft.planHash,draft.recipientSetHash!);
 assert.equal(send.status,'SEND_APPROVED');assert.equal(isPortalDelivered(send),false);
 const unknown=portal.recordDelivery(draft.operationId,'unknown');assert.equal(unknown.status,'DELIVERY_UNKNOWN');assert.equal(isPortalDelivered(unknown),false);
 assert.throws(()=>portal.inspectAudit('teacher'),/PORTAL_ADMIN_REQUIRED/);
 const log=portal.inspectAudit('admin');assert.equal(log.length,4);
 assert.equal(log.every(record=>record.input&&record.output),true);
 assert.equal(JSON.stringify(log).includes('pupil-'),false);
 assert.throws(()=>portal.recordDelivery(draft.operationId,'delivered'),/PORTAL_DEMO_DELIVERY_DISABLED/);
 assert.equal(isPortalDelivered(portal.snapshot(draft.operationId)),false);
 assert.deepEqual(portal.snapshot(draft.operationId).events.map(e=>e.id),[1,2,3,4]);
});

test('wire parser rejects impossible delivery claims and invalid dates',()=>{
 const portal=new SyntheticPortal();const draft=portal.submit(request());
 assert.throws(()=>portalRequest.parse(request({date:'2026-02-30'})));
 assert.throws(()=>portalSnapshot.parse({...draft,status:'DELIVERED',deliveryRef:'delivery-made-up'}));
 assert.throws(()=>portalSnapshot.parse({...draft,complete:false}));
 assert.throws(()=>portalSnapshot.parse({...draft,checks:{attendanceRows:0,homeworkRows:0,missingCount:1,ambiguousCount:1}}));
 const content=portal.approveContent(draft.operationId,'teacher-a',draft.artifactRef!,draft.planVersion,draft.planHash);
 assert.throws(()=>portalSnapshot.parse({...content,events:draft.events}));
});

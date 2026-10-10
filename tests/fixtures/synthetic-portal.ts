import {createHash,randomUUID} from 'node:crypto';
import {portalRequest,portalSnapshot,type PortalClassSummaryRequest,type PortalClassSummarySnapshot} from '../../src/lib/office/portal-class-summary-contract';

type Condition='complete'|'partial'|'missing'|'ambiguous';
/** Disposable Portal-owned fixture. It is never a production transport or student store. */
export class SyntheticPortal {
 private readonly children=new Map<string,{hash:string;id:string}>();
 private readonly operations=new Map<string,PortalClassSummarySnapshot>();
 private readonly audit:Array<{id:number;action:string;input:object;output:PortalClassSummarySnapshot}>=[];
 private readonly pupils=['pupil-001','pupil-002','pupil-003'];
 constructor(private readonly options:{condition?:Condition}={}){}
 operationCount(){return this.operations.size;}
 inspectAudit(role:'admin'|'teacher'){
  if(role!=='admin')throw new Error('PORTAL_ADMIN_REQUIRED');
  return structuredClone(this.audit);
 }
 private record(action:string,input:object,output:PortalClassSummarySnapshot){this.audit.push({id:this.audit.length+1,action,input:structuredClone(input),output:structuredClone(output)});}
 snapshot(id:string){const result=this.operations.get(id);if(!result)throw new Error('PORTAL_OPERATION_MISSING');return structuredClone(result);}
 submit(raw:unknown):PortalClassSummarySnapshot {
  const input=portalRequest.parse(raw),hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const existing=this.children.get(input.idempotencyKey);
  if(existing){if(existing.hash!==hash)throw new Error('PORTAL_IDEMPOTENCY_CONFLICT');const replay=this.snapshot(existing.id);this.record('submit.replay',input,replay);return replay;}
  if(input.staffRef!=='teacher-a'||input.classRef!=='class-a'||input.date!=='2026-10-10')throw new Error('PORTAL_SCOPE_DENIED');
  if(input.sourceRefs.attendance!=='attendance-2026-10-10-a'||input.sourceRefs.homework!=='homework-2026-10-10-a')throw new Error('PORTAL_SOURCE_UNAVAILABLE');
  const condition=this.options.condition??'complete',complete=condition==='complete',id=randomUUID();
  const snapshot=portalSnapshot.parse({contractVersion:1,operationId:id,parentJobId:input.parentJobId,planVersion:input.planVersion,planHash:input.planHash,
   status:complete?'DRAFT_READY':'SOURCE_BLOCKED',complete,
   checks:{attendanceRows:condition==='missing'?0:this.pupils.length,homeworkRows:condition==='partial'?this.pupils.length-1:this.pupils.length,missingCount:condition==='missing'||condition==='partial'?1:0,ambiguousCount:condition==='ambiguous'?1:0},
   artifactRef:complete?`artifact-${randomUUID()}`:null,
   recipientSetHash:complete?createHash('sha256').update('synthetic-recipient-set-a').digest('hex'):null,
   contentApprovalRef:null,sendApprovalRef:null,deliveryRef:null,
   events:[{id:1,type:complete?'draft.ready':'source.blocked'}],
  });
  this.children.set(input.idempotencyKey,{hash,id});this.operations.set(id,snapshot);this.record('submit',input,snapshot);return this.snapshot(id);
 }
 private advance(id:string,status:PortalClassSummarySnapshot['status'],type:PortalClassSummarySnapshot['events'][number]['type'],fields:Partial<PortalClassSummarySnapshot>,auditInput:object) {
  const current=this.snapshot(id),next=portalSnapshot.parse({...current,...fields,status,events:[...current.events,{id:current.events.length+1,type}]});
  this.operations.set(id,next);this.record(type,auditInput,next);return this.snapshot(id);
 }
 private checkDraft(id:string,staffRef:string,artifactRef:string,planVersion:number,planHash:string) {
  const current=this.snapshot(id);
  if(staffRef!=='teacher-a')throw new Error('PORTAL_SCOPE_DENIED');
  if(current.artifactRef!==artifactRef)throw new Error('PORTAL_STALE_ARTIFACT');
  if(current.planVersion!==planVersion||current.planHash!==planHash)throw new Error('PORTAL_STALE_PLAN');
  return current;
 }
 approveContent(id:string,staffRef:string,artifactRef:string,planVersion:number,planHash:string) {
  const current=this.checkDraft(id,staffRef,artifactRef,planVersion,planHash);
  if(current.status!=='DRAFT_READY')throw new Error('PORTAL_APPROVAL_REQUIRED');
  return this.advance(id,'CONTENT_APPROVED','content.approved',{contentApprovalRef:`approval-${randomUUID()}`},{id,staffRef,artifactRef,planVersion,planHash});
 }
 approveSend(id:string,staffRef:string,artifactRef:string,planVersion:number,planHash:string,recipientSetHash:string) {
  const current=this.checkDraft(id,staffRef,artifactRef,planVersion,planHash);
  if(current.status!=='CONTENT_APPROVED')throw new Error('PORTAL_APPROVAL_REQUIRED');
  if(current.recipientSetHash!==recipientSetHash)throw new Error('PORTAL_STALE_RECIPIENTS');
  return this.advance(id,'SEND_APPROVED','send.approved',{sendApprovalRef:`approval-${randomUUID()}`},{id,staffRef,artifactRef,planVersion,planHash,recipientSetHash});
 }
 recordDelivery(id:string,result:'unknown'|'delivered') {
  const current=this.snapshot(id);
  if(!['SEND_APPROVED','DELIVERY_UNKNOWN'].includes(current.status))throw new Error('PORTAL_APPROVAL_REQUIRED');
  if(result==='delivered')throw new Error('PORTAL_DEMO_DELIVERY_DISABLED');
  return this.advance(id,'DELIVERY_UNKNOWN','delivery.unknown',{},{id,result});
 }
}

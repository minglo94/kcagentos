import {z} from 'zod';

const opaque=z.string().regex(/^[A-Za-z0-9_-]{3,100}$/);
const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
 const date=new Date(`${value}T00:00:00Z`);return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===value;
});
export const portalRequest=z.object({
 contractVersion:z.literal(1),parentJobId:z.string().uuid(),planVersion:z.number().int().positive(),planHash:z.string().regex(/^[a-f0-9]{64}$/),
 workflowId:z.literal('class-summary'),workflowVersion:z.literal(1),staffRef:opaque,classRef:opaque,date:isoDate,
 sourceRefs:z.object({attendance:opaque,homework:opaque}).strict(),idempotencyKey:z.string().uuid(),
}).strict();
export type PortalClassSummaryRequest=z.infer<typeof portalRequest>;

export const portalSnapshot=z.object({
 contractVersion:z.literal(1),operationId:z.string().uuid(),parentJobId:z.string().uuid(),
 planVersion:z.number().int().positive(),planHash:z.string().regex(/^[a-f0-9]{64}$/),
 status:z.enum(['SOURCE_BLOCKED','DRAFT_READY','CONTENT_APPROVED','SEND_APPROVED','DELIVERY_UNKNOWN','DELIVERED']),
 complete:z.boolean(),checks:z.object({attendanceRows:z.number().int().nonnegative(),homeworkRows:z.number().int().nonnegative(),missingCount:z.number().int().nonnegative(),ambiguousCount:z.number().int().nonnegative()}).strict(),
 artifactRef:opaque.nullable(),recipientSetHash:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
 contentApprovalRef:opaque.nullable(),sendApprovalRef:opaque.nullable(),deliveryRef:opaque.nullable(),
 events:z.array(z.object({id:z.number().int().positive(),type:z.enum(['source.blocked','draft.ready','content.approved','send.approved','delivery.unknown','delivery.confirmed'])}).strict()).max(20),
}).strict().superRefine((snapshot,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message});
 const blocked=snapshot.status==='SOURCE_BLOCKED';
 if(blocked? snapshot.complete||!!snapshot.artifactRef : !snapshot.complete||!snapshot.artifactRef)fail('Invalid source/artifact state');
 if(blocked===!!snapshot.recipientSetHash)fail('Invalid recipient state');
 const content=['CONTENT_APPROVED','SEND_APPROVED','DELIVERY_UNKNOWN','DELIVERED'].includes(snapshot.status);
 const send=['SEND_APPROVED','DELIVERY_UNKNOWN','DELIVERED'].includes(snapshot.status);
 if(content!==!!snapshot.contentApprovalRef||send!==!!snapshot.sendApprovalRef)fail('Invalid approval state');
 if((snapshot.status==='DELIVERED')!==!!snapshot.deliveryRef)fail('Invalid delivery state');
 if(snapshot.events.some((event,index)=>event.id!==index+1))fail('Invalid event sequence');
 if(snapshot.complete&&(snapshot.checks.missingCount!==0||snapshot.checks.ambiguousCount!==0||snapshot.checks.attendanceRows===0||snapshot.checks.homeworkRows===0))fail('Invalid source checks');
 const expectedLast:Record<typeof snapshot.status,typeof snapshot.events[number]['type']>={
  SOURCE_BLOCKED:'source.blocked',DRAFT_READY:'draft.ready',CONTENT_APPROVED:'content.approved',
  SEND_APPROVED:'send.approved',DELIVERY_UNKNOWN:'delivery.unknown',DELIVERED:'delivery.confirmed',
 };
 if(snapshot.events.at(-1)?.type!==expectedLast[snapshot.status])fail('Invalid status event');
 if(content&&!snapshot.events.some(event=>event.type==='content.approved'))fail('Missing content approval event');
 if(send&&!snapshot.events.some(event=>event.type==='send.approved'))fail('Missing send approval event');
});
export type PortalClassSummarySnapshot=z.infer<typeof portalSnapshot>;
export function isPortalDelivered(snapshot:PortalClassSummarySnapshot):boolean {return snapshot.status==='DELIVERED' && snapshot.complete && !!snapshot.deliveryRef;}

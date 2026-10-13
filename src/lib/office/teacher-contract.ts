import { createHash } from 'node:crypto';
import { z } from 'zod';

const ref=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const version=z.number().int().positive().max(2147483647);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const d=new Date(value+'T00:00:00.000Z');return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value;});
export const teacherInputSchema=z.object({classRef:ref,sourceBatchRef:ref,date}).strict();
export const teacherRequestSchema=z.object({requestId:ref,actor:ref,workflowVersion:z.literal(1),capability:z.literal('class.daily-summary.draft'),input:teacherInputSchema}).strict();
export const teacherDecisionSchema=z.object({decisionId:ref,requestId:ref,actor:ref,version,hash:digest,decision:z.enum(['approve','reject'])}).strict();
export const teacherCommandSchema=z.object({commandId:ref,requestId:ref,actor:ref,version,hash:digest,action:z.enum(['pause','resume','cancel','refresh'])}).strict();
export const teacherAssertionSchema=z.object({issuer:z.literal('keichi-local'),audience:z.string().max(300),subject:ref,method:z.enum(['POST','GET']),path:z.string().max(400),bodyHash:digest,timestamp:z.number().int().nonnegative(),nonce:z.string().uuid()}).strict();
const evidence=z.object({sourceRef:ref,artifactRef:ref.optional(),asOf:z.string().datetime({offset:true}),checks:z.object({complete:z.boolean(),identityMatched:z.boolean(),dateMatched:z.boolean(),sourceRows:z.number().int().nonnegative(),reconciledRows:z.number().int().nonnegative()}).strict().optional()}).strict();
const operation=z.object({operationId:ref.nullable(),planVersion:version,stepKey:ref,status:z.enum(['UNSUBMITTED','ACCEPTED','RUNNING','WAITING_CONTENT_APPROVAL','DRAFT_READY','FAILED','RESULT_UNKNOWN']),revision:z.number().int().nonnegative(),evidence:evidence.optional(),approvalRef:ref.optional()}).strict().superRefine((value,ctx)=>{
 const checks=value.evidence?.checks;
 if(value.status==='DRAFT_READY'&&(!value.operationId||!value.evidence?.artifactRef||!checks?.complete||!checks.identityMatched||!checks.dateMatched||checks.sourceRows!==checks.reconciledRows))ctx.addIssue({code:'custom',message:'Ready draft requires reconciled artifact evidence',path:['evidence']});
 if(value.status==='WAITING_CONTENT_APPROVAL'&&(!value.operationId||!value.approvalRef))ctx.addIssue({code:'custom',message:'Pending approval requires authoritative reference',path:['approvalRef']});
});
export const teacherSnapshotSchema=z.object({
 requestId:ref,jobId:ref,revision:z.number().int().nonnegative().max(2147483647),
 status:z.enum(['PLANNING','PENDING_PLAN_APPROVAL','QUEUED','RUNNING','WAITING_INPUT','PAUSED','SUCCEEDED','FAILED','CANCELLED']),
 planVersion:version,planHash:digest,approvedVersion:version.nullable(),
 plan:z.object({summary:z.string().max(2000),acceptance:z.array(z.string().max(1000)).max(20),steps:z.array(z.object({id:ref,title:z.string().max(300),agent:ref,executor:z.literal('portal.draft'),instructions:z.string().max(2000),dependsOn:z.array(ref).max(20),portalInput:teacherInputSchema}).strict()).min(1).max(20)}).strict(),
 steps:z.array(z.object({key:ref,status:z.string().max(40),result:z.string().max(2000).nullable()}).strict()).max(20),
 portalOperations:z.array(operation).max(30),
 events:z.array(z.object({id:z.number().int().nonnegative(),type:z.string().max(100),createdAt:z.string().datetime({offset:true})}).strict()).max(100),
 errorCode:z.string().regex(/^[A-Z_]{1,80}$/).nullable(),
}).strict();
export type TeacherRequest=z.infer<typeof teacherRequestSchema>;
export type TeacherDecision=z.infer<typeof teacherDecisionSchema>;
export type TeacherCommand=z.infer<typeof teacherCommandSchema>;
export type TeacherSnapshot=z.infer<typeof teacherSnapshotSchema>;
export const hashTeacherBody=(body:string)=>createHash('sha256').update(body).digest('hex');
export const hashTeacherRequest=(data:unknown)=>hashTeacherBody(JSON.stringify(teacherRequestSchema.parse(data)));
export const hashTeacherDecision=(data:unknown)=>hashTeacherBody(JSON.stringify(teacherDecisionSchema.parse(data)));
export const hashTeacherCommand=(data:unknown)=>hashTeacherBody(JSON.stringify(teacherCommandSchema.parse(data)));
export interface TeacherClient {
 create(request:TeacherRequest,signal?:AbortSignal):Promise<TeacherSnapshot>;
 snapshot(requestId:string,actor:string,signal?:AbortSignal):Promise<TeacherSnapshot>;
 decide(decision:TeacherDecision,signal?:AbortSignal):Promise<TeacherSnapshot>;
 command(command:TeacherCommand,signal?:AbortSignal):Promise<TeacherSnapshot>;
}

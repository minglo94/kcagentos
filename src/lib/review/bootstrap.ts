import {lstat,realpath} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import type {PrismaClient} from '@prisma/client';
import {bootstrapLocalAdmin} from '../school-auth/store';
import {createJob} from '../office/store';
import {runNext} from '../office/worker';
import type {OfficePlan} from '../office/plan';

type Env=Record<string,string|undefined>;
const configurationError=()=>new Error('REVIEW_CONFIGURATION_REQUIRED');

export function assertReviewConfiguration(env:Env=process.env):void{
 if(env.AGENTOS_REVIEW_MODE!=='synthetic'||env.AGENTOS_TASK_DATA_MODE!=='synthetic'||
    env.AGENTOS_LOCAL_AUTH_ENABLED!=='true'||env.AGENTOS_AD_AUTH_ENABLED!=='false'||
    !env.AGENTOS_AUDIT_ROOT||!isAbsolute(env.AGENTOS_AUDIT_ROOT))throw configurationError();
}

export async function assertAuditRoot(path:string){
 try{
  const info=await lstat(path),canonical=await realpath(path),relativeToApp=relative(process.cwd(),resolve(path));
  if(!info.isDirectory()||info.isSymbolicLink()||canonical!==resolve(path)||(info.mode&0o077)||
     info.uid!==process.getuid?.()||!relativeToApp||(!relativeToApp.startsWith('..')&&!isAbsolute(relativeToApp)))throw configurationError();
 }catch{throw configurationError();}
}

const samplePlan:OfficePlan={
 summary:'Review the synthetic school-workflow preview. No real student data or delivery is involved.',
 acceptance:['Reviewer checks the draft and records a manual demo observation.'],
 steps:[{id:'review',title:'Inspect synthetic review evidence',agent:'clerk',executor:'manual',dependsOn:[],instructions:'Record a synthetic observation only; do not enter student data or send anything.'}],
};

export async function initializeReview(db:PrismaClient,credentials:{name:string;email:string;username:string;password:string}){
 assertReviewConfiguration();
 await assertAuditRoot(process.env.AGENTOS_AUDIT_ROOT!);
 if(await db.user.count()||await db.officeJob.count())throw new Error('REVIEW_DATABASE_NOT_EMPTY');
 const admin=await bootstrapLocalAdmin(db,credentials);
 const job=await createJob(db,admin.id,'Review synthetic Office workflow','school');
 await runNext(db,{plan:async()=>samplePlan});
 const planned=await db.officeJob.findUniqueOrThrow({where:{id:job.id}});
 if(planned.status!=='PENDING_PLAN_APPROVAL')throw new Error('REVIEW_PLAN_NOT_READY');
 return {adminId:admin.id,jobId:job.id,jobStatus:planned.status};
}

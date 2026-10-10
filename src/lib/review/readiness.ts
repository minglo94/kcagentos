import type {PrismaClient} from '@prisma/client';
import {assertAuditRoot,assertReviewConfiguration} from './bootstrap';

/** A review deployment is ready only after its schema and first admin exist. */
export async function reviewReady(db:PrismaClient,env:Record<string,string|undefined>=process.env):Promise<boolean>{
 try{
  assertReviewConfiguration(env);
  await assertAuditRoot(env.AGENTOS_AUDIT_ROOT!);
  await db.taskAttempt.count();
  return !!await db.user.count({where:{role:'ADMIN',isActive:true}});
 }catch{return false;}
}

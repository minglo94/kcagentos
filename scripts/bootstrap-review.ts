/** Explicit one-off setup for a fresh, isolated synthetic Zeabur review database. */
import {PrismaClient} from '@prisma/client';
import {initializeReview} from '../src/lib/review/bootstrap';

async function main(){
 if(!process.env.DATABASE_URL)throw new Error('REVIEW_DATABASE_REQUIRED');
 const credentials={
  name:process.env.AGENTOS_REVIEW_ADMIN_NAME??'',
  email:process.env.AGENTOS_REVIEW_ADMIN_EMAIL??'',
  username:process.env.AGENTOS_REVIEW_ADMIN_USERNAME??'',
  password:process.env.AGENTOS_REVIEW_ADMIN_PASSWORD??'',
 };
 const db=new PrismaClient();
 try{
  const result=await initializeReview(db,credentials);
  console.log(`Synthetic review administrator and pending plan created. Job ID: ${result.jobId}`);
 }finally{await db.$disconnect();}
}
void main().catch(error=>{
 const code=error instanceof Error&&['REVIEW_CONFIGURATION_REQUIRED','REVIEW_DATABASE_NOT_EMPTY','REVIEW_DATABASE_REQUIRED','REVIEW_PLAN_NOT_READY'].includes(error.message)?error.message:'REVIEW_BOOTSTRAP_FAILED';
 console.error(code);process.exitCode=1;
});

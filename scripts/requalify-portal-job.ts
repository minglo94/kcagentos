import { PrismaClient } from '@prisma/client';
import { requalifyLegacyPortalJob } from '../src/lib/office/requalify';

async function main(){
  const args=process.argv.slice(2);
  const adminId=args[args.indexOf('--admin')+1],jobId=args[args.indexOf('--job')+1];
  if(!args.includes('--admin')||!args.includes('--job')||!adminId||!jobId)throw new Error('Use --admin USER_ID --job JOB_ID [--apply]. Preview is the default.');
  const db=new PrismaClient();
  try{console.log(JSON.stringify(await requalifyLegacyPortalJob(db,adminId,jobId,args.includes('--apply'))));}
  finally{await db.$disconnect();}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'REQUALIFICATION_FAILED');process.exitCode=1;});

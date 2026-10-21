import {NextRequest} from 'next/server';
import {requireRole} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {listAudits} from '@/lib/task-audit/admin';
import {auditResponse,auditFailure} from '@/lib/task-audit/http';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{
 const {userId}=await requireRole('ADMIN');const query=req.nextUrl.searchParams;const before=query.get('before');
 if(before&&!Number.isFinite(Date.parse(before)))return auditResponse({attempts:[]});
 return auditResponse({attempts:await listAudits(prisma,userId,{jobId:query.get('jobId')?.slice(0,100),status:query.get('status')?.slice(0,30),before:before?new Date(before):undefined,beforeId:before?query.get("beforeId")?.slice(0,100):undefined})});
}catch(e){return auditFailure(e);}}

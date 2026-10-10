import {NextRequest} from 'next/server';
import {requireRole} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {readAuditPayload} from '@/lib/task-audit/admin';
import {auditResponse,auditFailure} from '@/lib/task-audit/http';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const {userId}=await requireRole('ADMIN');const direction=req.nextUrl.searchParams.get('direction');if(direction!=='input'&&direction!=='output')return auditResponse({available:false,text:''});return auditResponse(await readAuditPayload(prisma,userId,(await params).id,direction));}catch(e){return auditFailure(e);}}

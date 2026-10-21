import {NextRequest} from 'next/server';
import {requireRole} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {readAudit} from '@/lib/task-audit/admin';
import {auditResponse,auditFailure} from '@/lib/task-audit/http';
export const dynamic='force-dynamic';
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const {userId}=await requireRole('ADMIN');return auditResponse(await readAudit(prisma,userId,(await params).id));}catch(e){return auditFailure(e);}}

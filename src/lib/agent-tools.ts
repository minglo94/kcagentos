import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
import type {ToolCall} from '@/lib/agents';
import type {ExecutionPolicy} from './task-policy/policy';
import {beginAttempt,finishAttempt} from './task-audit/store';
import {prisma} from './prisma';

export interface ToolContext {userId:string;policy?:ExecutionPolicy;parentId?:string;db?:PrismaClient}

/** Chat has no approved plan-bound school tool surface yet. Always journal and deny. */
export async function runAgentTool(call:ToolCall,ctx:ToolContext):Promise<never> {
 if(!ctx.policy || ctx.policy.actorId!==ctx.userId)throw new Error('POLICY_DENIED');
 const db=ctx.db??prisma;
 const attempt=await beginAttempt(db,{actorId:ctx.userId,policy:ctx.policy,parentId:ctx.parentId,invocationKey:randomUUID(),executor:'tool',input:Buffer.from(JSON.stringify(call))});
 await finishAttempt(db,attempt.id,'DENIED','POLICY_DENIED');
 throw new Error('POLICY_DENIED');
}

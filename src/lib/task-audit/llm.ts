import type {PrismaClient} from '@prisma/client';
import {streamLLM,type Engine,type LLMMessage,type LLMOptions} from '../llm';
import type {ExecutionPolicy} from '../task-policy/policy';
import {localModelConfig} from '../task-policy/local-model';
import {auditedStream} from './invoke';
export function auditedLLM(db:PrismaClient,engine:Engine,messages:LLMMessage[],opts:LLMOptions & {policy:ExecutionPolicy;parentId?:string}) {
 return auditedStream(db,{actorId:opts.policy.actorId,policy:opts.policy,parentId:opts.parentId,executor:'local-model',model:localModelConfig().model,input:Buffer.from(JSON.stringify({messages,system:opts.system??'',maxTokens:opts.maxTokens??4096}))},()=>streamLLM(engine,messages,opts),opts.signal);
}
export async function auditedCompletion(db:PrismaClient,engine:Engine,messages:LLMMessage[],opts:LLMOptions & {policy:ExecutionPolicy;parentId?:string}) {
 let result='';for await(const chunk of auditedLLM(db,engine,messages,opts))result+=chunk;return result;
}

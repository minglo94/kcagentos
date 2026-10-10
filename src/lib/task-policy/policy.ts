import { createHash } from "node:crypto";
import type { PrismaClient } from '@prisma/client';

export type ExecutionPolicy = Readonly<{version: 1; actorId: string; classification: 'restricted' | 'development'; sourceIds: readonly string[]; outputRootId: string | null}>;
export type Capability = 'localInference' | 'cloudInference' | 'onlineSearch' | 'browser' | 'arbitraryHttp' | 'externalPublish' | 'codexReadonly' | 'sourceRead' | 'outputWrite' | 'portalQuery';
export function restrictedPolicy(actorId: string): ExecutionPolicy {
  if (!actorId) throw new Error('POLICY_DENIED');
  return Object.freeze({version: 1, actorId, classification: 'restricted', sourceIds: Object.freeze([]), outputRootId: null});
}
export async function resolvePolicy(db: PrismaClient, actorId: string, workspaceId?: string): Promise<ExecutionPolicy> {
  const user = await db.user.findFirst({where: {id: actorId, isActive: true}, select: {id: true}});
  if (!user) throw new Error('POLICY_DENIED');
  const allowed = (process.env.AGENTOS_DEVELOPMENT_ACTORS ?? '').split(',').filter(Boolean);
  if (workspaceId === 'development' && process.env.AGENTOS_CODEX_WORKSPACE && allowed.includes(actorId))
    return Object.freeze({...restrictedPolicy(user.id), classification: 'development'});
  return restrictedPolicy(user.id);
}
export function assertCapability(policy: ExecutionPolicy | undefined, capability: Capability): void {
  if (!policy || policy.version !== 1 || !policy.actorId || (capability !== 'localInference' && !(capability === 'codexReadonly' && policy.classification === 'development'))) throw new Error('POLICY_DENIED');
}
/** This release supports synthetic qualification only, not real student activation. */
export function requireSyntheticExecution(): void {
  if (process.env.AGENTOS_TASK_DATA_MODE !== 'synthetic') throw new Error('SCHOOL_EXECUTION_NOT_READY');
}

export function policyHash(policy:ExecutionPolicy):string {
 return createHash('sha256').update(JSON.stringify([policy.version,policy.actorId,policy.classification,[...policy.sourceIds].sort(),policy.outputRootId])).digest('hex');
}

import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {getSession} from '../auth';
import {prisma} from '../prisma';
import {resolvePolicy} from './policy';
import {beginAttempt,finishAttempt} from '../task-audit/store';
/** Refuse an unqualified task before reading its body or contacting a connector. */
export async function denyUnsupportedTask(route:string):Promise<NextResponse|null> {
 const session=await getSession();
 if(!session?.user?.id)return NextResponse.json({error:'NOT_AUTHENTICATED'},{status:401});
 try {
  const policy=await resolvePolicy(prisma,session.user.id);
  const a=await beginAttempt(prisma,{actorId:policy.actorId,policy,invocationKey:randomUUID(),executor:'route.denied',input:Buffer.from(JSON.stringify({route,bodyAccepted:false}))});
  await finishAttempt(prisma,a.id,'DENIED','SOURCE_OR_OUTPUT_NOT_QUALIFIED');
 }catch{return NextResponse.json({error:'AUDIT_UNAVAILABLE'},{status:503});}
 return NextResponse.json({error:'SOURCE_OR_OUTPUT_NOT_QUALIFIED'},{status:403});
}

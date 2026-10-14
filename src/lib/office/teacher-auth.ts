import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { hashTeacherBody, teacherAssertionSchema } from './teacher-contract';
import { OfficeError } from './plan';
import { owned } from './store';

export type TeacherEnv = Record<string, string | undefined>;
type Db = Prisma.TransactionClient | PrismaClient;
const equal = (a: string, b: string) => { const left=Buffer.from(a), right=Buffer.from(b); return left.length===right.length && timingSafeEqual(left,right); };
export async function assertOfficeOperator(db: Db, userId: string) {
  const user=await db.user.findFirst({where:{id:userId,isActive:true,role:'ADMIN'}});
  if (!user) throw new OfficeError(403,'OPERATOR_REQUIRED');
  return user;
}
export async function assertBrowserJobMutation(db: Db, jobId: string, userId: string) {
  await assertOfficeOperator(db,userId);
  const job=await owned(db,jobId,userId);
  if(job.team==='school' || await db.portalTeacherRequest.findUnique({where:{jobId}})) throw new OfficeError(403,'PORTAL_AUTHORITY_REQUIRED');
  return job;
}
export async function currentTeacherMapping(db: Db, issuer: string, portalStaffId: string) {
  const mapping=await db.portalTeacherMapping.findUnique({where:{issuer_portalStaffId:{issuer,portalStaffId}},include:{user:true}});
  if(!mapping?.isActive || !mapping.user.isActive || !['TEACHER','DEPT_HEAD','APPROVER','ADMIN'].includes(mapping.user.role)) throw new OfficeError(403,'PORTAL_ACCESS_DENIED');
  return mapping;
}
export async function readTeacherBody(req: Request) {
  if(Number(req.headers.get('content-length'))>8192) throw new OfficeError(413,'PAYLOAD_TOO_LARGE');
  if(!req.body) return '';
  const reader=req.body.getReader(); let bytes=0; const chunks:Uint8Array[]=[];
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();throw new OfficeError(413,'PAYLOAD_TOO_LARGE');}chunks.push(value);}
    return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
  } finally {reader.releaseLock();}
}
export async function authenticateTeacher(db:PrismaClient, env:TeacherEnv, req:Request, body:string) {
  const origin=env.PORTAL_INGRESS_ORIGIN,token=env.PORTAL_INGRESS_SERVICE_TOKEN,secret=env.PORTAL_INGRESS_ASSERTION_SECRET;
  if(env.PORTAL_INGRESS_ENABLED!=='true'||!origin||!token||token.length<48||!secret||secret.length<32)throw new OfficeError(503,'PORTAL_INGRESS_DISABLED');
  let trusted:URL;
  try{trusted=new URL(origin);}catch{throw new OfficeError(503,'PORTAL_INGRESS_DISABLED');}
  if(trusted.origin!==origin || !['https:','http:'].includes(trusted.protocol) || (trusted.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(trusted.hostname)))throw new OfficeError(503,'PORTAL_INGRESS_DISABLED');
  const url=new URL(req.url);
  // Next may normalize its internal URL to localhost behind the public Host.
  // Host must match configuration; the signed audience independently binds the public origin.
  const requestHost=req.headers.get('host')??url.host;
  if(requestHost!==trusted.host || (req.headers.has('origin')&&req.headers.get('origin')!==origin))throw new OfficeError(403,'INVALID_ORIGIN');
  const encoded=req.headers.get('x-portal-assertion')||'',signature=req.headers.get('x-portal-signature')||'';
  if(!equal(req.headers.get('authorization')||'',`Bearer ${token}`)||encoded.length>4096||!/^[A-Za-z0-9_-]+$/.test(encoded)||!/^[a-f0-9]{64}$/.test(signature)||!equal(signature,createHmac('sha256',secret).update(encoded).digest('hex')))throw new OfficeError(401,'INVALID_ASSERTION');
  let assertion;
  try{assertion=teacherAssertionSchema.parse(JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')));}catch{throw new OfficeError(401,'INVALID_ASSERTION');}
  if(assertion.audience!==origin||assertion.method!==req.method||assertion.path!==url.pathname+url.search||assertion.bodyHash!==hashTeacherBody(body)||Math.abs(assertion.timestamp-Math.floor(Date.now()/1000))>60)throw new OfficeError(401,'INVALID_ASSERTION');
  // Atomic unique insertion avoids serializable gap-read contention between unrelated nonces.
  // Effect transactions independently refresh mapping and retain Serializable isolation.
  let mapping;
  try{mapping=await db.$transaction(async tx=>{
    const current=await currentTeacherMapping(tx,assertion.issuer,assertion.subject);
    const inserted=await tx.portalTeacherNonce.createMany({data:[{issuer:assertion.issuer,nonce:assertion.nonce}],skipDuplicates:true});
    if(inserted.count!==1)throw new OfficeError(409,'ASSERTION_REPLAY');
    return current;
  },{isolationLevel:"ReadCommitted",maxWait:10000,timeout:20000});}
  catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw new OfficeError(409,'ASSERTION_REPLAY');throw error;}
  return {assertion,mapping};
}

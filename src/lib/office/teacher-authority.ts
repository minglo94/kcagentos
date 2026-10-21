import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { teacherAuthoritySchema, type TeacherAuthority } from './teacher-contract';

export class TeacherAuthorityError extends Error {
 constructor(readonly status:number,code:string){super(code);}
}
const message=(value:Omit<TeacherAuthority,'signature'>)=>Buffer.from(JSON.stringify({issuer:'keichi-local',purpose:value.purpose,payloadHash:value.payloadHash,issuedAt:value.issuedAt,expiresAt:value.expiresAt}));
/** Only Portal holds the private key; call after live scope/decision validation. */
export function issueTeacherAuthority(purpose:TeacherAuthority['purpose'],payloadHash:string,privatePem:string,now=Math.floor(Date.now()/1000)):TeacherAuthority {
 let key;try{key=createPrivateKey(privatePem);if(key.asymmetricKeyType!=='ed25519')throw Error();}catch{throw new TeacherAuthorityError(503,'PORTAL_AUTHORITY_NOT_CONFIGURED');}
 const data={purpose,payloadHash,issuedAt:now,expiresAt:now+120};
 return teacherAuthoritySchema.parse({...data,signature:sign(null,message(data),key).toString('base64url')});
}
/** Independent authorization proof, distinct from server transport authentication. */
export function verifyTeacherAuthority(purpose:TeacherAuthority['purpose'],payloadHash:string,value:unknown,publicPem:string,now=Math.floor(Date.now()/1000)):void {
 let key;try{key=createPublicKey(publicPem);if(key.asymmetricKeyType!=='ed25519')throw Error();}catch{throw new TeacherAuthorityError(503,'PORTAL_AUTHORITY_NOT_CONFIGURED');}
 const parsed=teacherAuthoritySchema.safeParse(value);
 if(!parsed.success)throw new TeacherAuthorityError(403,'PORTAL_AUTHORITY_DENIED');
 const proof=parsed.data;
 if(proof.purpose!==purpose||proof.payloadHash!==payloadHash||proof.issuedAt>now+5||proof.expiresAt<now||proof.expiresAt<=proof.issuedAt||proof.expiresAt-proof.issuedAt>120||!verify(null,message(proof),key,Buffer.from(proof.signature,'base64url')))throw new TeacherAuthorityError(403,'PORTAL_AUTHORITY_DENIED');
}

import {NextResponse} from 'next/server';
import {AuthError} from '../auth';
export function auditResponse(data:unknown){return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});}
export function auditFailure(error:unknown){
 const code=error instanceof Error?error.message:'';
 const status=error instanceof AuthError?error.status:code==='ADMIN_REQUIRED'?403:code==='AUDIT_NOT_FOUND'?404:503;
 return NextResponse.json({error:status===503?'AUDIT_UNAVAILABLE':status===404?'AUDIT_NOT_FOUND':'ACCESS_DENIED'},{status,headers:{'Cache-Control':'no-store'}});
}

import {NextResponse} from 'next/server';
import {prisma} from '@/lib/prisma';
import {reviewReady} from '@/lib/review/readiness';

export async function GET(){
 const ready=await reviewReady(prisma);
 return NextResponse.json({status:ready?'ready':'unready'},{status:ready?200:503,headers:{'Cache-Control':'no-store'}});
}

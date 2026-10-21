import { prisma } from '@/lib/prisma';
import { makeTeacherHandlers } from '@/lib/office/teacher-ingress';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(req:Request,{params}:{params:Promise<{requestId:string}>}) {
  return makeTeacherHandlers(prisma,process.env).snapshot(req,(await params).requestId);
}

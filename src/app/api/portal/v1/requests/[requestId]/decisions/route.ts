import { prisma } from '@/lib/prisma';
import { makeTeacherHandlers } from '@/lib/office/teacher-ingress';
export const runtime='nodejs';
export async function POST(req:Request,{params}:{params:Promise<{requestId:string}>}) {
  return makeTeacherHandlers(prisma,process.env).decision(req,(await params).requestId);
}

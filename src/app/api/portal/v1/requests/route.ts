import { prisma } from '@/lib/prisma';
import { makeTeacherHandlers } from '@/lib/office/teacher-ingress';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const POST=(req:Request)=>makeTeacherHandlers(prisma,process.env).create(req);

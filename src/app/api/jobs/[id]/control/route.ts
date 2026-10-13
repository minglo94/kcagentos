import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { officeFailure, officeUser } from "@/lib/office/http";
import { controlJob } from "@/lib/office/store";
import { assertBrowserJobMutation } from '@/lib/office/teacher-auth';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const userId = await officeUser(req);
    await assertBrowserJobMutation(prisma,id,userId);
    const { action } = z.object({ action: z.enum(["pause", "resume", "cancel", "replan"]) }).strict().parse(await req.json());
    const job = await controlJob(prisma, id, userId, action);
    return NextResponse.json({ id: job.id, status: job.status });
  } catch (error) { return officeFailure(error); }
}

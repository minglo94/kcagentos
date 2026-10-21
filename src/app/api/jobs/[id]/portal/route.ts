import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { officeFailure, officeUser } from "@/lib/office/http";
import { queuePortalRefresh } from "@/lib/office/portal-workflow";
import { assertBrowserJobMutation } from '@/lib/office/teacher-auth';
const input = z.object({ version: z.number().int().positive(), hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await officeUser(req);
    await assertBrowserJobMutation(prisma,(await params).id,userId);
    const { version, hash } = input.parse(await req.json());
    await queuePortalRefresh(prisma, (await params).id, userId, version, hash);
    return NextResponse.json({ queued: true });
  } catch (error) { return officeFailure(error); }
}

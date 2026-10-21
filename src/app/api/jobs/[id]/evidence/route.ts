import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { officeFailure, officeUser } from "@/lib/office/http";
import { completeManual } from "@/lib/office/store";
import { assertBrowserJobMutation } from '@/lib/office/teacher-auth';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const userId = await officeUser(req);
    await assertBrowserJobMutation(prisma,id,userId);
    const { key, evidence, version, hash } = z.object({ key: z.string().min(1).max(40), evidence: z.string().trim().min(3).max(4000), version: z.number().int().positive(), hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(await req.json());
    await completeManual(prisma, id, userId, key, evidence, version, hash);
    return NextResponse.json({ ok: true });
  } catch (error) { return officeFailure(error); }
}

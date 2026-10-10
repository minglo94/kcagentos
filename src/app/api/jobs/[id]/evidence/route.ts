import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { officeFailure, officeUser } from "@/lib/office/http";
import { completeManual } from "@/lib/office/store";
export async function POST(req: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  try {
    const userId = await officeUser(req);
    const { key, evidence, version, hash } = z.object({ key: z.string().min(1).max(40), evidence: z.string().trim().min(3).max(4000), version: z.number().int().positive(), hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(await req.json());
    await completeManual(prisma, params.id, userId, key, evidence, version, hash);
    return NextResponse.json({ ok: true });
  } catch (error) { return officeFailure(error); }
}

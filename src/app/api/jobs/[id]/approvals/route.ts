import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { officeFailure, officeUser } from "@/lib/office/http";
import { approvePlan } from "@/lib/office/store";
const schema = z.object({ version: z.number().int().positive(), hash: z.string().regex(/^[a-f0-9]{64}$/), decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(1000).optional() }).strict();
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await officeUser(req);
    const input = schema.parse(await req.json());
    const job = await approvePlan(prisma, params.id, userId, input.version, input.hash, input.decision, input.reason);
    return NextResponse.json({ id: job.id, status: job.status });
  } catch (error) { return officeFailure(error); }
}

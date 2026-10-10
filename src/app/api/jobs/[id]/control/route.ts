import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { officeFailure, officeUser } from "@/lib/office/http";
import { controlJob } from "@/lib/office/store";
export async function POST(req: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  try {
    const userId = await officeUser(req);
    const { action } = z.object({ action: z.enum(["pause", "resume", "cancel", "replan"]) }).strict().parse(await req.json());
    const job = await controlJob(prisma, params.id, userId, action);
    return NextResponse.json({ id: job.id, status: job.status });
  } catch (error) { return officeFailure(error); }
}

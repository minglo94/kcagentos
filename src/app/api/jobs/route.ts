import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { officeFailure, officeUser } from "@/lib/office/http";
import { createJobSchema } from "@/lib/office/plan";
import { createJob } from "@/lib/office/store";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const userId = await officeUser(req);
    const jobs = await prisma.officeJob.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, goal: true, team: true, status: true, createdAt: true, planVersion: true, errorCode: true } });
    return NextResponse.json({ jobs });
  } catch (error) { return officeFailure(error); }
}
export async function POST(req: NextRequest) {
  try {
    const userId = await officeUser(req);
    const { goal, team } = createJobSchema.parse(await req.json());
    const job = await createJob(prisma, userId, goal, team);
    return NextResponse.json({ id: job.id, status: job.status }, { status: 201 });
  } catch (error) { return officeFailure(error); }
}

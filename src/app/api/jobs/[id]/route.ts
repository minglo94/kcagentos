import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { officeFailure, officeUser } from "@/lib/office/http";
import { owned } from "@/lib/office/store";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  try {
    const userId = await officeUser(req);
    const job = await owned(prisma, params.id, userId);
    const [steps, events] = await Promise.all([
      prisma.officeStep.findMany({ where: { jobId: job.id } }),
      prisma.officeEvent.findMany({ where: { jobId: job.id }, orderBy: { id: "desc" }, take: 300 }),
    ]);
    return NextResponse.json({ id: job.id, goal: job.goal, team: job.team, status: job.status, plan: job.plan, planHash: job.planHash,
      planVersion: job.planVersion, approvedVersion: job.approvedVersion, errorCode: job.errorCode,
      workerActive: Boolean(job.leaseToken && job.leaseUntil && job.leaseUntil.getTime() > Date.now()), steps, events: events.reverse() });
  } catch (error) { return officeFailure(error); }
}

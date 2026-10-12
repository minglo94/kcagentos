import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { officeFailure, officeUser } from "@/lib/office/http";
import { portalInputSchema } from "@/lib/office/portal-contract";
import { createPortalDraftJob } from "@/lib/office/portal-workflow";
export async function POST(req: NextRequest) {
  try {
    const userId = await officeUser(req);
    const job = await createPortalDraftJob(prisma, userId, portalInputSchema.parse(await req.json()));
    return NextResponse.json({ id: job.id, status: job.status }, { status: 201 });
  } catch (error) { return officeFailure(error); }
}

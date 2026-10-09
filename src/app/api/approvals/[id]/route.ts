import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Pusher from "pusher";

const pusher =
  process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET
    ? new Pusher({
        appId:   process.env.PUSHER_APP_ID,
        key:     process.env.PUSHER_KEY,
        secret:  process.env.PUSHER_SECRET,
        cluster: process.env.PUSHER_CLUSTER ?? "ap1",
        useTLS:  true,
      })
    : null;

// PATCH /api/approvals/[id]
// body: { action: "approve" | "reject", rejectionReason?: string }
export async function PATCH(req: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  let userId: string;
  try {
    ({ userId } = await requireRole("ADMIN", "APPROVER"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { action, rejectionReason } = await req.json();
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action 必須為 approve 或 reject" }, { status: 400 });
  }
  if (action === "reject" && !rejectionReason?.trim()) {
    return NextResponse.json({ error: "退回時必須填寫原因" }, { status: 400 });
  }

  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc) return NextResponse.json({ error: "找不到文件" }, { status: 404 });
  if (doc.approvalStatus !== "PENDING") {
    return NextResponse.json({ error: "此文件並非待批核狀態" }, { status: 409 });
  }

  const newStatus = action === "approve" ? "APPROVED" : "REJECTED";

  const updated = await prisma.document.update({
    where: { id: params.id },
    data: {
      approvalStatus:  newStatus,
      approvedBy:      userId,
      approvedAt:      new Date(),
      rejectionReason: action === "reject" ? rejectionReason : null,
    },
  });

  // Also update associated task status
  await prisma.task.update({
    where: { id: doc.taskId },
    data:  { status: action === "approve" ? "DONE" : "FAILED" },
  }).catch(() => {});

  await prisma.auditLog.create({
    data: { userId, action: action === "approve" ? "APPROVE" : "REJECT", engine: "system", docType: doc.docType },
  }).catch(() => {});

  // Notify the requester via Pusher
  if (pusher) {
    try {
      await pusher.trigger(`user-${doc.userId}`, "doc-approval", {
        documentId:      params.id,
        title:           doc.title,
        status:          newStatus,
        rejectionReason: updated.rejectionReason ?? null,
        message: action === "approve"
          ? `✓「${doc.title}」已批核，現可下載及發出`
          : `✗「${doc.title}」被退回：${rejectionReason}`,
      });
    } catch {}
  }

  return NextResponse.json({ ok: true, id: params.id, status: newStatus });
}

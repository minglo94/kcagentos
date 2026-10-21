import { denyUnsupportedTask } from "@/lib/task-policy/deny-route";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import Pusher from "pusher";
import { createSubstitutionEvent, isCalendarConfigured } from "@/lib/gcal";

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

// POST /api/notify/callback — n8n 回調（WhatsApp 回覆）
// header: x-webhook-secret
// body: { requestId, status: "CONFIRMED" | "DECLINED", teacherName? }
export async function POST(req: NextRequest) {
  const blocked = await denyUnsupportedTask("notify/callback:POST"); if (blocked) return blocked;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "伺服器未設定 N8N_WEBHOOK_SECRET" }, { status: 503 });
  }
  if (req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "驗證失敗" }, { status: 401 });
  }

  const body = await req.json();
  const requestId = String(body.requestId ?? "");
  const status    = String(body.status ?? "").toUpperCase();
  const teacherName = body.teacherName ? String(body.teacherName) : null;

  if (!requestId) return NextResponse.json({ error: "缺少 requestId" }, { status: 400 });
  if (status !== "CONFIRMED" && status !== "DECLINED") {
    return NextResponse.json({ error: "status 必須為 CONFIRMED 或 DECLINED" }, { status: 400 });
  }

  const sub = await prisma.substitutionRequest.findUnique({ where: { id: requestId } });
  if (!sub) return NextResponse.json({ error: "找不到代課請求" }, { status: 404 });

  const updated = await prisma.substitutionRequest.update({
    where: { id: requestId },
    data: {
      waStatus:      status,
      candidateName: teacherName ?? sub.candidateName,
    },
  });

  // Pusher 廣播：前端顯示「✓ 陳老師已確認」
  if (pusher) {
    const name = teacherName ?? updated.candidateName ?? "老師";
    try {
      await pusher.trigger("substitutions", "wa-reply", {
        requestId,
        status,
        teacherName: name,
        message: status === "CONFIRMED" ? `✓ ${name}已確認代課` : `✗ ${name}婉拒咗代課，請另覓人選`,
      });
    } catch {}
  }

  // Create Google Calendar event when teacher confirms
  if (status === "CONFIRMED" && isCalendarConfigured() && !sub.calendarEventId) {
    try {
      const dateStr = sub.date.toISOString().slice(0, 10);
      const eventId = await createSubstitutionEvent({
        date:          dateStr,
        periods:       sub.periods,
        classCode:     sub.classCode,
        subject:       sub.subject,
        requesterName: sub.requesterName,
        reason:        sub.reason,
        candidateName: teacherName ?? sub.candidateName ?? "代課老師",
        candidateEmail: sub.candidateEmail,
      });
      if (eventId) {
        await prisma.substitutionRequest.update({
          where: { id: requestId },
          data:  { calendarEventId: eventId },
        });
      }
    } catch (err) {
      console.error("[gcal create event]", err);
    }
  }

  return NextResponse.json({ ok: true, requestId, status });
}

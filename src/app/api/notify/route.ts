import { denyUnsupportedTask } from "@/lib/task-policy/deny-route";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWhatsApp, isNotifyConfigured } from "@/lib/notify";

// POST /api/notify
// body: { documentId?, title, content?, recipients: string[], substitution?: {...} }
export async function POST(req: NextRequest) {
  const blocked = await denyUnsupportedTask("notify:POST"); if (blocked) return blocked;
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "未登入" }, { status: 401 });

  if (!isNotifyConfigured()) {
    return NextResponse.json(
      { error: "WhatsApp 推送未設定（缺少 N8N_WEBHOOK_URL），請聯絡 IT 主任。" },
      { status: 503 },
    );
  }

  const body = await req.json();
  const recipients: string[] = Array.isArray(body.recipients)
    ? body.recipients.map(String).map((r: string) => r.trim()).filter(Boolean)
    : [];
  if (recipients.length === 0) {
    return NextResponse.json({ error: "請提供至少一位收件人" }, { status: 400 });
  }

  // 內容：直接提供 content，或經 documentId 從資料庫讀取
  let title:   string = body.title ?? "";
  let content: string = body.content ?? "";
  if (body.documentId && !content) {
    const doc = await prisma.document.findUnique({ where: { id: String(body.documentId) } });
    if (!doc) return NextResponse.json({ error: "找不到文件" }, { status: 404 });
    if (doc.userId !== session.user.id) return NextResponse.json({ error: "無權存取此文件" }, { status: 403 });
    title   = title || doc.title;
    content = doc.content;
  }
  if (!content) return NextResponse.json({ error: "缺少推送內容" }, { status: 400 });

  // 代課流程：建立 SubstitutionRequest 記錄（waStatus=SENT）
  let requestId: string | undefined;
  if (body.substitution) {
    const s = body.substitution;
    const sub = await prisma.substitutionRequest.create({
      data: {
        requesterName: String(s.requesterName ?? session.user.name ?? ""),
        date:          new Date(s.date ?? Date.now()),
        periods:       Array.isArray(s.periods) ? s.periods.map(Number) : [],
        classCode:     String(s.classCode ?? ""),
        subject:       String(s.subject ?? ""),
        reason:        String(s.reason ?? ""),
        candidateName: s.candidateName ? String(s.candidateName) : null,
        waStatus:      "SENT",
      },
    });
    requestId = sub.id;
  }

  const result = await sendWhatsApp({ title, content, recipients, requestId });

  if (!result.ok) {
    // 推送失敗 → 回滾代課記錄狀態
    if (requestId) {
      await prisma.substitutionRequest.update({
        where: { id: requestId },
        data:  { waStatus: "NOT_SENT" },
      }).catch(() => {});
    }
    return NextResponse.json({ error: `推送失敗：${result.error}` }, { status: 502 });
  }

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "PUSH_WA", engine: "n8n", docType: body.documentId ? "document" : "text" },
  }).catch(() => {});

  return NextResponse.json({ ok: true, requestId, recipients: recipients.length });
}

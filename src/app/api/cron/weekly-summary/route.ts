import { denyUnsupportedTask } from "@/lib/task-policy/deny-route";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isNotifyConfigured, sendWhatsApp } from "@/lib/notify";

// GET /api/cron/weekly-summary
// Called by external cron (Zeabur / GitHub Actions / cron-job.org)
// Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const blocked = await denyUnsupportedTask("cron/weekly-summary:GET"); if (blocked) return blocked;
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET 未設定" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "驗證失敗" }, { status: 401 });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalTasks, doneTasks, docsByType, pendingApprovals, substitutions] = await Promise.all([
    prisma.task.count({ where: { createdAt: { gte: since } } }),
    prisma.task.count({ where: { createdAt: { gte: since }, status: "DONE" } }),
    prisma.document.groupBy({
      by: ["docType"],
      _count: { _all: true },
      where: { createdAt: { gte: since } },
      orderBy: { _count: { docType: "desc" } },
    }),
    prisma.document.count({ where: { approvalStatus: "PENDING" } }),
    prisma.substitutionRequest.count({ where: { createdAt: { gte: since } } }),
  ]);

  const docsLine = docsByType
    .map((d) => `${d.docType}×${d._count._all}`)
    .join("、") || "（無）";

  const summary = [
    `📊 基智 Agent OS 週報（過去 7 日）`,
    `────────────────`,
    `任務：${totalTasks} 個（完成 ${doneTasks} 個）`,
    `文件：${docsLine}`,
    `代課安排：${substitutions} 次`,
    `待批核：${pendingApprovals} 份`,
    `────────────────`,
    `如有疑問請登入工作台查閱。`,
  ].join("\n");

  // Push to recipients via n8n WhatsApp
  const recipients = (process.env.WEEKLY_SUMMARY_RECIPIENTS ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  let notified = false;
  if (recipients.length > 0 && isNotifyConfigured()) {
    try {
      await sendWhatsApp({ recipients, content: summary, title: "週報" });
      notified = true;
    } catch (err) {
      console.error("[cron weekly-summary notify]", err);
    }
  }

  return NextResponse.json({
    ok: true,
    period: { from: since.toISOString(), to: new Date().toISOString() },
    stats: { totalTasks, doneTasks, pendingApprovals, substitutions, docsBreakdown: docsByType },
    notified,
    recipients: recipients.length,
  });
}

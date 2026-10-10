import { assertCapability, type ExecutionPolicy } from "./task-policy/policy";
import { beginAttempt, finishAttempt } from "./task-audit/store";
import { randomUUID } from "node:crypto";
import type { ToolCall } from "@/lib/agents";
import { prisma } from "@/lib/prisma";
import {
  getAllTeachers,
  getCommonFreeSlots,
  getFreeTeachers,
  getLatestTerm,
  matchTeacher,
  formatSlotsTable,
  WEEKDAY_NAMES,
  MAX_DAY,
  MAX_PERIOD,
} from "@/lib/timetable";

export interface ToolContext {
  userId: string;
  policy?: ExecutionPolicy;
  parentId?: string;
}

// 執行 Agent 工具調用，回傳廣東話描述俾 Agent 引用
// 錯誤（搵唔到老師、未上載時間表）都以文字回傳，由 Agent 向用戶解釋
export async function runAgentTool(call: ToolCall, ctx: ToolContext): Promise<string> {
  if (!ctx.policy) throw new Error("POLICY_DENIED");
  const attempt = await beginAttempt(prisma, {actorId:ctx.userId,policy:ctx.policy,parentId:ctx.parentId,invocationKey:randomUUID(),executor:"tool",input:Buffer.from(JSON.stringify(call))});
  try { assertCapability(ctx.policy, "sourceRead"); }
  catch { await finishAttempt(prisma, attempt.id, "DENIED", "POLICY_DENIED"); throw new Error("POLICY_DENIED"); }

  try {
    switch (call.tool) {
      case "timetable_query":  return await runTimetableQuery(call.params);
      case "free_teachers":    return await runFreeTeachers(call.params);
      case "document_search":  return await runDocumentSearch(call.params, ctx.userId);
      default:
        return `工具「${call.tool}」不存在。可用工具：timetable_query（夾空堂）、free_teachers（找空堂老師）、document_search（搜尋過往文件）。`;
    }
  } catch (err) {
    console.error("[agent-tools]", call.tool, err);
    return "工具執行失敗（系統錯誤），請向用戶道歉並建議稍後再試。";
  }
}

async function runTimetableQuery(params: Record<string, unknown>): Promise<string> {
  const queries = Array.isArray(params.teachers)
    ? (params.teachers as unknown[]).map(String).filter(Boolean)
    : [];
  if (queries.length === 0) {
    return "缺少 teachers 參數。請先問清楚用戶要夾邊幾位老師，再重新調用。";
  }

  const term = typeof params.term === "string" && params.term ? params.term : await getLatestTerm();
  if (!term) return "系統尚未上載任何時間表，請建議用戶聯絡管理員到「設定 → 時間表上載」上載 CSV。";

  const allTeachers = await getAllTeachers(term);
  const matches = queries.map((q) => matchTeacher(q, allTeachers));

  const problems: string[] = [];
  for (const m of matches) {
    if (m.notFound) problems.push(`「${m.query}」喺時間表搵唔到`);
    if (m.candidates) problems.push(`「${m.query}」有多個匹配：${m.candidates.join("、")}，請問用戶係邊位`);
  }
  if (problems.length > 0) {
    return `老師名單有問題，請向用戶確認：\n- ${problems.join("\n- ")}\n\n時間表現有老師：${allTeachers.join("、")}`;
  }

  const resolved = matches.map((m) => m.matched!);
  const slots = await getCommonFreeSlots(resolved, term);

  if (slots.length === 0) {
    return `查詢結果（學期 ${term}）：${resolved.join("、")} 並無共同空堂。`;
  }

  const list = slots
    .map((s) => `星期${WEEKDAY_NAMES[s.day]}第${s.period}節`)
    .join("、");

  return [
    `查詢結果（學期 ${term}）：${resolved.join("、")} 共 ${slots.length} 個共同空堂。`,
    "",
    formatSlotsTable(slots),
    "",
    `時段列表：${list}`,
    "",
    "請以上面嘅 Markdown 表格（星期 × 節次 grid）展示俾用戶，並列出建議時段。",
  ].join("\n");
}

async function runFreeTeachers(params: Record<string, unknown>): Promise<string> {
  const day    = Number(params.day);
  const period = Number(params.period);

  if (!Number.isInteger(day) || day < 1 || day > MAX_DAY || !Number.isInteger(period) || period < 1 || period > MAX_PERIOD) {
    return `參數錯誤：day 必須為 1-${MAX_DAY}，period 必須為 1-${MAX_PERIOD}。請先問清楚用戶想查邊日邊節。`;
  }

  const term = typeof params.term === "string" && params.term ? params.term : await getLatestTerm();
  if (!term) return "系統尚未上載任何時間表，請建議用戶聯絡管理員到「設定 → 時間表上載」上載 CSV。";

  const teachers = await getFreeTeachers(day, period, term);
  if (teachers.length === 0) {
    return `查詢結果（學期 ${term}）：星期${WEEKDAY_NAMES[day]}第${period}節並無老師有空。`;
  }
  return `查詢結果（學期 ${term}）：星期${WEEKDAY_NAMES[day]}第${period}節有空嘅老師（${teachers.length} 位）：${teachers.join("、")}。如用戶係安排代課，可以將呢個名單列為候選代課老師。`;
}

// 涉及學生個人數據嘅文件類型（DOCTYPE 中文標示）—唔可以喺 scope=all 下不分老師咁被搜到
const SENSITIVE_DOC_TYPES = ["成績報告"];

async function runDocumentSearch(params: Record<string, unknown>, userId: string): Promise<string> {
  const query = typeof params.query === "string" ? params.query.trim() : "";
  if (!query) {
    return "缺少 query 參數。請先問清楚用戶想搜尋咩關鍵字，再重新調用。";
  }

  const docType   = typeof params.docType === "string" && params.docType ? params.docType : undefined;
  const wantsAll  = params.scope === "all";
  const sensitive = docType ? SENSITIVE_DOC_TYPES.includes(docType) : false;
  // 指名搜敏感類型 → 強制只限自己；冇指名類型嘅全校搜尋 → 直接排除敏感類型，防止漏出其他老師嘅學生成績
  const scopeAll = wantsAll && !sensitive;

  const docs = await prisma.document.findMany({
    where: {
      ...(scopeAll ? {} : { userId }),
      ...(docType
        ? { docType }
        : scopeAll ? { docType: { notIn: SENSITIVE_DOC_TYPES } } : {}),
      OR: [
        { title:   { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take:    5,
    select:  { id: true, title: true, docType: true, content: true, createdAt: true, user: { select: { name: true } } },
  });

  if (docs.length === 0) {
    return `搜尋「${query}」冇搵到過往文件，請直接根據用戶需求由頭撰寫，唔使提及搵唔到。`;
  }

  const items = docs.slice(0, 3).map((d, i) => {
    const snippet = d.content.replace(/\s+/g, " ").slice(0, 300);
    const dateStr = d.createdAt.toLocaleDateString("zh-HK");
    const author  = scopeAll ? ` · ${d.user.name}` : "";
    return `${i + 1}.【${d.title}】（${d.docType} · ${dateStr}${author}）\n${snippet}${snippet.length >= 300 ? "…" : ""}`;
  });

  return [
    `搜尋「${query}」結果（共 ${docs.length} 份，顯示首 ${items.length} 份）：`,
    "",
    items.join("\n\n"),
    "",
    "可參考以上文件嘅格式、用詞或結構，但內容須按用戶今次嘅實際需求重新撰寫，唔好直接複製舊資料。",
  ].join("\n");
}

import { prisma } from "@/lib/prisma";
import { MAX_PERIOD } from "@/lib/schedule";

export { MAX_PERIOD };
export const MAX_DAY = 5;
export const WEEKDAY_NAMES = ["", "一", "二", "三", "四", "五"];

export interface TimetableRow {
  teacherName: string;
  dayOfWeek:   number;
  period:      number;
  classCode:   string | null;
  subject:     string | null;
}

export interface ParseResult {
  rows:   TimetableRow[];
  errors: { line: number; reason: string }[];
}

// CSV 格式：老師,星期,節次,班別,科目（班別/科目可空 = 空堂唔需要記錄）
export function parseTimetableCsv(text: string): ParseResult {
  const rows:   TimetableRow[] = [];
  const errors: ParseResult["errors"] = [];

  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // 跳過表頭
    if (i === 0 && /老師|teacher/i.test(trimmed)) return;

    const cols = trimmed.split(",").map((c) => c.trim());
    if (cols.length < 3) {
      errors.push({ line: i + 1, reason: "欄位不足（最少需要：老師,星期,節次）" });
      return;
    }
    const [teacherName, dayStr, periodStr, classCode = "", subject = ""] = cols;
    const dayOfWeek = parseInt(dayStr, 10);
    const period    = parseInt(periodStr, 10);

    if (!teacherName) {
      errors.push({ line: i + 1, reason: "老師名稱為空" });
      return;
    }
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > MAX_DAY) {
      errors.push({ line: i + 1, reason: `星期必須為 1-${MAX_DAY}（收到「${dayStr}」）` });
      return;
    }
    if (!Number.isInteger(period) || period < 1 || period > MAX_PERIOD) {
      errors.push({ line: i + 1, reason: `節次必須為 1-${MAX_PERIOD}（收到「${periodStr}」）` });
      return;
    }

    rows.push({
      teacherName,
      dayOfWeek,
      period,
      classCode: classCode || null,
      subject:   subject || null,
    });
  });

  return { rows, errors };
}

// 模糊匹配老師名稱：「陳sir」→「陳大文」
// 回傳 { matched } 或 { candidates }（多個匹配）或 { notFound: true }
export interface TeacherMatch {
  query:       string;
  matched?:    string;
  candidates?: string[];
  notFound?:   boolean;
}

export function matchTeacher(query: string, allTeachers: string[]): TeacherMatch {
  const q = query
    .replace(/sir|miss|老師|先生|小姐|阿/gi, "")
    .trim();

  // 完全一致優先
  const exact = allTeachers.find((t) => t === query || t === q);
  if (exact) return { query, matched: exact };

  if (!q) return { query, notFound: true };

  const partial = allTeachers.filter((t) => t.includes(q) || q.includes(t));
  if (partial.length === 1) return { query, matched: partial[0] };
  if (partial.length > 1)  return { query, candidates: partial };
  return { query, notFound: true };
}

export async function getAllTeachers(term: string): Promise<string[]> {
  const rows = await prisma.timetable.findMany({
    where:    { term },
    select:   { teacherName: true },
    distinct: ["teacherName"],
  });
  return rows.map((r) => r.teacherName);
}

// 最新學期（無指定 term 時用）
export async function getLatestTerm(): Promise<string | null> {
  const row = await prisma.timetable.findFirst({
    orderBy: { term: "desc" },
    select:  { term: true },
  });
  return row?.term ?? null;
}

export interface FreeSlot {
  day:    number;
  period: number;
}

// 多人共同空堂：所有人喺該 (day, period) 都冇課堂記錄
export async function getCommonFreeSlots(teachers: string[], term: string): Promise<FreeSlot[]> {
  const lessons = await prisma.timetable.findMany({
    where:  { term, teacherName: { in: teachers } },
    select: { teacherName: true, dayOfWeek: true, period: true },
  });

  const busy = new Set(lessons.map((l) => `${l.dayOfWeek}-${l.period}`));

  const slots: FreeSlot[] = [];
  for (let day = 1; day <= MAX_DAY; day++) {
    for (let period = 1; period <= MAX_PERIOD; period++) {
      if (!busy.has(`${day}-${period}`)) slots.push({ day, period });
    }
  }
  return slots;
}

// 指定時段邊個老師有空
export async function getFreeTeachers(day: number, period: number, term: string): Promise<string[]> {
  const all = await getAllTeachers(term);
  const busyRows = await prisma.timetable.findMany({
    where:  { term, dayOfWeek: day, period },
    select: { teacherName: true },
  });
  const busy = new Set(busyRows.map((r) => r.teacherName));
  return all.filter((t) => !busy.has(t));
}

// 空堂結果轉做 Markdown 表格（星期 × 節次 grid），俾 Agent 直接引用
export function formatSlotsTable(slots: FreeSlot[]): string {
  if (slots.length === 0) return "（無共同空堂）";
  const bySet = new Set(slots.map((s) => `${s.day}-${s.period}`));
  const header = "| 節次 | " + Array.from({ length: MAX_DAY }, (_, d) => `星期${WEEKDAY_NAMES[d + 1]}`).join(" | ") + " |";
  const divider = "|" + "---|".repeat(MAX_DAY + 1);
  const rows = Array.from({ length: MAX_PERIOD }, (_, p) => {
    const cells = Array.from({ length: MAX_DAY }, (_, d) =>
      bySet.has(`${d + 1}-${p + 1}`) ? "✓" : ""
    );
    return `| 第${p + 1}節 | ${cells.join(" | ")} |`;
  });
  return [header, divider, ...rows].join("\n");
}

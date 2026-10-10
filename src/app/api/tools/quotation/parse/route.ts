import { denyUnsupportedTask } from "@/lib/task-policy/deny-route";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth = require("mammoth") as typeof import("mammoth");



const SCHEMA_HINT = `JSON 格式（只回傳有效 JSON，無任何 Markdown 或解釋文字）：
{
  "quoteDate":     "YYYY-MM-DD",
  "quoteMethod":   "phone|fax|mail|other（預設 phone）",
  "higherReason":  "",
  "fewerReason":   "",
  "batchName":     "採購名稱",
  "items":         [{"name":"物品名稱","qty":"數量字串"}],
  "suppliers":     [{"name":"公司","phone":"電話","prices":["各物品單價字串"],"recommended":false}],
  "category":      "fixed|consumable|other（預設 consumable）",
  "dept":          "部門/科組",
  "purpose":       "用途/安放地點",
  "deliveryDate":  "YYYY-MM-DD",
  "funding":       "資金來源",
  "requesterName": "", "requesterRank": "", "requesterDate": "YYYY-MM-DD",
  "deptHeadName":  "", "deptHeadRank":  "", "deptHeadDate":  "YYYY-MM-DD"
}
規則：
- suppliers 按文中出現次序（供應商 A 先），prices 對應 items 次序
- recommended 設為較低報價者或文中標明「建議採用」者
- 日期統一為 YYYY-MM-DD；無日期則用今日 ${new Date().toISOString().split("T")[0]}
- 搵唔到的欄位用空字串或今日日期`;

const SYSTEM_PROMPT = `你是採購表格數據提取助手。從提供的採購表格（文字或圖像）中提取結構化數據。\n\n${SCHEMA_HINT}`;

// Supported MIME types for direct Claude vision / document reading
const IMAGE_TYPES: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  "image/jpeg": "image/jpeg",
  "image/jpg":  "image/jpeg",
  "image/png":  "image/png",
  "image/gif":  "image/gif",
  "image/webp": "image/webp",
};
function isImageType(mime: string) { return mime.toLowerCase() in IMAGE_TYPES; }
function isPdf(mime: string, name: string) { return mime === "application/pdf" || name.endsWith(".pdf"); }
function isDocx(mime: string, name: string) {
  return mime.includes("wordprocessingml") || mime.includes("openxmlformats") || name.endsWith(".docx");
}

const MAX_FILE_MB = 20;

export async function POST(req: NextRequest) {
  const blocked = await denyUnsupportedTask("tools/quotation/parse:POST"); if (blocked) return blocked;
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "未登入" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "伺服器未設定 ANTHROPIC_API_KEY" }, { status: 503 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "請上載文件" }, { status: 400 });
  }

  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return NextResponse.json({ error: `檔案過大（上限 ${MAX_FILE_MB}MB）` }, { status: 413 });
  }

  const mime = file.type || "";
  const name = file.name.toLowerCase();
  let messageContent: Anthropic.MessageParam["content"];

  if (isDocx(mime, name)) {
    // DOCX → mammoth text → Claude text message
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer: buf });
    const text = result.value.trim();
    if (!text) {
      return NextResponse.json({ error: "DOCX 無法提取文字（可能係掃描版），請嘗試上載圖片或 PDF 版本" }, { status: 422 });
    }
    messageContent = `從以下採購表格文本提取數據：\n\n${text.slice(0, 10000)}`;

  } else if (isPdf(mime, name)) {
    // PDF → Claude native document block
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    messageContent = [
      {
        type:   "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data: b64 },
      },
      { type: "text" as const, text: "從以上採購表格 PDF 提取結構化數據。" },
    ];

  } else if (isImageType(mime)) {
    // Image → Claude vision
    const actualMime = IMAGE_TYPES[mime.toLowerCase()] ?? "image/jpeg";
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    messageContent = [
      {
        type:   "image" as const,
        source: { type: "base64" as const, media_type: actualMime, data: b64 },
      },
      { type: "text" as const, text: "從以上採購表格圖像提取結構化數據。" },
    ];

  } else {
    return NextResponse.json(
      { error: `不支援的格式：${mime || name}。支援格式：DOCX、PDF、JPG/PNG/WEBP（相片或掃描件）` },
      { status: 400 },
    );
  }

  const message = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: "user", content: messageContent }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const data = JSON.parse(jsonStr);
    if (!Array.isArray(data.items))     data.items     = [];
    if (!Array.isArray(data.suppliers)) data.suppliers = [];
    // Ensure every supplier has a prices array the same length as items
    data.suppliers = data.suppliers.map((s: { name: string; phone: string; prices: string[]; recommended: boolean }) => ({
      ...s,
      prices: Array.from({ length: data.items.length }, (_, i) => s.prices?.[i] ?? ""),
    }));
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json(
      { error: "AI 解析格式有誤，請手動填寫欄位。", raw: raw.slice(0, 500) },
      { status: 422 },
    );
  }
}

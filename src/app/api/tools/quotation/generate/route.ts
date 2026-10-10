import { denyUnsupportedTask } from "@/lib/task-policy/deny-route";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateQuotationDocx } from "@/lib/tools/quotation-docx";

export async function POST(req: NextRequest) {
  const blocked = await denyUnsupportedTask("tools/quotation/generate:POST"); if (blocked) return blocked;
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const data = await req.json();
  try {
    const buffer = await generateQuotationDocx(data);
    const safe   = (data.batchName as string).replace(/[^\w一-鿿\s-]/g, "").trim();
    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safe)}_報價表.docx`,
      },
    });
  } catch (err) {
    console.error("[quotation/generate]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

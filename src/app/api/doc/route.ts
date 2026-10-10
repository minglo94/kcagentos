import { denyUnsupportedTask } from "@/lib/task-policy/deny-route";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateWord } from "@/lib/docgen/word";
import { generatePDF } from "@/lib/docgen/pdf";
import { isDriveConfigured, ensurePath, uploadFile } from "@/lib/gdrive";

async function uploadToDrive(
  docId: string, docType: string, title: string,
  buffer: Buffer, filename: string, mimeType: string,
) {
  if (!isDriveConfigured()) return;
  try {
    const folderId = await ensurePath(docType, new Date());
    const result   = await uploadFile(buffer, filename, mimeType, folderId);
    // Only store the first upload URL (DOCX takes priority)
    const existing = await prisma.document.findUnique({ where: { id: docId }, select: { driveUrl: true } });
    if (!existing?.driveUrl) {
      await prisma.document.update({
        where: { id: docId },
        data:  { driveUrl: result.webViewLink, driveFileId: result.fileId },
      });
    }
  } catch (err) {
    console.error("[gdrive upload]", err);
  }
}

export async function POST(req: NextRequest) {
  const blocked = await denyUnsupportedTask("doc:POST"); if (blocked) return blocked;
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const { documentId, format } = (await req.json()) as {
    documentId: string;
    format: "docx" | "pdf";
  };

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  if (doc.userId !== session.user.id) return NextResponse.json({ error: "無權限" }, { status: 403 });

  // Approval gate: PENDING documents cannot be downloaded
  if (doc.approvalStatus === "PENDING") {
    return NextResponse.json({ error: "文件待批核中，批核後方可下載" }, { status: 403 });
  }
  if (doc.approvalStatus === "REJECTED") {
    return NextResponse.json({ error: `文件已被退回：${doc.rejectionReason ?? ""}` }, { status: 403 });
  }

  await prisma.auditLog.create({
    data: { userId: session.user.id, action: "DOWNLOAD", docType: doc.docType, engine: "n/a" },
  }).catch(() => {});

  const safeTitle = doc.title.replace(/[^\w一-鿿\s-]/g, "").slice(0, 50);

  if (format === "docx") {
    const buffer   = await generateWord(doc.title, doc.docType, doc.content);
    const filename = `${safeTitle}.docx`;
    const mime     = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    // Background Drive upload (don't await — don't block download)
    uploadToDrive(doc.id, doc.docType, doc.title, buffer, filename, mime);
    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":        mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}.docx`,
      },
    });
  }

  if (format === "pdf") {
    const buffer = await generatePDF(doc.title, doc.docType, doc.content);
    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}.pdf`,
      },
    });
  }

  return NextResponse.json({ error: "不支援的格式" }, { status: 400 });
}

// GET /api/doc?id=xxx — return driveUrl for DocCard link
export async function GET(req: NextRequest) {
  const blocked = await denyUnsupportedTask("doc:GET"); if (blocked) return blocked;
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const doc = await prisma.document.findUnique({ where: { id }, select: { userId: true, driveUrl: true, approvalStatus: true, rejectionReason: true } });
  if (!doc || doc.userId !== session.user.id) return NextResponse.json({ error: "找不到" }, { status: 404 });
  return NextResponse.json({ driveUrl: doc.driveUrl, approvalStatus: doc.approvalStatus, rejectionReason: doc.rejectionReason });
}

import { denyUnsupportedTask } from "@/lib/task-policy/deny-route";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateNoticeDocx, generateTutorSignIn } from "@/lib/tools/notice-docx";
import { generateAttendanceXlsx, generateFad8Xlsx } from "@/lib/tools/notice-xlsx";
import { createZipArchive } from "@/lib/tools/archive";

export async function POST(req: NextRequest) {
  const blocked = await denyUnsupportedTask("tools/notice/generate:POST"); if (blocked) return blocked;
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const data = await req.json();

  try {
    const noticeBuf    = await generateNoticeDocx(data);
    const attendBuf    = await generateAttendanceXlsx(data);
    const fad8Buf      = await generateFad8Xlsx(data);
    const tutorBuf     = data.tutorType === "external" ? await generateTutorSignIn(data) : null;

    // 打包成 ZIP
    const zipBuf = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = createZipArchive({ zlib: { level: 6 } });
      archive.on("data", (c: Buffer) => chunks.push(c));
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", reject);

      const safe = data.activityName.replace(/[^\w一-鿿\s-]/g, "").trim();
      archive.append(noticeBuf, { name: `${safe}_通告.docx` });
      archive.append(attendBuf, { name: `${safe}_出席紀錄.xlsx` });
      archive.append(fad8Buf,   { name: `${safe}_FAD8.xlsx` });
      if (tutorBuf) archive.append(tutorBuf, { name: `${safe}_導師簽到.docx` });
      archive.finalize();
    });

    return new Response(zipBuf as unknown as BodyInit, {
      headers: {
        "Content-Type":        "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(data.activityName)}_文件.zip`,
      },
    });
  } catch (err) {
    console.error("[notice/generate]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/setup?token=<SETUP_TOKEN>&email=cmlo@gs.keichi.edu.hk
// GET /api/setup?token=<SETUP_TOKEN>&activateAll=true   ← reactivate all users
// Usable directly in a browser. Remove SETUP_TOKEN env var after first use.
export async function GET(req: NextRequest) {
  const setupToken = process.env.SETUP_TOKEN;
  if (!setupToken) {
    return NextResponse.json({ error: "Bootstrap disabled (SETUP_TOKEN not set)" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token") ?? "";

  if (token !== setupToken) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // ── Activate all users ──────────────────────────────────────────
  if (searchParams.get("activateAll") === "true") {
    const { count } = await prisma.user.updateMany({
      where: { isActive: false },
      data:  { isActive: true, authRevision: { increment: 1 } },
    });
    return new NextResponse(
      `<!DOCTYPE html><html lang="zh-HK"><head><meta charset="utf-8">
      <title>Activate All OK</title>
      <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f0e8}
      .card{background:#fff;border:1px solid #ddd;border-left:4px solid #2E7D32;border-radius:6px;padding:32px 40px;max-width:440px;box-shadow:2px 2px 0 #e8e0d0}
      h1{margin:0 0 12px;font-size:20px;color:#1a2940}p{margin:4px 0;font-size:14px;color:#555}
      code{background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:12px}
      a{color:#1a2940;font-size:13px}</style></head>
      <body><div class="card">
      <h1>✓ 所有用戶已重新啟用</h1>
      <p>已啟用 <code>${count}</code> 個停用用戶。</p>
      <p style="margin-top:16px"><a href="/login">→ 前往登入</a></p>
      </div></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  // ── Bootstrap / reactivate a specific admin ─────────────────────
  const email = searchParams.get("email") ?? process.env.ADMIN_EMAIL ?? "";
  if (!email) {
    return NextResponse.json(
      { error: "Provide ?email=user@gs.keichi.edu.hk or ?activateAll=true" },
      { status: 400 },
    );
  }

  const user = await prisma.user.upsert({
    where:  { email },
    update: { role: "ADMIN", isActive: true, authRevision: { increment: 1 } },
    create: { email, name: email.split("@")[0], role: "ADMIN", googleEnabled: true },
  });

  return new NextResponse(
    `<!DOCTYPE html><html lang="zh-HK"><head><meta charset="utf-8">
    <title>Bootstrap OK</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f0e8}
    .card{background:#fff;border:1px solid #ddd;border-left:4px solid #2E7D32;border-radius:6px;padding:32px 40px;max-width:440px;box-shadow:2px 2px 0 #e8e0d0}
    h1{margin:0 0 12px;font-size:20px;color:#1a2940}p{margin:4px 0;font-size:14px;color:#555}
    code{background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:12px}
    a{color:#1a2940;font-size:13px}</style></head>
    <body><div class="card">
    <h1>✓ Admin 設定成功</h1>
    <p><strong>Email:</strong> <code>${user.email}</code></p>
    <p><strong>Role:</strong> <code>${user.role}</code></p>
    <p><strong>Active:</strong> <code>${user.isActive}</code></p>
    <p style="margin-top:16px;color:#888;font-size:12px">請立即在 Zeabur 刪除 <code>SETUP_TOKEN</code> 環境變數，防止重複使用。</p>
    <p style="margin-top:16px"><a href="/login">→ 前往登入</a></p>
    </div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

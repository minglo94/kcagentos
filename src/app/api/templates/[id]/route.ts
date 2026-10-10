import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const template = await prisma.template.findUnique({ where: { id: params.id } });
  if (!template) return NextResponse.json({ error: "找不到範本" }, { status: 404 });
  return NextResponse.json(template);
}

export async function PATCH(req: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const body = await req.json();

  // 設為 default 時，清除同 docType 的其他 default
  if (body.isDefault) {
    const existing = await prisma.template.findUnique({ where: { id: params.id }, select: { docType: true } });
    if (existing) {
      await prisma.template.updateMany({
        where: { docType: existing.docType, isDefault: true, NOT: { id: params.id } },
        data:  { isDefault: false },
      });
    }
  }

  const template = await prisma.template.update({ where: { id: params.id }, data: body });
  return NextResponse.json(template);
}

export async function DELETE(_req: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "未登入" }, { status: 401 });

  await prisma.template.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

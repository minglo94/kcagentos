import { denyUnsupportedTask } from "@/lib/task-policy/deny-route";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/todos/[id] — body: { done?, text? }
// updateMany + { id, userId } 確保只可以改自己嘅待辦
export async function PATCH(req: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const blocked = await denyUnsupportedTask("todos/[id]:PATCH"); if (blocked) return blocked;
  const params = await routeParams;
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: { done?: boolean; text?: string } = {};
  if (typeof body.done === "boolean") data.done = body.done;
  if (typeof body.text === "string" && body.text.trim()) data.text = body.text.trim().slice(0, 200);
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "缺少 done 或 text" }, { status: 400 });
  }

  const { count } = await prisma.todo.updateMany({
    where: { id: params.id, userId: session.user.id },
    data,
  });
  if (count === 0) return NextResponse.json({ error: "找不到待辦" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/todos/[id]
export async function DELETE(_req: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const blocked = await denyUnsupportedTask("todos/[id]:DELETE"); if (blocked) return blocked;
  const params = await routeParams;
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const { count } = await prisma.todo.deleteMany({
    where: { id: params.id, userId: session.user.id },
  });
  if (count === 0) return NextResponse.json({ error: "找不到待辦" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

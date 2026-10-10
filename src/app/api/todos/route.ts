import { denyUnsupportedTask } from "@/lib/task-policy/deny-route";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/todos — 自己嘅待辦清單
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const todos = await prisma.todo.findMany({
    where:   { userId: session.user.id },
    orderBy: [{ done: "asc" }, { createdAt: "desc" }],
    take:    50,
  });
  return NextResponse.json(todos);
}

// POST /api/todos — body: { text }
export async function POST(req: NextRequest) {
  const blocked = await denyUnsupportedTask("todos:POST"); if (blocked) return blocked;
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "待辦內容不能為空" }, { status: 400 });
  if (text.length > 200) return NextResponse.json({ error: "待辦內容太長（上限 200 字）" }, { status: 400 });

  const todo = await prisma.todo.create({
    data: { userId: session.user.id, text },
  });
  return NextResponse.json(todo, { status: 201 });
}

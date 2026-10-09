import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireRole("ADMIN");
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, email: true, name: true, role: true,
      department: true, isActive: true, lastLoginAt: true, createdAt: true,
    },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAccountAdmin(req);
    const input = localInput.parse(await accountBody(req));
    const user = await createLocalUser(prisma, userId, input);
    return NextResponse.json(user, { status: 201 });
  } catch (error) { return accountFailure(error); }
}

import { requireAccountAdmin, accountBody, accountFailure } from "@/lib/school-auth/admin-http";
import { localInput, createLocalUser } from "@/lib/school-auth/store";

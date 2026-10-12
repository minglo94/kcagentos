import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateSchema = z.object({
  role:       z.enum(["ADMIN", "APPROVER", "DEPT_HEAD", "TEACHER", "OFFICE"]).optional(),
  department: z.string().optional(),
  isActive:   z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let adminUser: { userId: string };
  try {
    adminUser = await requireRole("ADMIN");
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "輸入格式錯誤" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data:  parsed.data,
  });

  // AuditLog for role change
  if (parsed.data.role) {
    await prisma.auditLog.create({
      data: {
        userId:  adminUser.userId,
        action:  "ROLE_CHANGE",
        engine:  "n/a",
        docType: `target:${id} role:${parsed.data.role}`,
      },
    });
  }

  return NextResponse.json(updated);
}

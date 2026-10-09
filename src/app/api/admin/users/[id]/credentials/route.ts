import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountAdmin, accountBody, accountFailure } from "@/lib/school-auth/admin-http";
import { credentialInput, setLocalCredential, clearAttempts } from "@/lib/school-auth/store";
import { normalizeUsername } from "@/lib/school-auth/password";
import { z } from "zod";
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireAccountAdmin(req), input = credentialInput.parse(await accountBody(req));
    await setLocalCredential(prisma, userId, params.id, input.username, input.password);
    return NextResponse.json({ ok: true });
  } catch (error) { return accountFailure(error); }
}
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAccountAdmin(req);
    const input = z.object({ provider: z.enum(["local", "school-ad"]), username: z.string().refine(value => !!normalizeUsername(value)) }).strict().parse(await accountBody(req));
    const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    await clearAttempts(prisma, input.provider, input.username);
    return NextResponse.json({ ok: true });
  } catch (error) { return accountFailure(error); }
}

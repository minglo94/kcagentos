import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountAdmin, accountBody, accountFailure } from "@/lib/school-auth/admin-http";
import { linkDirectoryUser, unlinkDirectoryUser } from "@/lib/school-auth/store";
import { readDirectoryConfig, lookupDirectoryIdentity } from "@/lib/school-auth/directory";
import { normalizeUsername } from "@/lib/school-auth/password";
import { z } from "zod";
export async function PUT(req: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  try {
    const { userId } = await requireAccountAdmin(req);
    const input = z.object({ username: z.string().refine(value => !!normalizeUsername(value)) }).strict().parse(await accountBody(req));
    const config = process.env.AGENTOS_AD_AUTH_ENABLED === "true" ? readDirectoryConfig(process.env) : null;
    if (!config) return NextResponse.json({ error: "DIRECTORY_NOT_CONFIGURED" }, { status: 503 });
    const identity = await lookupDirectoryIdentity(input.username, config);
    if (!identity) return NextResponse.json({ error: "DIRECTORY_IDENTITY_UNAVAILABLE" }, { status: 400 });
    await linkDirectoryUser(prisma, userId, params.id, identity);
    return NextResponse.json({ ok: true });
  } catch (error) { return accountFailure(error); }
}
export async function DELETE(req: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  try { const { userId } = await requireAccountAdmin(req); await unlinkDirectoryUser(prisma, userId, params.id); return NextResponse.json({ ok: true }); }
  catch (error) { return accountFailure(error); }
}

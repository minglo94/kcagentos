import { PrismaClient } from "@prisma/client";
import type { JWT } from "next-auth/jwt";
import { safeUser } from "./store";
import { serial } from "../office/store";
export async function resolveSessionUser(db: PrismaClient, userId: string, revision: number) {
  if (!userId || !Number.isSafeInteger(revision) || revision < 0) return null;
  return db.user.findFirst({ where: { id: userId, authRevision: revision, isActive: true }, select: safeUser });
}
export async function refreshSessionToken(db: PrismaClient, token: JWT, user?: { id: string; authRevision?: number }, now = Date.now()): Promise<JWT> {
  if (user) { token.userId = user.id; token.authRevision = user.authRevision; token.signInExpiresAt = now + 8 * 3600000; }
  if (!Number.isSafeInteger(token.signInExpiresAt) || now >= token.signInExpiresAt!) return {};
  const current = await resolveSessionUser(db, token.userId ?? "", token.authRevision as number);
  if (!current) return {};
  return { ...token, role: current.role, email: current.email, name: current.name, department: current.department };
}
export async function resolveGoogleUser(db: PrismaClient, profile: { email?: string; name?: string; email_verified?: boolean }) {
  const email = profile.email?.toLowerCase() ?? "";
  if (!profile.email_verified || !email.endsWith("@gs.keichi.edu.hk")) return null;
  return serial(db, async tx => {
    const user = await tx.user.findUnique({ where: { email } });
    if (user && (!user.isActive || !user.googleEnabled)) return null;
    return user ? tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }) : tx.user.create({ data: { email, name: profile.name ?? email.split("@")[0], googleEnabled: true, role: "TEACHER", subjects: [] } });
  });
}

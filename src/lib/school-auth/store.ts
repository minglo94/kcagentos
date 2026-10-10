import { createHash } from "node:crypto";
import { Prisma, PrismaClient, type Role } from "@prisma/client";
import { z } from "zod";
import { serial } from "../office/store";
import { dummyHash, hashPassword, normalizeUsername, validPassword, verifyPassword } from "./password";

export const safeUser = { id: true, email: true, name: true, role: true, department: true, isActive: true, authRevision: true } as const;
export const localInput = z.object({ name: z.string().trim().min(1).max(100), email: z.string().email().max(254).transform(value => value.toLowerCase()), username: z.string().refine(value => !!normalizeUsername(value)), password: z.string().refine(validPassword), role: z.enum(["ADMIN", "APPROVER", "DEPT_HEAD", "TEACHER", "OFFICE"]).default("TEACHER") }).strict();
export const credentialInput = localInput.pick({ username: true, password: true });
export const accountUpdateInput = z.object({ role: z.enum(["ADMIN", "APPROVER", "DEPT_HEAD", "TEACHER", "OFFICE"]).optional(), department: z.string().max(100).optional(), isActive: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0);
type Tx = Prisma.TransactionClient;
export async function accountAdmin(tx: Tx | PrismaClient, actorId: string) {
  const actor = await tx.user.findFirst({ where: { id: actorId, role: "ADMIN", isActive: true } });
  if (!actor) throw new Error("ADMIN_REQUIRED");
}
const attemptKey = (provider: string, username: string) => `${provider}:${createHash("sha256").update(username.toLowerCase()).digest("hex")}`;
export async function reserveAttempt(db: PrismaClient, provider: "local" | "school-ad", username: string, now = new Date()) {
  const key = attemptKey(provider, username), expired = new Date(+now - 900000);
  // Bounded indexed cleanup removes abandoned identifiers as well as reused ones.
  await db.$executeRaw`DELETE FROM "LoginAttempt" WHERE "windowStartedAt" <= ${expired} AND "key" IN
    (SELECT "key" FROM "LoginAttempt" WHERE "windowStartedAt" <= ${expired} ORDER BY "windowStartedAt" LIMIT 1000)`;
  const rows = await db.$queryRaw<Array<{ attempts: number }>>`
    INSERT INTO "LoginAttempt" ("key", "windowStartedAt", "attempts") VALUES (${key}, ${now}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "LoginAttempt"."windowStartedAt" <= ${expired} THEN 1 ELSE "LoginAttempt"."attempts" + 1 END,
      "windowStartedAt" = CASE WHEN "LoginAttempt"."windowStartedAt" <= ${expired} THEN ${now} ELSE "LoginAttempt"."windowStartedAt" END
    WHERE "LoginAttempt"."windowStartedAt" <= ${expired} OR "LoginAttempt"."attempts" < 5
    RETURNING "attempts"`;
  return rows.length === 1;
}
export async function clearAttempts(db: PrismaClient, provider: "local" | "school-ad", username: string) {
  await db.loginAttempt.deleteMany({ where: { key: attemptKey(provider, username) } });
}
let activeLocal = 0;
export async function authenticateLocal(db: PrismaClient, submitted: string, password: string) {
  if (activeLocal >= 4) return null;
  activeLocal++;
  try { return await localLogin(db, submitted, password); }
  finally { activeLocal--; }
}
async function localLogin(db: PrismaClient, submitted: string, password: string) {
  const username = normalizeUsername(submitted);
  if (!username || !validPassword(password) || !await reserveAttempt(db, "local", username)) return null;
  const credential = await db.localCredential.findUnique({ where: { username }, include: { user: true } });
  const verified = await verifyPassword(password, credential?.user.isActive ? credential.passwordHash : dummyHash);
  if (!verified || !credential?.user.isActive) return null;
  // Fence password resets or disablement that happened while the KDF ran.
  const live = await db.localCredential.findFirst({ where: { userId: credential.userId, passwordHash: credential.passwordHash, user: { isActive: true, authRevision: credential.user.authRevision } } });
  return live ? { id: credential.userId, authRevision: credential.user.authRevision } : null;
}
const audit = (tx: Tx, actorId: string, target: string, action: string) => tx.auditLog.create({ data: { userId: actorId, engine: "n/a", action, docType: `target:${target}` } });
export async function updateAccount(db: PrismaClient, actorId: string, userId: string, input: unknown) {
  const parsed = accountUpdateInput.parse(input);
  return serial(db, async tx => {
    await accountAdmin(tx, actorId);
    const user = await tx.user.update({ where: { id: userId }, data: { ...parsed, ...(parsed.isActive !== undefined ? { authRevision: { increment: 1 } } : {}) }, select: safeUser });
    await audit(tx, actorId, userId, "ACCOUNT_UPDATED");
    return user;
  });
}
export async function setLocalCredential(db: PrismaClient, actorId: string, userId: string, submitted: string, password: string) {
  const parsed = credentialInput.parse({ username: submitted, password });
  await accountAdmin(db, actorId);
  const passwordHash = await hashPassword(parsed.password), username = normalizeUsername(parsed.username)!;
  await serial(db, async tx => {
    await accountAdmin(tx, actorId);
    await tx.localCredential.upsert({ where: { userId }, create: { userId, username, passwordHash }, update: { username, passwordHash } });
    await tx.user.update({ where: { id: userId }, data: { authRevision: { increment: 1 } } });
    await audit(tx, actorId, userId, "CREDENTIAL_RESET");
  });
}
export async function createLocalUser(db: PrismaClient, actorId: string, input: { name: string; email: string; username: string; password: string; role?: Role }) {
  const parsed = localInput.parse(input);
  await accountAdmin(db, actorId);
  const passwordHash = await hashPassword(parsed.password);
  return serial(db, async tx => {
    await accountAdmin(tx, actorId);
    const user = await tx.user.create({ data: { name: parsed.name, email: parsed.email, role: parsed.role, subjects: [], localCredential: { create: { username: normalizeUsername(parsed.username)!, passwordHash } } }, select: safeUser });
    await audit(tx, actorId, user.id, "ACCOUNT_CREATED");
    return user;
  });
}
export async function bootstrapLocalAdmin(db: PrismaClient, input: { name: string; email: string; username: string; password: string }) {
  const parsed = localInput.parse({ ...input, role: "ADMIN" });
  const passwordHash = await hashPassword(parsed.password);
  return serial(db, async tx => {
    if (await tx.user.count({ where: { role: "ADMIN" } })) throw new Error("ADMIN_EXISTS");
    const user = await tx.user.create({ data: { name: parsed.name, email: parsed.email, role: "ADMIN", subjects: [], localCredential: { create: { username: normalizeUsername(parsed.username)!, passwordHash } } }, select: safeUser });
    await audit(tx, user.id, user.id, "ADMIN_BOOTSTRAP");
    return user;
  });
}
export const directoryIdentityInput = z.object({ directoryId: z.string().min(1).max(64), objectGuid: z.string().regex(/^[a-f0-9]{32}$/) }).strict();
export async function linkDirectoryUser(db: PrismaClient, actorId: string, userId: string, identity: { directoryId: string; objectGuid: string }) {
  const parsed = directoryIdentityInput.parse(identity);
  await serial(db, async tx => {
    await accountAdmin(tx, actorId);
    const existing = await tx.directoryIdentity.findUnique({ where: { directoryId_objectGuid: parsed } });
    if (existing && existing.userId !== userId) throw new Error("IDENTITY_IN_USE");
    if (existing) return;
    await tx.directoryIdentity.create({ data: { ...parsed, userId } });
    await tx.user.update({ where: { id: userId }, data: { authRevision: { increment: 1 } } });
    await audit(tx, actorId, userId, "DIRECTORY_LINKED");
  });
}
export async function unlinkDirectoryUser(db: PrismaClient, actorId: string, userId: string) {
  await serial(db, async tx => {
    await accountAdmin(tx, actorId);
    await tx.directoryIdentity.deleteMany({ where: { userId } });
    await tx.user.update({ where: { id: userId }, data: { authRevision: { increment: 1 } } });
    await audit(tx, actorId, userId, "DIRECTORY_UNLINKED");
  });
}

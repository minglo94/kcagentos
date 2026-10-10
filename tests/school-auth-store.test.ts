import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { authDb } from "./helpers/auth-db";
import { authenticateLocal, reserveAttempt, setLocalCredential, createLocalUser, bootstrapLocalAdmin, linkDirectoryUser, unlinkDirectoryUser, updateAccount } from "../src/lib/school-auth/store";
let fixture: Awaited<ReturnType<typeof authDb>>, admin: string, teacher: string;
before(async () => {
  fixture = await authDb();
  const initial = await bootstrapLocalAdmin(fixture.db, { username: "initial.admin", password: "synthetic-admin-pass", name: "Synthetic admin", email: "admin@example.test" });
  admin = initial.id;
  teacher = (await createLocalUser(fixture.db, admin, { username: "teacher.one", password: "synthetic-teacher-pass", name: "Teacher", email: "teacher@example.test", role: "TEACHER" })).id;
});
after(async () => { await fixture?.close(); });
test("persistent attempt budget allows five then blocks and expires", async () => {
  const start = new Date("2026-01-01T00:00:00Z");
  for (let i = 0; i < 5; i++) assert.equal(await reserveAttempt(fixture.db, "local", "budget.test", start), true);
  assert.equal(await reserveAttempt(fixture.db, "local", "budget.test", start), false);
  assert.equal(await reserveAttempt(fixture.db, "local", "budget.test", new Date(+start + 900000)), true);
});
test("local login cannot register users, change roles or accept disabled accounts", async () => {
  const db = fixture.db;
  const count = await db.user.count();
  assert.equal(await authenticateLocal(db, "unknown.user", "synthetic-invalid-pass"), null);
  assert.equal(await db.user.count(), count);
  assert.equal(await authenticateLocal(db, "teacher.one", "wrong-password"), null);
  assert.equal((await authenticateLocal(db, "TEACHER.ONE", "synthetic-teacher-pass"))?.id, teacher);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: teacher } })).role, "TEACHER");
  await db.user.update({ where: { id: teacher }, data: { isActive: false } });
  assert.equal(await authenticateLocal(db, "teacher.one", "synthetic-teacher-pass"), null);
  await db.user.update({ where: { id: teacher }, data: { isActive: true } });
});
test("only active admins can reset credentials and a reset revokes sessions", async () => {
  const db = fixture.db;
  await assert.rejects(() => setLocalCredential(db, teacher, admin, "initial.admin", "replacement-password"), /ADMIN_REQUIRED/);
  const revision = (await db.user.findUniqueOrThrow({ where: { id: teacher } })).authRevision;
  await setLocalCredential(db, admin, teacher, "teacher.one", "replacement-password");
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: teacher } })).authRevision, revision + 1);
  await assert.rejects(() => setLocalCredential(db, admin, teacher, "initial.admin", "replacement-password"));
  await assert.rejects(() => bootstrapLocalAdmin(db, { username: "other.admin", password: "synthetic-admin-pass", name: "Other", email: "other@example.test" }), /ADMIN_EXISTS/);
});
test("directory identity linking is explicit and cannot transfer jobs or existing identity", async () => {
  const db = fixture.db;
  const identity = { directoryId: "school", objectGuid: "01".repeat(16) };
  await linkDirectoryUser(db, admin, teacher, identity);
  await assert.rejects(() => linkDirectoryUser(db, admin, admin, identity), /IDENTITY_IN_USE/);
  const before = (await db.user.findUniqueOrThrow({ where: { id: teacher } })).authRevision;
  await unlinkDirectoryUser(db, admin, teacher);
  assert.equal(await db.directoryIdentity.count({ where: { userId: teacher } }), 0);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: teacher } })).authRevision, before + 1);
  const response = await createLocalUser(db, admin, { username: "safe.teacher", password: "synthetic-safe-pass", name: "Safe", email: "safe@example.test", role: "TEACHER" });
  assert.equal(JSON.stringify(response).includes("password"), false);
  assert.equal(JSON.stringify(await db.auditLog.findMany()).includes("synthetic-safe-pass"), false);
});
test("attempt reservations prune expired identifiers without deleting current budgets", async () => {
  const now = new Date();
  await fixture.db.loginAttempt.createMany({ data: [{ key: "old-unused-identifier", windowStartedAt: new Date(+now - 900001), attempts: 5 }, { key: "recent-identifier", windowStartedAt: now, attempts: 5 }] });
  await reserveAttempt(fixture.db, "local", "prune.trigger", now);
  assert.equal(await fixture.db.loginAttempt.count({ where: { key: "old-unused-identifier" } }), 0);
  assert.equal(await fixture.db.loginAttempt.count({ where: { key: "recent-identifier" } }), 1);
});
test("account mutation rechecks active ADMIN after request parsing and audits atomically", async () => {
  const db = fixture.db;
  await db.user.update({ where: { id: admin }, data: { role: "TEACHER" } });
  await assert.rejects(() => updateAccount(db, admin, teacher, { role: "ADMIN" }), /ADMIN_REQUIRED/);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: teacher } })).role, "TEACHER");
  await db.user.update({ where: { id: admin }, data: { role: "ADMIN" } });
  const before = (await db.user.findUniqueOrThrow({ where: { id: teacher } })).authRevision;
  await updateAccount(db, admin, teacher, { isActive: false });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: teacher } })).authRevision, before + 1);
  assert.equal(await db.auditLog.count({ where: { userId: admin, action: "ACCOUNT_UPDATED" } }), 1);
});

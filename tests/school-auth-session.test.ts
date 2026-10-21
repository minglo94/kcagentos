import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { authDb } from "./helpers/auth-db";
import { resolveSessionUser, refreshSessionToken, resolveGoogleUser } from "../src/lib/school-auth/session";
let fixture: Awaited<ReturnType<typeof authDb>>, id: string;
before(async () => { fixture = await authDb(); id = (await fixture.db.user.create({ data: { email: "session@example.test", name: "Session", subjects: [] } })).id; });
after(async () => { await fixture?.close(); });
test("sessions bind the active user's exact revision and current database role", async () => {
  assert.equal((await resolveSessionUser(fixture.db, id, 0))?.role, "TEACHER");
  assert.equal(await resolveSessionUser(fixture.db, id, undefined as never), null);
  await fixture.db.user.update({ where: { id }, data: { authRevision: { increment: 1 }, role: "APPROVER" } });
  assert.equal(await resolveSessionUser(fixture.db, id, 0), null);
  assert.equal((await resolveSessionUser(fixture.db, id, 1))?.role, "APPROVER");
  await fixture.db.user.update({ where: { id }, data: { isActive: false, authRevision: { increment: 1 } } });
  assert.equal(await resolveSessionUser(fixture.db, id, 2), null);
  await fixture.db.user.update({ where: { id }, data: { isActive: true } });
  assert.equal(await resolveSessionUser(fixture.db, id, 1), null);
  assert.equal(await resolveSessionUser(fixture.db, "deleted", 0), null);
});
test("refreshing a session cannot extend its absolute eight-hour sign-in lifetime", async () => {
  const user = await fixture.db.user.create({ data: { email: "expiry@example.test", name: "Expiry", subjects: [] } });
  const start = 1000000;
  const token = await refreshSessionToken(fixture.db, {}, user, start);
  const refreshed = await refreshSessionToken(fixture.db, token, undefined, start + 7 * 3600000);
  assert.equal(refreshed.signInExpiresAt, start + 8 * 3600000);
  assert.deepEqual(await refreshSessionToken(fixture.db, refreshed, undefined, start + 8 * 3600000), {});
  assert.deepEqual(await refreshSessionToken(fixture.db, { userId: user.id, authRevision: 0 }), {});
});
test("Google contact email cannot attach to provisioned local users", async () => {
  const { bootstrapLocalAdmin } = await import("../src/lib/school-auth/store");
  const local = await bootstrapLocalAdmin(fixture.db, { name: "Local", username: "local.admin", email: "local@gs.keichi.edu.hk", password: "synthetic-local-password" });
  assert.equal(await resolveGoogleUser(fixture.db, { email: local.email, email_verified: true }), null);
  assert.equal(await resolveGoogleUser(fixture.db, { email: "new@gs.keichi.edu.hk", email_verified: false }), null);
  const google = await resolveGoogleUser(fixture.db, { email: "new@gs.keichi.edu.hk", email_verified: true });
  assert.equal(google?.role, "TEACHER");
  assert.equal((await resolveGoogleUser(fixture.db, { email: "new@gs.keichi.edu.hk", email_verified: true }))?.id, google?.id);
  const legacy = await fixture.db.user.create({ data: { email: "legacy@gs.keichi.edu.hk", name: "Legacy", role: "ADMIN", googleEnabled: true, subjects: [] } });
  assert.equal((await resolveGoogleUser(fixture.db, { email: legacy.email, email_verified: true }))?.id, legacy.id);
});

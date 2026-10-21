import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUsername, hashPassword, verifyPassword } from "../src/lib/school-auth/password";

test("local usernames are canonical ASCII identifiers, never domain identities", () => {
  assert.equal(normalizeUsername("Teacher.One"), "teacher.one");
  for (const input of ["ab", "a".repeat(65), "老師", "domain\\teacher", "teacher@example.test", " teacher "]) assert.equal(normalizeUsername(input), null);
});
test("versioned password hashes verify exact input without trimming", async () => {
  const password = " twelve chars ";
  const hash = await hashPassword(password);
  assert.notEqual(await hashPassword(password), hash);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword(password.trim(), hash), false);
  assert.equal(await verifyPassword("different-password", hash), false);
  for (const encoded of ["broken", hash.replace("65536", "1073741824"), hash + "x"]) assert.equal(await verifyPassword(password, encoded), false);
  await assert.rejects(() => hashPassword("a".repeat(11)));
  await assert.rejects(() => hashPassword("a".repeat(129)));
});

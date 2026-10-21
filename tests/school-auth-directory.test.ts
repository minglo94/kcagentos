import { test } from "node:test";
import assert from "node:assert/strict";
import { readDirectoryConfig, escapeFilter, lookupDirectoryIdentity, authenticateDirectory, type LdapFactory, type DirectoryConfig } from "../src/lib/school-auth/directory";
const config: DirectoryConfig = { directoryId: "synthetic", url: "ldaps://directory.example.test", base: "dc=example,dc=test", bindDn: "cn=synthetic", bindPassword: "fixture" };
function fixture(entries: Array<Record<string, unknown>>, rejectBind = false) {
  let closed = 0, opened = 0, filter = "";
  const factory: LdapFactory = async () => { const index = opened++; return {
    bind: async () => { if (rejectBind && index === 1) throw new Error("private directory error"); },
    search: async (_, options) => { filter = options.filter; return entries; },
    unbind: async () => { closed++; }, destroy: () => {},
  }; };
  return { factory, closed: () => closed, filter: () => filter };
}
const entry = { dn: "cn=teacher,dc=example,dc=test", objectGUID: Buffer.alloc(16, 1), sAMAccountName: "teacher.one", userAccountControl: "512" };
test("AD config requires complete verified LDAPS and rejects filter metacharacters", () => {
  assert.equal(readDirectoryConfig({}), null);
  assert.equal(readDirectoryConfig({ AGENTOS_AD_URL: "ldap://directory.example.test" }), null);
  assert.equal(escapeFilter("a*)(\\\0"), "a\\2a\\29\\28\\5c\\00");
});
test("directory lookup accepts exactly one enabled user and always closes clients", async () => {
  for (const entries of [[], [entry, entry], [{ ...entry, userAccountControl: "514" }], [{ ...entry, objectGUID: "not-a-guid" }]]) {
    const f = fixture(entries); assert.equal(await lookupDirectoryIdentity("teacher.one", config, f.factory), null); assert.equal(f.closed(), 1);
  }
  const good = fixture([entry]);
  assert.deepEqual(await lookupDirectoryIdentity("teacher.one", config, good.factory), { directoryId: "synthetic", objectGuid: "01".repeat(16) });
  assert.equal(good.closed(), 1);
  assert.equal(await lookupDirectoryIdentity("user*)(", config, good.factory), null);
});
test("AD authentication requires an explicit active GUID link and no local fallback", async () => {
  // A database fake is confined to the directory boundary; actual linking is tested against Prisma.
  const db = { $queryRaw: async () => [{ attempts: 1 }], $executeRaw: async () => 0, directoryIdentity: { findUnique: async () => null } } as never;
  const unlinked = fixture([entry]);
  assert.equal(await authenticateDirectory(db, "teacher.one", "fixture-password", config, unlinked.factory), null);
  assert.equal(unlinked.closed(), 1);
  const linkedDb = { $queryRaw: async () => [{ attempts: 1 }], $executeRaw: async () => 0, directoryIdentity: { findUnique: async () => ({ userId: "synthetic-id", user: { id: "synthetic-id", isActive: true, authRevision: 2 } }), findFirst: async () => ({ userId: "synthetic-id" }) } } as never;
  const success = fixture([entry]);
  assert.deepEqual(await authenticateDirectory(linkedDb, "teacher.one", "fixture-password", config, success.factory), { id: "synthetic-id", authRevision: 2 });
  assert.equal(success.closed(), 2);
  const failed = fixture([entry], true);
  assert.equal(await authenticateDirectory(linkedDb, "teacher.one", "wrong-password", config, failed.factory), null);
  assert.equal(failed.closed(), 2);
});
test("fresh usernames cannot open unbounded concurrent directory clients", async () => {
  let release!: () => void, opened = 0, closed = 0;
  const gate = new Promise<void>(done => { release = done; });
  const factory: LdapFactory = async () => ({ bind: async () => { opened++; await gate; }, search: async () => [], unbind: async () => { closed++; } });
  const db = { $queryRaw: async () => [{ attempts: 1 }], $executeRaw: async () => 0 } as never;
  const requests = Array.from({ length: 64 }, (_, i) => authenticateDirectory(db, `fresh.user.${i}`, "synthetic-password", config, factory));
  try { await new Promise(done => setImmediate(done)); assert.ok(opened <= 4, `opened ${opened} LDAP clients`); }
  finally { release(); await Promise.all(requests); }
  assert.equal(closed, opened);
  const recovered = fixture([entry]);
  assert.ok(await lookupDirectoryIdentity("teacher.one", config, recovered.factory));
});

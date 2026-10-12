import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { testAuthConfig, verifyTestCredentials } from "../src/lib/test-auth";

const password = "synthetic-test-password-for-fixture";
const salt = Buffer.from("c3b66c188a72a47e37b7f197f3f43602", "hex");
const hash = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex");
const env = { AGENTOS_TEST_AUTH_ENABLED: "true", AGENTOS_TEST_AUTH_EMAIL: "synthetic@example.test", AGENTOS_TEST_AUTH_PASSWORD_HASH: `scrypt-v1:${salt.toString("hex")}:${hash}` };

test("test credentials verify only the configured account and correct password", async () => {
  assert.equal(await verifyTestCredentials(env, env.AGENTOS_TEST_AUTH_EMAIL, password), true);
  assert.equal(await verifyTestCredentials(env, env.AGENTOS_TEST_AUTH_EMAIL, "incorrect-long-password"), false);
  assert.equal(await verifyTestCredentials(env, "another@example.test", password), false);
  assert.equal(await verifyTestCredentials(env, env.AGENTOS_TEST_AUTH_EMAIL, "short"), false);
  assert.equal(await verifyTestCredentials(env, env.AGENTOS_TEST_AUTH_EMAIL, "x".repeat(1025)), false);
});

test("test authentication fails closed when disabled or configuration is malformed", async () => {
  for (const config of [
    { ...env, AGENTOS_TEST_AUTH_ENABLED: undefined },
    { ...env, AGENTOS_TEST_AUTH_ENABLED: "TRUE" },
    { ...env, AGENTOS_TEST_AUTH_ENABLED: "false" },
    { ...env, AGENTOS_TEST_AUTH_PASSWORD_HASH: undefined },
    { ...env, AGENTOS_TEST_AUTH_PASSWORD_HASH: `scrypt-v1:00:${hash}` },
    { ...env, AGENTOS_TEST_AUTH_PASSWORD_HASH: `scrypt-v1:${salt.toString("hex")}:00` },
    { ...env, AGENTOS_TEST_AUTH_PASSWORD_HASH: `scrypt-v1:${salt.toString("hex")}:${"z".repeat(64)}` },
    { ...env, AGENTOS_TEST_AUTH_EMAIL: "bad email" },
  ]) {
    assert.equal(testAuthConfig(config), null);
    assert.equal(await verifyTestCredentials(config, env.AGENTOS_TEST_AUTH_EMAIL, password), false);
  }
  assert.equal(await verifyTestCredentials(env, undefined, password), false);
  assert.equal(await verifyTestCredentials(env, env.AGENTOS_TEST_AUTH_EMAIL, {}), false);
});

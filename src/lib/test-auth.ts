import { scrypt, timingSafeEqual } from "node:crypto";

type TestAuthEnvironment = Readonly<Record<string, string | undefined>>;

export function testAuthConfig(env: TestAuthEnvironment) {
  if (env.AGENTOS_TEST_AUTH_ENABLED !== "true") return null;
  const email = env.AGENTOS_TEST_AUTH_EMAIL;
  const match = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{64})$/.exec(env.AGENTOS_TEST_AUTH_PASSWORD_HASH ?? "");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !match) return null;
  return { email, salt: Buffer.from(match[1], "hex"), hash: Buffer.from(match[2], "hex") };
}

/** Fixed scrypt parameters prevent configuration-controlled resource usage. */
export async function verifyTestCredentials(env: TestAuthEnvironment, email: unknown, password: unknown): Promise<boolean> {
  const config = testAuthConfig(env);
  if (!config || typeof email !== "string" || email !== config.email || typeof password !== "string" || password.length < 12 || Buffer.byteLength(password) > 1024) return false;
  try {
    const derived = await new Promise<Buffer>((resolve, reject) => scrypt(password, config.salt, 32, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
    return timingSafeEqual(derived, config.hash);
  } catch { return false; }
}

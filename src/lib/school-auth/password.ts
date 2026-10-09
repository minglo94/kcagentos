import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const normalizeUsername = (value: string): string | null => /^[a-zA-Z0-9._-]{3,64}$/.test(value) ? value.toLowerCase() : null;
export const validPassword = (value: string) => value.length >= 12 && value.length <= 128;
let active = 0;
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (active >= 4) throw new Error("AUTH_BUSY");
  active++;
  try {
    return await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result)));
  } finally { active--; }
}
export async function hashPassword(password: string): Promise<string> {
  if (!validPassword(password)) throw new Error("INVALID_PASSWORD");
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt-v1$65536$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}
// Dummy verification still performs the identical expensive KDF for unknown users.
export const dummyHash = `scrypt-v1$65536$8$1$${"00".repeat(16)}$${"00".repeat(64)}`;
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (!validPassword(password)) return false;
  const match = /^scrypt-v1\$65536\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded);
  if (!match) return false;
  return timingSafeEqual(await derive(password, Buffer.from(match[1], "hex")), Buffer.from(match[2], "hex"));
}

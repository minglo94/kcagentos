import { readFile } from "node:fs/promises";
import { Client } from "ldapts";
import { PrismaClient } from "@prisma/client";
import { normalizeUsername } from "./password";
import { reserveAttempt } from "./store";

export type DirectoryConfig = { directoryId: string; url: string; base: string; bindDn: string; bindPassword: string; caPath?: string };
type DirectoryClient = { bind(dn: string, password: string): Promise<void>; search(base: string, options: { filter: string }): Promise<Array<Record<string, unknown>>>; unbind(): Promise<void> };
export type LdapFactory = (config: DirectoryConfig) => Promise<DirectoryClient>;
let activeDirectory = 0;
async function directorySlot<T>(operation: () => Promise<T>): Promise<T | null> {
  if (activeDirectory >= 4) return null;
  activeDirectory++;
  try { return await operation(); }
  finally { activeDirectory--; }
}
export function readDirectoryConfig(env: Record<string, string | undefined>): DirectoryConfig | null {
  const { AGENTOS_AD_ID: directoryId, AGENTOS_AD_URL: url, AGENTOS_AD_BASE: base, AGENTOS_AD_BIND_DN: bindDn, AGENTOS_AD_BIND_PASSWORD: bindPassword } = env;
  if (!directoryId || !url || !base || !bindDn || !bindPassword || directoryId.length > 64) return null;
  try { const parsed = new URL(url); if (parsed.protocol !== "ldaps:" || !parsed.hostname || parsed.username || parsed.password || parsed.search || (parsed.pathname && parsed.pathname !== "/")) return null; }
  catch { return null; }
  return { directoryId, url, base, bindDn, bindPassword, caPath: env.AGENTOS_AD_CA_PATH };
}
export const escapeFilter = (value: string) => value.replace(/[\0()*\\]/g, char => ({ "\0": "\\00", "(": "\\28", ")": "\\29", "*": "\\2a", "\\": "\\5c" }[char]!));
const nativeFactory: LdapFactory = async config => {
  const client = new Client({ url: config.url, timeout: 5000, connectTimeout: 5000, tlsOptions: { rejectUnauthorized: true, ...(config.caPath ? { ca: await readFile(config.caPath) } : {}) } });
  return {
    bind: (dn, password) => client.bind(dn, password),
    search: async (base, { filter }) => (await client.search(base, { scope: "sub", filter, sizeLimit: 2, timeLimit: 5, attributes: ["objectGUID", "sAMAccountName", "userAccountControl"], explicitBufferAttributes: ["objectGUID"] })).searchEntries,
    unbind: () => client.unbind(),
  };
};
async function limited<T>(operation: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("DIRECTORY_TIMEOUT")), Math.max(0, deadline - Date.now())); })]); }
  finally { clearTimeout(timer); }
}
async function lookup(username: string, config: DirectoryConfig, factory: LdapFactory, deadline: number) {
  const client = await factory(config);
  try {
    await limited(client.bind(config.bindDn, config.bindPassword), deadline);
    const entries = await limited(client.search(config.base, { filter: `(&(objectCategory=person)(objectClass=user)(sAMAccountName=${escapeFilter(username)}))` }), deadline);
    if (entries.length !== 1) return null;
    const entry = entries[0], guid = entry.objectGUID;
    if (typeof entry.dn !== "string" || !entry.dn || !Buffer.isBuffer(guid) || guid.length !== 16 || typeof entry.userAccountControl !== "string" || !/^\d+$/.test(entry.userAccountControl) || (Number(entry.userAccountControl) & 2) !== 0 || String(entry.sAMAccountName).toLowerCase() !== username) return null;
    return { dn: entry.dn, identity: { directoryId: config.directoryId, objectGuid: guid.toString("hex") } };
  } finally { await client.unbind().catch(() => {}); }
}
export async function lookupDirectoryIdentity(submitted: string, config: DirectoryConfig, factory = nativeFactory) {
  const username = normalizeUsername(submitted);
  if (!username) return null;
  try { return await directorySlot(async () => (await lookup(username, config, factory, Date.now() + 10000))?.identity ?? null); }
  catch { return null; }
}
export async function authenticateDirectory(db: PrismaClient, submitted: string, password: string, config: DirectoryConfig, factory = nativeFactory) {
  return directorySlot(() => directoryLogin(db, submitted, password, config, factory));
}
async function directoryLogin(db: PrismaClient, submitted: string, password: string, config: DirectoryConfig, factory: LdapFactory) {
  const username = normalizeUsername(submitted);
  if (!username || !password || password.length > 128 || !await reserveAttempt(db, "school-ad", username)) return null;
  const deadline = Date.now() + 10000;
  try {
    const result = await lookup(username, config, factory, deadline);
    if (!result) return null;
    const link = await db.directoryIdentity.findUnique({ where: { directoryId_objectGuid: result.identity }, include: { user: true } });
    if (!link?.user.isActive || Date.now() >= deadline) return null;
    const client = await factory(config);
    try { await limited(client.bind(result.dn, password), deadline); }
    finally { await client.unbind().catch(() => {}); }
    const live = await db.directoryIdentity.findFirst({ where: { ...result.identity, userId: link.userId, user: { isActive: true, authRevision: link.user.authRevision } } });
    return live ? { id: link.userId, authRevision: link.user.authRevision } : null;
  } catch { return null; }
}

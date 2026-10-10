import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { authenticateLocal } from "./school-auth/store";
import { authenticateDirectory, readDirectoryConfig } from "./school-auth/directory";
import { resolveSessionUser, refreshSessionToken, resolveGoogleUser } from "./school-auth/session";

const ALLOWED_DOMAIN = "gs.keichi.edu.hk";
const providers: NextAuthOptions["providers"] = [];
if (process.env.AGENTOS_LOCAL_AUTH_ENABLED === "true") providers.push(CredentialsProvider({
  id: "local", name: "AgentOS 帳號", credentials: { username: { label: "帳號", type: "text" }, password: { label: "密碼", type: "password" } },
  async authorize(credentials) {
    if (!credentials?.username || !credentials.password) return null;
    try {
      const identity = await authenticateLocal(prisma, credentials.username, credentials.password);
      return identity ? resolveSessionUser(prisma, identity.id, identity.authRevision) : null;
    } catch { return null; }
  },
}));
const directory = process.env.AGENTOS_AD_AUTH_ENABLED === "true" ? readDirectoryConfig(process.env) : null;
if (directory) providers.push(CredentialsProvider({
  id: "school-ad", name: "學校 AD 帳號", credentials: { username: { label: "帳號", type: "text" }, password: { label: "密碼", type: "password" } },
  async authorize(credentials) {
    if (!credentials?.username || !credentials.password) return null;
    try {
      const identity = await authenticateDirectory(prisma, credentials.username, credentials.password, directory);
      return identity ? resolveSessionUser(prisma, identity.id, identity.authRevision) : null;
    } catch { return null; }
  },
}));
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) providers.push(GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  authorization: { params: { hd: ALLOWED_DOMAIN } },
}));
export const authOptions: NextAuthOptions = {
  providers, session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google") return !!user?.id;
      const google = profile as { email?: string; name?: string; email_verified?: boolean } | undefined;
      const dbUser = google ? await resolveGoogleUser(prisma, google) : null;
      if (!dbUser) return false;
      user.id = dbUser.id; user.authRevision = dbUser.authRevision;
      return true;
    },
    async jwt({ token, user }) {
      return refreshSessionToken(prisma, token, user);
    },
    async session({ session, token }) {
      if (!token.userId) return { ...session, user: undefined } as unknown as typeof session;
      session.user = { ...session.user, id: token.userId, role: token.role as Role, email: token.email!, name: token.name!, department: token.department ?? null };
      return session;
    },
    async redirect({ url, baseUrl }) {
      try { const target = new URL(url, baseUrl); return target.origin === new URL(baseUrl).origin ? target.toString() : baseUrl; }
      catch { return baseUrl; }
    },
  },
  pages: { signIn: "/login", error: "/login" },
};
export async function getSession() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? session : null;
}
export async function requireRole(...roles: Role[]): Promise<{ userId: string; role: Role; email: string }> {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError(401, "未登入");
  if (!roles.includes(session.user.role)) throw new AuthError(403, "權限不足");
  return { userId: session.user.id, role: session.user.role, email: session.user.email };
}
export class AuthError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

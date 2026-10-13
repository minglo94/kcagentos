import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { testAuthConfig, verifyTestCredentials } from "@/lib/test-auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const ALLOWED_DOMAIN = "gs.keichi.edu.hk";

export const authOptions: NextAuthOptions = {
  // 移除 PrismaAdapter — JWT strategy 唔需要 Account/Session tables
  providers: [
    ...(process.env.AGENTOS_TEST_AUTH_ENABLED === "true" ? [CredentialsProvider({
      id: "agentos-test",
      name: "合成資料測試帳號",
      credentials: { email: { label: "測試電郵", type: "email" }, password: { label: "測試密碼", type: "password" } },
      async authorize(credentials) {
        if (!await verifyTestCredentials(process.env, credentials?.email, credentials?.password)) return null;
        const config = testAuthConfig(process.env)!;
        const user = await prisma.user.findUnique({ where: { email: config.email }, select: { id: true, email: true, name: true, isActive: true } });
        return user?.isActive ? { id: user.id, email: user.email, name: user.name } : null;
      },
    })] : []),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: { hd: ALLOWED_DOMAIN },
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  callbacks: {
    async signIn({ profile, account, user }) {
      if (account?.provider === "agentos-test") {
        const config = testAuthConfig(process.env);
        if (!config || user.email !== config.email) return false;
        const existing = await prisma.user.findUnique({ where: { email: config.email }, select: { id: true, isActive: true } });
        if (!existing?.isActive || existing.id !== user.id) return false;
        await prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } });
        return true;
      }
      if (account?.provider !== "google") return false;
      const email = profile?.email ?? "";
      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return false;

      // 首次登入自動建 User，更新 lastLoginAt
      await prisma.user.upsert({
        where: { email },
        update: { lastLoginAt: new Date(), name: profile?.name ?? email.split("@")[0] },
        create: {
          email,
          name: profile?.name ?? email.split("@")[0],
          role: "TEACHER",
          lastLoginAt: new Date(),
        },
      });
      return true;
    },
    async jwt({ token, account }) {
      if (account) token.testAuth = account.provider === "agentos-test";
      if (token.testAuth) {
        const config = testAuthConfig(process.env);
        if (!config || token.email !== config.email) throw new Error("test_account_disabled");
      }
      // 每次刷新 token 時從 DB 取最新角色（確保角色變更即時生效）
      const email = token.email;
      if (email) {
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true, department: true, isActive: true },
        });
        if (!dbUser) throw new Error("account_missing");
        if (dbUser) {
          if (!dbUser.isActive) throw new Error("account_disabled");
          token.userId     = dbUser.id;
          token.role       = dbUser.role;
          token.department = dbUser.department;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id         = token.userId as string;
        session.user.role       = token.role as Role;
        session.user.department = token.department as string | null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error:  "/login",
  },
};

/** Office gates need the current identity to return an explicit teacher 403. */
export const getIdentitySession = () => getServerSession(authOptions);
/** Browser-facing AgentOS is operator-only; teacher identities remain backend mappings. */
export const getSession = async () => {
  const session=await getIdentitySession();
  return session?.user?.role==='ADMIN'?session:null;
};

export async function requireRole(
  ...roles: Role[]
): Promise<{ userId: string; role: Role; email: string }> {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError(401, "未登入");
  if (!roles.includes(session.user.role as Role))
    throw new AuthError(403, "權限不足");
  return {
    userId: session.user.id,
    role:   session.user.role as Role,
    email:  session.user.email!,
  };
}

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}


import type { Role } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
  interface User { authRevision?: number; }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
      role: Role;
      department: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    authRevision?: number;
    signInExpiresAt?: number;
    role?: Role;
    department?: string | null;
  }
}

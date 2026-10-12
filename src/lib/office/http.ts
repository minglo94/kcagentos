import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSession } from "@/lib/auth";
import { OfficeError } from "./plan";

export async function officeUser(req: NextRequest) {
  if (!["GET", "HEAD"].includes(req.method)) {
    const origin = req.headers.get("origin");
    // Next may normalize loopback/reverse-proxy URLs to localhost internally.
    // Prefer the explicitly configured public authentication origin.
    const expectedOrigin = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : req.nextUrl.origin;
    if (origin && origin !== expectedOrigin) throw new OfficeError(403, "INVALID_ORIGIN");
  }
  const session = await getSession();
  if (!session?.user?.id) throw new OfficeError(401, "NOT_AUTHENTICATED");
  return session.user.id;
}
export function officeFailure(error: unknown) {
  if (error instanceof OfficeError) return NextResponse.json({ error: error.code }, { status: error.status });
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
}

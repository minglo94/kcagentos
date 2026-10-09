import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AuthError, requireRole } from "../auth";
export function requireSameOrigin(req: NextRequest) {
  const expected = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : req.nextUrl.origin;
  if (req.headers.get("origin") !== expected) throw new AuthError(403, "INVALID_ORIGIN");
}
export async function requireAccountAdmin(req: NextRequest) {
  requireSameOrigin(req);
  return requireRole("ADMIN");
}
export async function accountBody(req: NextRequest): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new AuthError(400, "INVALID_INPUT");
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 16384) { await reader.cancel(); throw new AuthError(413, "INPUT_TOO_LARGE"); } chunks.push(next.value); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}
export function accountFailure(error: unknown) {
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  if (error instanceof Error && error.message === "ADMIN_REQUIRED") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (error instanceof Error && error.message === "IDENTITY_IN_USE" || error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "ACCOUNT_CONFLICT" }, { status: 409 });
  return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
}

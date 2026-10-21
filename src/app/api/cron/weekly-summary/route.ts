import { NextResponse } from "next/server";

// Scheduled school delivery must use Portal's approved content/recipient outbox.
export async function GET() {
  return NextResponse.json({ error: "PORTAL_APPROVAL_REQUIRED" }, { status: 403 });
}

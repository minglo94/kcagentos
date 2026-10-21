import { NextResponse } from "next/server";

// School content, recipient and delivery decisions are owned by Portal.
// Legacy operator routes cannot create an alternative approval or sending path.
export async function POST() {
  return NextResponse.json({ error: "PORTAL_APPROVAL_REQUIRED" }, { status: 403 });
}

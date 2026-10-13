import { NextRequest } from "next/server";
import { officeFailure, officeUser } from "@/lib/office/http";
import { OfficeError } from '@/lib/office/plan';
export async function POST(req: NextRequest) {
  try {
    await officeUser(req);
    throw new OfficeError(403,'PORTAL_AUTHORITY_REQUIRED');
  } catch (error) { return officeFailure(error); }
}

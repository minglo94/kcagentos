import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountAdmin, accountBody, accountFailure } from "@/lib/school-auth/admin-http";
import { updateAccount } from "@/lib/school-auth/store";

export async function PATCH(req: NextRequest, { params: routeParams }: { params: Promise<{ id: string }> }) {
  const params = await routeParams;
  try {
    const { userId } = await requireAccountAdmin(req);
    const input = await accountBody(req);
    return NextResponse.json(await updateAccount(prisma, userId, params.id, input));
  } catch (error) { return accountFailure(error); }
}

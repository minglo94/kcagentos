import { forbidden, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from '@/lib/prisma';
import OfficeClient from "./office-client";
export const metadata = { title: "Hermes 指揮台 — 基智 AgentOS" };
export default async function OfficePage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  const operator=await prisma.user.findFirst({where:{id:session.user.id,role:'ADMIN',isActive:true},select:{id:true}});
  if(!operator)forbidden();
  return <OfficeClient />;
}

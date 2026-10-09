import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import OfficeClient from "./office-client";
export const metadata = { title: "Hermes 指揮台 — 基智 AgentOS" };
export default async function OfficePage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");
  return <OfficeClient />;
}

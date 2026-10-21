import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import AdminUsersClient from "./admin-users-client";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/");
  return <><Link href="/admin/task-audits">任務輸入／輸出紀錄</Link><AdminUsersClient /></>;
}

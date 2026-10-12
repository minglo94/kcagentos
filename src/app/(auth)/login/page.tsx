import LoginClient from "./login-client";
import { testAuthConfig } from "@/lib/test-auth";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginClient testAuthEnabled={Boolean(testAuthConfig(process.env))} />;
}

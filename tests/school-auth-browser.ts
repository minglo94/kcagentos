import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { chromium, expect as baseExpect } from "@playwright/test";
import { authDb } from "./helpers/auth-db";
import { bootstrapLocalAdmin, createLocalUser } from "../src/lib/school-auth/store";
const expect = baseExpect.configure({ timeout: 30000 });
async function main() {
  const fixture = await authDb();
  const admin = await bootstrapLocalAdmin(fixture.db, { name: "Synthetic admin", email: "admin@example.test", username: "synthetic.admin", password: "synthetic-admin-pass" });
  const teacher = await createLocalUser(fixture.db, admin.id, { name: "Synthetic teacher", email: "teacher@example.test", username: "synthetic.teacher", password: "synthetic-teacher-pass" });
  await fixture.db.$disconnect();
  const url = "http://127.0.0.1:3198";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3198"], { stdio: "pipe", env: { ...process.env, DATABASE_URL: fixture.url, NEXTAUTH_URL: url, NEXTAUTH_SECRET: randomBytes(32).toString("hex"), GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", AGENTOS_LOCAL_AUTH_ENABLED: "true", AGENTOS_AD_AUTH_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1" } });
  let logs = "";
  server.stdout.on("data", data => { logs = (logs + data).slice(-5000); }); server.stderr.on("data", data => { logs = (logs + data).slice(-5000); });
  let browser; let lastPage: import("@playwright/test").Page | undefined;
  try {
    for (let i = 0; ; i++) {
      if (i > 90 || server.exitCode !== null) throw new Error("Synthetic auth server did not become ready");
      try { if ((await fetch(url + "/api/jobs", { signal: AbortSignal.timeout(3000) })).status === 401) break; } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || undefined });
    const context = await browser.newContext(), page = await context.newPage(); lastPage = page;
    page.on("console", message => { if (message.type() === "error") logs += "\nConsole error: " + message.text(); });
    page.on("pageerror", error => { logs += "\nBrowser error: " + error.message; });
    page.on("requestfailed", request => { logs += "\nFailed asset: " + new URL(request.url()).pathname; });
    await page.goto(url + "/login");
    await expect(page.getByLabel("帳號", { exact: true })).toBeVisible();
    await page.getByLabel("帳號", { exact: true }).fill("synthetic.teacher"); await page.getByLabel("密碼", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "登入", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "登入失敗" })).toBeVisible();
    await expect(page.getByLabel("密碼", { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "登入", exact: true })).toBeEnabled();
    await page.getByLabel("密碼", { exact: true }).fill("synthetic-teacher-pass"); await expect(page.getByLabel("密碼", { exact: true })).toHaveValue("synthetic-teacher-pass"); await page.getByRole("button", { name: "登入", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hermes 指揮台", exact: true })).toBeVisible({ timeout: 30000 });
    assert.equal((await context.request.get(url + "/api/jobs")).status(), 200);
    assert.equal((await context.request.get(url + "/api/admin/users")).status(), 403);
    const adminContext = await browser.newContext(), adminPage = await adminContext.newPage();
    await adminPage.goto(url + "/login"); await adminPage.getByLabel("帳號", { exact: true }).fill("synthetic.admin"); await adminPage.getByLabel("密碼", { exact: true }).fill("synthetic-admin-pass"); await adminPage.getByRole("button", { name: "登入", exact: true }).click();
    await expect(adminPage.getByRole("heading", { name: "Hermes 指揮台", exact: true })).toBeVisible({ timeout: 30000 });
    const users = await adminContext.request.get(url + "/api/admin/users"); assert.equal(users.status(), 200); assert.equal((await users.text()).includes("passwordHash"), false);
    const credentialUrl = `${url}/api/admin/users/${teacher.id}/credentials`;
    assert.equal((await context.request.put(credentialUrl, { headers: { origin: url }, data: { username: "synthetic.teacher", password: "replacement-password" } })).status(), 403);
    assert.equal((await adminContext.request.put(credentialUrl, { headers: { origin: "https://untrusted.example" }, data: { username: "synthetic.teacher", password: "replacement-password" } })).status(), 403);
    assert.equal((await adminContext.request.put(credentialUrl, { headers: { origin: url }, data: { username: "synthetic.teacher", password: "replacement-password" } })).status(), 200);
    assert.equal((await context.request.get(url + "/api/jobs")).status(), 401);
    const disabled = await adminContext.request.patch(`${url}/api/admin/users/${teacher.id}`, { headers: { origin: url }, data: { isActive: false } }); assert.equal(disabled.status(), 200);
    await page.goto(url + "/login"); await page.getByLabel("帳號", { exact: true }).fill("synthetic.teacher"); await page.getByLabel("密碼", { exact: true }).fill("replacement-password"); await page.getByRole("button", { name: "登入", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "登入失敗" })).toBeVisible();
    console.log("Synthetic browser auth passed: real NextAuth credentials/CSRF/cookies, no Google config, teacher/admin scope, credential privacy, hostile origin, reset revocation, disabled login.");
  } catch (error) { if (lastPage) console.error((await lastPage.locator("body").innerText()).slice(0,1500)); console.error(logs); throw error; }
  finally { await browser?.close(); server.kill(); await fixture.close(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Synthetic authentication browser test failed"); process.exitCode = 1; });

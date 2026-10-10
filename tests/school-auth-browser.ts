import { createServer } from "node:http";
import "./helpers/task-env";
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
  let modelCalls=0;
  const modelServer=createServer((req,res)=>{modelCalls++;req.resume();res.writeHead(200,{"Content-Type":"text/event-stream"});res.end('data: '+JSON.stringify({choices:[{delta:{content:"<script>synthetic audit output</script>"}}]})+'\n\ndata: [DONE]\n\n');});
  await new Promise<void>(r=>modelServer.listen(0,"127.0.0.1",r));
  process.env.AGENTOS_LOCAL_MODEL_URL=`http://127.0.0.1:${(modelServer.address() as {port:number}).port}`;
  process.env.AGENTOS_LOCAL_MODEL="synthetic-test-model";
  await fixture.db.$disconnect();
  const url = "http://127.0.0.1:3198";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3198"], { stdio: "pipe", env: { ...process.env, DATABASE_URL: fixture.url, NEXTAUTH_URL: url, NEXTAUTH_SECRET: randomBytes(32).toString("hex"), GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", AGENTOS_LOCAL_AUTH_ENABLED: "true", AGENTOS_AD_AUTH_ENABLED: "true", AGENTOS_AD_ID: "synthetic", AGENTOS_AD_URL: "ldaps://127.0.0.1:1", AGENTOS_AD_BASE: "dc=example,dc=test", AGENTOS_AD_BIND_DN: "cn=synthetic", AGENTOS_AD_BIND_PASSWORD: "synthetic-directory-password", AGENTOS_AD_CA_PATH: "", NEXT_TELEMETRY_DISABLED: "1" } });
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
    await expect(page.getByLabel("登入方式").locator("option")).toHaveCount(2);
    await page.getByLabel("登入方式").selectOption("school-ad");
    await page.getByLabel("登入方式").selectOption("local");
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
    await adminPage.goto(url + "/admin/users");
    await adminPage.getByText("建立及管理登入帳號", { exact: true }).click();
    await adminPage.getByLabel("新用戶姓名", { exact: true }).fill("UI synthetic staff");
    await adminPage.getByLabel("聯絡電郵", { exact: true }).fill("ui-staff@example.test");
    await adminPage.getByLabel("登入帳號", { exact: true }).fill("ui.synthetic.staff");
    await adminPage.getByLabel("新密碼", { exact: true }).fill("synthetic-ui-password");
    await adminPage.getByRole("button", { name: "建立本地帳號", exact: true }).click();
    await expect(adminPage.getByRole("status").filter({ hasText: "已保存。" })).toBeVisible();
    await expect(adminPage.getByLabel("新密碼", { exact: true })).toHaveValue("");
    const created = await adminContext.request.get(url + "/api/admin/users");
    assert.ok((await created.json() as Array<{ email: string; role: string }>).some(user => user.email === "ui-staff@example.test" && user.role === "TEACHER"));
    assert.equal((await context.request.get(url+"/api/admin/task-audits")).status(),403);
    const denied=await context.request.post(url+"/api/chat",{headers:{origin:url},data:{messages:[{role:"user",content:"synthetic"}],engine:"claude"}});
    assert.equal(denied.status(),403);assert.equal(modelCalls,0);
    const chat=await context.request.post(url+"/api/chat",{headers:{origin:url},data:{messages:[{role:"user",content:"synthetic audit input"}],engine:"ollama"}});
    assert.equal(chat.status(),200);assert.match(await chat.text(),/synthetic audit output/);assert.equal(modelCalls,1);
    for(const route of ["/api/notify","/api/doc","/api/tools/quotation/parse","/api/tools/notice/generate"]){assert.equal((await context.request.post(url+route,{headers:{origin:url},data:{}})).status(),403);}
    const auditRows=(await (await adminContext.request.get(url+"/api/admin/task-audits")).json()).attempts;
    const chatAudit=auditRows.find((a:{executor:string;status:string})=>a.executor==="chat"&&a.status==="SUCCEEDED");assert.ok(chatAudit);
    assert.equal((await context.request.get(url+`/api/admin/task-audits/${chatAudit.id}/payload?direction=input`)).status(),403);
    const output=await adminContext.request.get(url+`/api/admin/task-audits/${chatAudit.id}/payload?direction=output`);assert.equal(output.headers()["cache-control"],"no-store");assert.match((await output.json()).text,/synthetic audit output/);
    await adminPage.goto(url+"/admin/task-audits");await expect(adminPage.getByRole("heading",{name:"任務輸入／輸出紀錄"})).toBeVisible();
    await adminPage.getByRole("button",{name:`查看 ${chatAudit.id.slice(0,8)}`}).click();await expect(adminPage.locator("pre")).toContainText("synthetic audit input");
    await adminPage.getByRole("button",{name:"輸出",exact:true}).click();await expect(adminPage.locator("pre")).toContainText("<script>synthetic audit output</script>");
    assert.equal(await adminPage.locator("pre script").count(),0);
    const credentialUrl = `${url}/api/admin/users/${teacher.id}/credentials`;
    assert.equal((await context.request.put(credentialUrl, { headers: { origin: url }, data: { username: "synthetic.teacher", password: "replacement-password" } })).status(), 403);
    assert.equal((await adminContext.request.put(credentialUrl, { headers: { origin: "https://untrusted.example" }, data: { username: "synthetic.teacher", password: "replacement-password" } })).status(), 403);
    assert.equal((await adminContext.request.put(credentialUrl, { data: { username: "synthetic.teacher", password: "replacement-password" } })).status(), 403);
    assert.equal((await adminContext.request.put(`${url}/api/admin/users/${teacher.id}/directory`, { headers: { origin: url }, data: { username: "synthetic.teacher", objectGuid: "01".repeat(16) } })).status(), 400);
    assert.equal((await adminContext.request.put(credentialUrl, { headers: { origin: url }, data: { username: "synthetic.teacher", password: "replacement-password" } })).status(), 200);
    assert.equal((await context.request.get(url + "/api/jobs")).status(), 401);
    const disabled = await adminContext.request.patch(`${url}/api/admin/users/${teacher.id}`, { headers: { origin: url }, data: { isActive: false } }); assert.equal(disabled.status(), 200);
    await page.goto(url + "/login"); await page.getByLabel("帳號", { exact: true }).fill("synthetic.teacher"); await page.getByLabel("密碼", { exact: true }).fill("replacement-password"); await page.getByRole("button", { name: "登入", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "登入失敗" })).toBeVisible();
    assert.equal((await adminContext.request.patch(`${url}/api/admin/users/${admin.id}`, { headers: { origin: url }, data: { isActive: false } })).status(), 200);
    assert.equal((await adminContext.request.put(credentialUrl, { headers: { origin: url }, data: { username: "synthetic.teacher", password: "replacement-password" } })).status(), 401);
    assert.equal((await adminContext.request.get(url+`/api/admin/task-audits/${chatAudit.id}/payload?direction=input`)).status(),401);
    console.log("Synthetic audit browser passed: local streaming, cloud denial, legacy route denial, admin input/output UI, literal HTML, teacher scope and revoked admin.");
    console.log("Synthetic browser auth passed: both provider choices, real local NextAuth credentials/CSRF/cookies, UI provisioning, teacher/admin scope, credential privacy, hostile/missing origin, client GUID rejection, reset revocation, disabled staff/admin. Real AD remains untested.");
  } catch (error) { if (lastPage) console.error((await lastPage.locator("body").innerText()).slice(0,1500)); console.error(logs); throw error; }
  finally { await browser?.close(); server.kill(); await fixture.close(); await new Promise<void>(r=>modelServer.close(()=>r())); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Synthetic authentication browser test failed"); process.exitCode = 1; });

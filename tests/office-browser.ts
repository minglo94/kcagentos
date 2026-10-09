// Synthetic-only end-to-end test: real Next routes, sessions, Prisma and browser;
// planner output is a fixture, not a claim of live Hermes inference.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { runNext } from "../src/lib/office/worker";
import type { OfficePlan } from "../src/lib/office/plan";

async function main() {
  const pg = await PGlite.create();
  for (const dir of ["20261009000000_baseline", "20261009000100_office"]) await pg.exec(await readFile(`prisma/migrations/${dir}/migration.sql`, "utf-8"));
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: "127.0.0.1", maxConnections: 1 });
  await socket.start();
  // PGlite multiplexes one backend; disable per-connection prepared statements.
  const databaseUrl = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?connection_limit=1&pgbouncer=true&statement_cache_size=0`;
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const user = await db.user.create({ data: { name: "Synthetic staff", email: "synthetic@gs.keichi.edu.hk", subjects: [] } });
  const other = await db.user.create({ data: { name: "Other synthetic staff", email: "other@gs.keichi.edu.hk", subjects: [] } });
  const fixture: OfficePlan = { summary: "合成測試計劃，並非模型生成。", acceptance: ["老師核對合成資料來源"], steps: [{ id: "review", title: "核對合成資料", agent: "andy", executor: "manual", dependsOn: [], instructions: "核對日期及缺漏；不發送任何電郵。" }] };
  const { createJob, approvePlan } = await import("../src/lib/office/store");
  const job = await createJob(db, user.id, "規劃一份合成資料班主任摘要", "school");
  await runNext(db, { plan: async () => fixture });
  const manual = await createJob(db, user.id, "人工核對合成資料", "school");
  await runNext(db, { plan: async () => fixture });
  const manualReady = await db.officeJob.findUniqueOrThrow({ where: { id: manual.id } });
  await approvePlan(db, manual.id, user.id, manualReady.planVersion, manualReady.planHash!, "approve");
  await runNext(db, { plan: async () => fixture });
  // Release the single backend before Next owns it; PGlite is not a multi-session
  // PostgreSQL server. Multi-worker concurrency must be tested on real PostgreSQL.
  await db.$disconnect();
  await new Promise(resolve => setTimeout(resolve, 100));
  const secret = randomBytes(32).toString("hex");
  const port = Number(process.env.AGENTOS_TEST_PORT || 3197);
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    shell: false, windowsHide: true, stdio: "pipe", env: { ...process.env, DATABASE_URL: databaseUrl, NEXTAUTH_URL: url, NEXTAUTH_SECRET: secret,
      GOOGLE_CLIENT_ID: "synthetic-test-client", GOOGLE_CLIENT_SECRET: "synthetic-test-secret", ANTHROPIC_API_KEY: "synthetic-not-a-real-key", NEXT_TELEMETRY_DISABLED: "1" },
  });
  let logs = "";
  server.stdout.on("data", b => { logs = (logs + String(b)).slice(-8000); });
  server.stderr.on("data", b => { logs = (logs + String(b)).slice(-8000); });
  let browser;
  try {
    for (let attempt = 0; ; attempt++) {
      if (attempt > 90 || server.exitCode !== null) throw new Error("Test server did not become ready");
      try { const response = await fetch(url + "/api/jobs", { signal: AbortSignal.timeout(5000) }); if (response.status === 401) break; } catch { /* Starting. */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || undefined, headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const anonymous = await context.request.get(url + "/api/jobs");
    assert.equal(anonymous.status(), 401);
    const token = await encode({ secret, token: { email: user.email, name: user.name, userId: user.id, role: "TEACHER" } });
    await context.addCookies([{ name: "next-auth.session-token", value: token, url }]);
    const page = await context.newPage();
    await page.goto(url + "/office");
    await expect(page.getByRole("heading", { name: "Hermes 指揮台", exact: true })).toBeVisible({ timeout: 60_000 });
    const jobButton = page.getByRole("button", { name: /規劃一份合成資料班主任摘要/ });
    // Wait for the authenticated client fetch, not just server-rendered headings.
    await expect(jobButton).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("工作目標").fill("建立另一個合成測試目標");
    await page.getByRole("button", { name: "交給 Hermes 規劃" }).click();
    await expect(page.getByRole("button", { name: /建立另一個合成測試目標/ })).toBeVisible();
    await jobButton.click();
    await expect(page.getByRole("button", { name: "批准計劃", exact: true })).toBeVisible({ timeout: 20_000 });
    const denied = await context.request.post(`${url}/api/jobs/${job.id}/approvals`, { headers: { origin: "https://untrusted.example" }, data: { version: 1, hash: "0".repeat(64), decision: "approve" } });
    assert.equal(denied.status(), 403);
    await page.getByRole("button", { name: "批准計劃", exact: true }).click();
    await expect(jobButton).toContainText("已排隊");
    const manualButton = page.getByRole("button", { name: /人工核對合成資料/ });
    await manualButton.click();
    await expect(page.getByLabel("人工完成證據")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("人工完成證據").fill("已核對合成日期及資料，沒有缺漏。");
    await page.getByRole("button", { name: "保存證據及繼續" }).click();
    await expect(manualButton).toContainText("已排隊");
    await page.reload();
    await expect(manualButton).toContainText("已排隊");
    await manualButton.click();
    await expect(page.getByText("已核對合成日期及資料，沒有缺漏。", { exact: true })).toBeVisible();
    const otherToken = await encode({ secret, token: { email: other.email, userId: other.id, role: "TEACHER" } });
    await context.addCookies([{ name: "next-auth.session-token", value: otherToken, url }]);
    assert.equal((await context.request.get(`${url}/api/jobs/${job.id}`)).status(), 404);
    await context.addCookies([{ name: "next-auth.session-token", value: token, url }]);
    await mkdir(".test-artifacts", { recursive: true });
    await page.screenshot({ path: ".test-artifacts/office.png", fullPage: true });
    console.log("Browser E2E passed: auth, cross-origin rejection, durable plan approval, manual evidence, SSE update, reload, ownership. Synthetic planner only; worker completion covered by store tests.");
    console.log(path.resolve(".test-artifacts/office.png"));
  } catch (error) { console.error(logs); throw error; }
  finally {
    await browser?.close();
    if (server.pid && process.platform === "win32") spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    else server.kill();
    await db.$disconnect(); await socket.stop();
    await new Promise(resolve => setTimeout(resolve, 500));
    await pg.close();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

// Opt-in qualification of the locally built image, using its own disposable DB.
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium, expect as baseExpect } from "@playwright/test";
import { hashPassword } from "../src/lib/school-auth/password";
const expect = baseExpect.configure({ timeout: 30000 });
async function main() {
  const project = `agentos_qualification_${randomBytes(6).toString("hex")}`, url = "http://127.0.0.1:3199";
  const environment: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", AGENTOS_IMAGE_TAG: "qualification", AGENTOS_DB_PASSWORD: randomBytes(24).toString("hex"), NEXTAUTH_SECRET: randomBytes(32).toString("hex"), NEXTAUTH_URL: url, AGENTOS_HTTP_PORT: "3199", AGENTOS_DB_PORT: "15433", AGENTOS_LOCAL_AUTH_ENABLED: "true", AGENTOS_AD_AUTH_ENABLED: "false", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", AGENTOS_AD_ID: "", AGENTOS_AD_URL: "", AGENTOS_AD_BASE: "", AGENTOS_AD_BIND_DN: "", AGENTOS_AD_BIND_PASSWORD: "" };
  for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) delete environment[key];
  const docker = (args: string[], input?: string) => {
    const result = spawnSync("docker", ["--host=unix:///var/run/docker.sock", ...args], { env: environment, input, encoding: "utf8", timeout: 90000, maxBuffer: 4 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Local container qualification command failed (${args[0]}); connection output suppressed`);
    return result.stdout.trim();
  };
  const composeArgs = ["compose", "--project-name", project, "-f", "deploy/compose.yaml"];
  const compose = (args: string[], input?: string) => docker([...composeArgs, ...args], input);
  let browser;
  try {
    assert.equal(docker(["image", "inspect", "kcagentos:qualification", "--format", "{{.Config.User}}"]), "node");
    compose(["config", "--quiet"]);
    compose(["up", "--detach", "--wait", "db"]);
    compose(["--profile", "maintenance", "run", "--rm", "migrate"]);
    const hash = await hashPassword("synthetic-container-password");
    compose(["exec", "-T", "db", "psql", "-U", "agentos", "-d", "agentos", "-v", "ON_ERROR_STOP=1"], `BEGIN;
INSERT INTO "User" (id,email,name,subjects) VALUES ('container-staff','container@example.test','Synthetic container staff',ARRAY[]::TEXT[]);
INSERT INTO "LocalCredential" ("userId",username,"passwordHash") VALUES ('container-staff','container.staff','${hash}');
COMMIT;`);
    compose(["up", "--detach", "--wait", "web"]);
    compose(["exec", "-T", "web", "node", "--import", "tsx", "-e", "try{require.resolve('eslint');process.exit(1)}catch{console.log('runtime loader present; dev tooling absent')}"]);
    assert.equal((await fetch(url + "/api/jobs")).status, 401);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || undefined });
    const context = await browser.newContext(), page = await context.newPage();
    await page.goto(url + "/login");
    await page.getByLabel("帳號", { exact: true }).fill("container.staff");
    await page.getByLabel("密碼", { exact: true }).fill("synthetic-container-password");
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hermes 指揮台", exact: true })).toBeVisible();
    assert.equal((await context.request.get(url + "/api/jobs")).status(), 200);
    assert.equal((await context.request.get(url + "/api/admin/users")).status(), 403);
    const job = await context.request.post(url + "/api/jobs", { headers: { origin: url }, data: { goal: "Synthetic container planning qualification", team: "development" } });
    assert.equal(job.status(), 201);
    assert.equal((await job.json()).status, "PLANNING"); // No live worker/model is implied.
    compose(["exec", "-T", "db", "psql", "-U", "agentos", "-d", "agentos", "-v", "ON_ERROR_STOP=1"], 'UPDATE "User" SET "isActive"=false,"authRevision"="authRevision"+1 WHERE id=\'container-staff\';');
    assert.equal((await context.request.get(url + "/api/jobs")).status(), 401);
    console.log("Production container qualification passed: non-root/read-only web, migrated disposable PostgreSQL, real local login, teacher scope, job persistence, session revocation and runtime loader without dev tooling. No Spark/model/Portal/deployment claim.");
  } finally {
    await browser?.close();
    // Only this generated qualification project's disposable containers/volume.
    compose(["down", "--volumes", "--remove-orphans"]);
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Container qualification failed"); process.exitCode = 1; });

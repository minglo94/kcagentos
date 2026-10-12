import test from "node:test";
import assert from "node:assert/strict";
import { CodexAdapter, handleCodexRequest, isolatedCodexEnvironment } from "../src/lib/office/codex";
import type { RpcTransport, RpcEvent } from "../src/lib/office/rpc";
import { mkdtempSync, mkdirSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("launch environment requires an isolated empty profile and rejects project configuration", () => {
  const root = mkdtempSync(join(tmpdir(), "agentos-test-"));
  const home = join(root, "agentos-codex"); const project = join(root, "project");
  mkdirSync(home); mkdirSync(project);
  try {
    assert.throws(() => isolatedCodexEnvironment(undefined, project), /dedicated/);
    assert.throws(() => isolatedCodexEnvironment(root, project), /dedicated/);
    process.env.KCAGENTOS_TEST_SECRET = "secret";
    const env = isolatedCodexEnvironment(home, project);
    assert.equal(env.CODEX_HOME, home); assert.equal(env.HOME, home); assert.equal(env.KCAGENTOS_TEST_SECRET, undefined);
    writeFileSync(join(home, "config.toml"), "# Dedicated empty profile\n");
    isolatedCodexEnvironment(home, project);
    writeFileSync(join(home, "config.toml"), "[mcp_servers.external]\ncommand='unsafe'\n");
    assert.throws(() => isolatedCodexEnvironment(home, project), /configuration/);
    rmSync(join(home, "config.toml")); mkdirSync(join(home, "plugins"));
    assert.throws(() => isolatedCodexEnvironment(home, project), /customization/);
    rmdirSync(join(home, "plugins")); mkdirSync(join(project, ".codex")); writeFileSync(join(project, ".codex", "config.toml"), "");
    assert.throws(() => isolatedCodexEnvironment(home, project), /Project/);
  } finally { delete process.env.KCAGENTOS_TEST_SECRET; rmSync(root, { recursive: true, force: true }); }
});

test("approval requests deny by default and fail closed", async () => {
  for (const method of ["item/commandExecution/requestApproval", "item/fileChange/requestApproval"]) {
    assert.deepEqual(await handleCodexRequest({ method }), { decision: "decline" });
    assert.deepEqual(await handleCodexRequest({ method }, async () => { throw new Error("private"); }), { decision: "decline" });
    assert.deepEqual(await handleCodexRequest({ method }, async () => "accept"), { decision: "accept" });
  }
  assert.equal(await handleCodexRequest({ method: "item/permissions/requestApproval" }), undefined);
});
test("adapter initializes, starts read-only thread, streams events, and interrupts explicitly", async () => {
  const calls: { method: string; params?: unknown }[] = [];
  let listener: ((event: RpcEvent) => void) | undefined;
  let disposed = false;
  const transport: RpcTransport = {
    async request<T>(method: string, params?: unknown) {
      calls.push({ method, params });
      return (method === "thread/start" ? { thread: { id: "thread-1" } } : { turn: { id: "turn-1", status: "inProgress" } }) as T;
    },
    notify(method, params) { calls.push({ method, params }); },
    subscribe(callback) { listener = callback; return () => { listener = undefined; }; },
    dispose() { disposed = true; },
  };
  const adapter = new CodexAdapter(transport);
  await adapter.initialize();
  assert.equal(calls[0].method, "initialize"); assert.equal(calls[1].method, "initialized");
  assert.equal(await adapter.startThread("C:/workspace"), "thread-1");
  assert.deepEqual(calls[2].params, { cwd: "C:/workspace", sandbox: "read-only", approvalPolicy: "on-request", approvalsReviewer: "user" });
  const events: RpcEvent[] = [];
  const unsubscribe = adapter.subscribe(event => events.push(event));
  await adapter.startTurn("thread-1", "Inspect only");
  listener?.({ method: "item/agentMessage/delta", params: { delta: "hello" } });
  assert.equal(events.length, 1);
  await adapter.interrupt("thread-1", "turn-1");
  assert.deepEqual(calls.at(-1), { method: "turn/interrupt", params: { threadId: "thread-1", turnId: "turn-1" } });
  unsubscribe(); adapter.dispose(); assert.equal(disposed, true);
});

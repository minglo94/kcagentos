import test from "node:test";
import assert from "node:assert/strict";
import { StdioRpcTransport } from "../src/lib/office/rpc";

const fixture = `const rl=require('node:readline').createInterface({input:process.stdin});
rl.on('line', line=>{const m=JSON.parse(line);const send=m=>process.stdout.write(JSON.stringify(m)+'\\n');
if(m.method==='echo')setTimeout(()=>send({id:m.id,result:m.params}),m.params.delay);
if(m.method==='error')send({id:m.id,error:{code:1,message:'SECRET'}});
if(m.method==='environment')send({id:m.id,result:{profile:process.env.CODEX_HOME,secret:process.env.KCAGENTOS_TEST_SECRET??null}});
if(m.method==='close')process.exit(0);
if(m.method==='invalid')process.stdout.write('SECRET invalid\\n');
if(m.method==='event') {send({method:'turn/completed',params:{ok:true}});send({id:m.id,result:true});}
if(m.method==='approval') {global.original=m.id;send({id:'approval-1',method:'item/fileChange/requestApproval',params:{}});}
if(m.id==='approval-1')send({id:global.original,result:m.result});});`;
const create = (onRequest?: ConstructorParameters<typeof StdioRpcTransport>[2]) => new StdioRpcTransport(process.execPath, ["-e", fixture], onRequest);

test("correlates concurrent out-of-order responses and delivers notifications", async () => {
  const rpc = create();
  try {
    const events: string[] = [];
    const unsubscribe = rpc.subscribe(event => events.push(event.method));
    const results = await Promise.all([rpc.request("echo", { delay: 30, value: "first" }), rpc.request("echo", { delay: 1, value: "second" })]);
    assert.deepEqual(results, [{ delay: 30, value: "first" }, { delay: 1, value: "second" }]);
    await rpc.request("event"); assert.deepEqual(events, ["turn/completed"]); unsubscribe();
  } finally { rpc.dispose(); }
});
test("server requests receive host response", async () => {
  const rpc = create({ onRequest: async () => ({ decision: "decline" }) });
  try { assert.deepEqual(await rpc.request("approval"), { decision: "decline" }); } finally { rpc.dispose(); }
});
test("timeouts and cancellation remove pending calls without exposing remote errors", async () => {
  const rpc = create();
  try {
    await assert.rejects(rpc.request("error"), { message: "RPC server rejected request" });
    await assert.rejects(rpc.request("never", {}, { timeoutMs: 5 }), /timed out/);
    const controller = new AbortController();
    const pending = rpc.request("never", {}, { signal: controller.signal }); controller.abort();
    await assert.rejects(pending, /cancelled/);
    assert.equal(await rpc.request("event"), true);
  } finally { rpc.dispose(); }
});
test("close and invalid protocol reject pending requests with sanitized errors", async () => {
  for (const method of ["close", "invalid"]) {
    const rpc = create();
    await assert.rejects(rpc.request(method), { message: method === "close" ? "RPC process closed" : "Invalid RPC response" });
    await assert.rejects(rpc.request("echo"), /transport closed/); rpc.dispose();
  }
});
test("spawn failure and dispose settle pending work", async () => {
  const missing = new StdioRpcTransport("kcagentos-nonexistent-executable", []);
  await assert.rejects(missing.request("x"), /could not start/); missing.dispose();
  const rpc = create(); const pending = rpc.request("never"); rpc.dispose();
  await assert.rejects(pending, /disposed/);
});
test("explicit child environment does not inherit parent secrets", async () => {
  process.env.KCAGENTOS_TEST_SECRET = "must-not-inherit";
  const rpc = create({ env: { NODE_ENV: "test", CODEX_HOME: "isolated-profile" } });
  try { assert.deepEqual(await rpc.request("environment"), { profile: "isolated-profile", secret: null }); }
  finally { rpc.dispose(); delete process.env.KCAGENTOS_TEST_SECRET; }
});

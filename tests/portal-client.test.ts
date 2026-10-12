import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { createPortalClient, PortalError } from "../src/lib/office/portal-client";
import { hashPortalRequest, portalInputSchema, type PortalRequest, type PortalResponse } from "../src/lib/office/portal-contract";

const serviceToken = "test-service-token-do-not-log";
const assertionSecret = "test-assertion-secret-at-least-thirty-two-bytes";
const data = { parentJobId: "job-123", planVersion: 1, stepKey: "daily-summary", idempotencyKey: "deterministic-key-123",
  staff: { subject: "staff-123", email: "teacher@example.test" }, workflowVersion: 1 as const,
  capability: "class.daily-summary.draft" as const, input: { classRef: "class-1", sourceBatchRef: "batch-1", date: "2026-10-12" } };
const request: PortalRequest = { ...data, requestHash: hashPortalRequest(data) };
const result = (overrides: Partial<PortalResponse> = {}): PortalResponse => ({ operationId: "op-1", parentJobId: request.parentJobId,
  idempotencyKey: request.idempotencyKey, requestHash: request.requestHash, revision: 1, status: "ACCEPTED", ...overrides });
const json = (res: ServerResponse, value: unknown, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
const code = (expected: string) => (error: unknown) => error instanceof PortalError && error.message === expected && error.code === expected;

async function server(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>) {
  const instance = createServer((req, res) => { Promise.resolve(handler(req, res)).catch(() => { res.writeHead(500); res.end(); }); });
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
  const address = instance.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture address");
  const origin = `http://127.0.0.1:${address.port}`;
  return { origin, client: createPortalClient({ baseUrl: origin, serviceToken, assertionSecret }),
    close: async () => { instance.closeAllConnections(); await new Promise<void>((resolve, reject) => instance.close((e) => e ? reject(e) : resolve())); } };
}

test("Portal signs the exact method/path/body and fresh staff assertions on each retry and reconciliation", async () => {
  const assertions: Record<string, unknown>[] = [];
  const received: string[] = [];
  const fixture = await server(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.equal(req.headers.authorization, `Bearer ${serviceToken}`);
    const encoded = String(req.headers["x-agentos-assertion"]);
    assert.equal(req.headers["x-agentos-signature"], createHmac("sha256", assertionSecret).update(encoded).digest("hex"));
    const assertion = JSON.parse(Buffer.from(encoded, "base64url").toString());
    assert.equal(assertion.issuer, "agentos");
    assert.equal(assertion.subject, request.staff.subject);
    assert.equal(assertion.email, request.staff.email);
    assert.equal(assertion.method, req.method);
    assert.equal(assertion.path, req.url);
    assert.equal(assertion.bodyHash, createHash("sha256").update(body).digest("hex"));
    assert.ok(Math.abs(Number(assertion.timestamp) - Date.now() / 1000) < 3);
    assertions.push(assertion);
    received.push(body);
    json(res, result());
  });
  try {
    await fixture.client.submit(request);
    await fixture.client.submit(request);
    await fixture.client.lookup(request);
    assert.equal(assertions[0].audience, fixture.origin);
    assert.equal(new Set(assertions.map((x) => x.nonce)).size, 3);
    assert.equal(received[0], received[1]);
    assert.equal(received[2], "");
    assert.equal(assertions[2].path, `/api/agentos/v1/operations/by-key/${request.idempotencyKey}`);
  } finally { await fixture.close(); }
});

test("Portal reports denied and conflict without exposing remote errors; lookup 404 reconciles as absent", async () => {
  let status = 401;
  const fixture = await server((_req, res) => json(res, { error: "private-student-or-token" }, status));
  try {
    for (status of [401, 403]) await assert.rejects(fixture.client.submit(request), code("PORTAL_ACCESS_DENIED"));
    status = 409;
    await assert.rejects(fixture.client.submit(request), code("PORTAL_CONFLICT"));
    status = 404;
    assert.equal(await fixture.client.lookup(request), null);
    await assert.rejects(fixture.client.submit(request), code("PORTAL_RESULT_UNKNOWN"));
    status = 500;
    await assert.rejects(fixture.client.submit(request), code("PORTAL_RESULT_UNKNOWN"));
  } finally { await fixture.close(); }
});

test("Portal refuses redirects without forwarding credentials to another origin", async () => {
  let redirected = 0;
  const destination = await server((_req, res) => { redirected++; json(res, result()); });
  const fixture = await server((_req, res) => { res.writeHead(307, { Location: destination.origin }); res.end(); });
  try { await assert.rejects(fixture.client.submit(request), code("PORTAL_RESULT_UNKNOWN")); assert.equal(redirected, 0); }
  finally { await fixture.close(); await destination.close(); }
});

test("Portal caps declared and streamed bodies and rejects malformed or unredacted responses", async () => {
  let mode = "declared";
  const fixture = await server((_req, res) => {
    if (mode === "declared") { res.writeHead(200, { "Content-Type": "application/json", "Content-Length": 65537 }); res.end("{}"); }
    else if (mode === "stream") { res.writeHead(200, { "Content-Type": "application/json" }); res.write(" ".repeat(40000)); res.end(" ".repeat(30000)); }
    else if (mode === "malformed") { res.writeHead(200, { "Content-Type": "application/json" }); res.end("not-json-private-message"); }
    else if (mode === "type") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("private-html"); }
    else json(res, { ...result(), students: [{ name: "private" }] });
  });
  try { for (mode of ["declared", "stream", "malformed", "type", "students"]) await assert.rejects(fixture.client.submit(request), code("PORTAL_INVALID_RESPONSE")); }
  finally { await fixture.close(); }
});

test("Portal binds replies to the job, key, hash, source and monotonic operation revision", async () => {
  let response: unknown = result();
  const fixture = await server((_req, res) => json(res, response));
  try {
    for (const changed of [{ parentJobId: "other-job" }, { idempotencyKey: "other-idempotent-key" }, { requestHash: "a".repeat(64) },
      { evidence: { sourceRef: "other-batch", asOf: "2026-10-12T01:00:00Z" } }]) {
      response = result(changed);
      await assert.rejects(fixture.client.submit(request), code("PORTAL_INVALID_RESPONSE"));
    }
    response = result({ revision: 2, status: "RUNNING" });
    await fixture.client.submit(request);
    response = result();
    await assert.rejects(fixture.client.lookup(request), code("PORTAL_INVALID_RESPONSE"));
    response = result({ revision: 2, status: "FAILED" });
    await assert.rejects(fixture.client.lookup(request), code("PORTAL_INVALID_RESPONSE"));
    response = result({ revision: 3, operationId: "other-operation" });
    await assert.rejects(fixture.client.lookup(request), code("PORTAL_INVALID_RESPONSE"));
    response = result({ revision: 3, status: "FAILED" });
    assert.equal((await fixture.client.lookup(request))?.status, "FAILED");
    response = result({ revision: 4, status: "RUNNING" });
    await assert.rejects(fixture.client.lookup(request), code("PORTAL_INVALID_RESPONSE"));
  } finally { await fixture.close(); }
});

test("Portal draft readiness requires complete reconciled checks and an artifact", async () => {
  let evidence: unknown = { sourceRef: "batch-1", artifactRef: "artifact-1", asOf: "2026-10-12T01:00:00Z" };
  const fixture = await server((_req, res) => json(res, { ...result({ status: "DRAFT_READY" }), evidence }));
  try {
    await assert.rejects(fixture.client.submit(request), code("PORTAL_INVALID_RESPONSE"));
    const checks = { complete: true, identityMatched: true, dateMatched: true, sourceRows: 20, reconciledRows: 19 };
    evidence = { ...(evidence as object), checks };
    await assert.rejects(fixture.client.submit(request), code("PORTAL_INVALID_RESPONSE"));
    evidence = { ...(evidence as object), checks: { ...checks, reconciledRows: 20 } };
    assert.equal((await fixture.client.submit(request)).status, "DRAFT_READY");
  } finally { await fixture.close(); }
});

test("Portal timeouts and caller cancellation produce sanitized unknown results", async () => {
  const fixture = await server((_req, _res) => {});
  try {
    const client = createPortalClient({ baseUrl: fixture.origin, serviceToken, assertionSecret, timeoutMs: 20 });
    await assert.rejects(client.submit(request), code("PORTAL_RESULT_UNKNOWN"));
    const controller = new AbortController(); controller.abort(new Error("private-cancel-reason"));
    await assert.rejects(client.lookup(request, controller.signal), code("PORTAL_RESULT_UNKNOWN"));
  } finally { await fixture.close(); }
});

test("Portal validates configuration, real dates and request hashes before any network action", async () => {
  for (const baseUrl of ["http://example.test", "https://user:secret@example.test", "https://example.test/prefix", "https://example.test?token=x", "https://example.test#fragment", "file:///tmp/test"]) {
    assert.throws(() => createPortalClient({ baseUrl, serviceToken, assertionSecret }), code("PORTAL_NOT_CONFIGURED"));
  }
  assert.equal(portalInputSchema.safeParse({ ...data.input, date: "2026-02-29" }).success, false);
  assert.equal(portalInputSchema.safeParse({ ...data.input, date: "2028-02-29" }).success, true);
  assert.equal(hashPortalRequest({ ...data, input: { date: data.input.date, sourceBatchRef: "batch-1", classRef: "class-1" } }), request.requestHash);
  let called = false;
  const fixture = await server((_req, res) => { called = true; json(res, result()); });
  try { await assert.rejects(fixture.client.submit({ ...request, requestHash: "a".repeat(64) }), code("PORTAL_INVALID_REQUEST")); assert.equal(called, false); }
  finally { await fixture.close(); }
});

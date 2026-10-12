import { createHash, createHmac, randomUUID } from "node:crypto";
import { hashPortalRequest, portalRequestSchema, portalResponseSchema, type PortalClient, type PortalRequest, type PortalResponse } from "./portal-contract";
export type { PortalClient, PortalRequest, PortalResponse } from "./portal-contract";

export type PortalErrorCode = "PORTAL_NOT_CONFIGURED" | "PORTAL_INVALID_REQUEST" | "PORTAL_INVALID_RESPONSE" | "PORTAL_ACCESS_DENIED" | "PORTAL_CONFLICT" | "PORTAL_RESULT_UNKNOWN";
export class PortalError extends Error {
  constructor(public readonly code: PortalErrorCode) { super(code); }
}
export interface PortalClientConfig { baseUrl: string; serviceToken: string; assertionSecret: string; timeoutMs?: number; deploymentBypassSecret?: string }
const MAX_BODY_BYTES = 64 * 1024;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function validatedConfig(config: PortalClientConfig) {
  try {
    const url = new URL(config.baseUrl);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)
      || !(url.protocol === "https:" || (url.protocol === "http:" && loopback))
      || config.serviceToken.length < 16 || /[\r\n]/.test(config.serviceToken)
      || (config.deploymentBypassSecret && (!url.hostname.endsWith(".vercel.app") || url.protocol !== "https:" || /[\r\n]/.test(config.deploymentBypassSecret)))
      || config.assertionSecret.length < 32 || !Number.isInteger(config.timeoutMs ?? 15_000)
      || (config.timeoutMs ?? 15_000) < 1 || (config.timeoutMs ?? 15_000) > 120_000) throw new Error();
    return { ...config, origin: url.origin, timeoutMs: config.timeoutMs ?? 15_000 };
  } catch { throw new PortalError("PORTAL_NOT_CONFIGURED"); }
}

export function createPortalClient(config: PortalClientConfig): PortalClient {
  const settings = validatedConfig(config);
  // Reject stale revisions within this client. Persistent consumers additionally
  // fence updates against their stored revision, including across worker restarts.
  const revisions = new Map<string, { operationId: string; revision: number; status: PortalResponse["status"]; encoded: string }>();

  async function call(request: PortalRequest, method: "POST" | "GET", signal?: AbortSignal): Promise<PortalResponse | null> {
    const parsed = portalRequestSchema.safeParse(request);
    if (!parsed.success || hashPortalRequest(parsed.data) !== parsed.data.requestHash) throw new PortalError("PORTAL_INVALID_REQUEST");
    request = parsed.data;
    const path = method === "POST" ? "/api/agentos/v1/operations" : `/api/agentos/v1/operations/by-key/${encodeURIComponent(request.idempotencyKey)}`;
    const body = method === "POST" ? JSON.stringify(request) : "";
    const assertion = Buffer.from(JSON.stringify({ issuer: "agentos", audience: settings.origin,
      subject: request.staff.subject, email: request.staff.email, method, path, bodyHash: sha256(body),
      timestamp: Math.floor(Date.now() / 1000), nonce: randomUUID() })).toString("base64url");
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, settings.timeoutMs);
    try {
      const response = await fetch(new URL(path, settings.origin), { method, body: body || undefined,
        headers: { Authorization: `Bearer ${settings.serviceToken}`, "Content-Type": "application/json",
          "X-AgentOS-Assertion": assertion,
          "X-AgentOS-Signature": createHmac("sha256", settings.assertionSecret).update(assertion).digest("hex"),
          ...(settings.deploymentBypassSecret ? { "x-vercel-protection-bypass": settings.deploymentBypassSecret } : {}) },
        redirect: "error", cache: "no-store", signal: controller.signal });
      if (response.status === 401 || response.status === 403) { await response.body?.cancel(); throw new PortalError("PORTAL_ACCESS_DENIED"); }
      if (response.status === 409) { await response.body?.cancel(); throw new PortalError("PORTAL_CONFLICT"); }
      if (response.status === 404 && method === "GET") { await response.body?.cancel(); return null; }
      if (!response.ok) { await response.body?.cancel(); throw new PortalError("PORTAL_RESULT_UNKNOWN"); }
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
        await response.body?.cancel(); throw new PortalError("PORTAL_INVALID_RESPONSE");
      }
      const declared = response.headers.get("content-length");
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
        await response.body?.cancel(); throw new PortalError("PORTAL_INVALID_RESPONSE");
      }
      if (!response.body) throw new PortalError("PORTAL_INVALID_RESPONSE");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          bytes += next.value.length;
          if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new PortalError("PORTAL_INVALID_RESPONSE"); }
          chunks.push(next.value);
        }
      } finally { reader.releaseLock(); }
      let result: PortalResponse;
      try { result = portalResponseSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { throw new PortalError("PORTAL_INVALID_RESPONSE"); }
      if (result.parentJobId !== request.parentJobId || result.idempotencyKey !== request.idempotencyKey || result.requestHash !== request.requestHash
        || (result.evidence && result.evidence.sourceRef !== request.input.sourceBatchRef)) {
        throw new PortalError("PORTAL_INVALID_RESPONSE");
      }
      const previous = revisions.get(request.idempotencyKey);
      const encoded = JSON.stringify(result);
      if (previous && (result.operationId !== previous.operationId || result.revision < previous.revision
        || (["DRAFT_READY", "FAILED"].includes(previous.status) && result.status !== previous.status)
        || (result.revision === previous.revision && encoded !== previous.encoded))) throw new PortalError("PORTAL_INVALID_RESPONSE");
      revisions.delete(request.idempotencyKey);
      revisions.set(request.idempotencyKey, { operationId: result.operationId, revision: result.revision, status: result.status, encoded });
      // The worker's persistent ledger supplies authoritative fencing after
      // eviction or restart; avoid an unbounded cache in long-lived workers.
      if (revisions.size > 1024) revisions.delete(revisions.keys().next().value!);
      return result;
    } catch (error) {
      if (error instanceof PortalError) throw error;
      // No response bodies, credentials, destination URLs or transport messages.
      throw new PortalError("PORTAL_RESULT_UNKNOWN");
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  }
  return { submit: async (request, signal) => (await call(request, "POST", signal))!, lookup: (request, signal) => call(request, "GET", signal) };
}

export function loadPortalClient(): PortalClient {
  return createPortalClient({ baseUrl: process.env.PORTAL_BASE_URL ?? "", serviceToken: process.env.PORTAL_SERVICE_TOKEN ?? "", assertionSecret: process.env.PORTAL_ASSERTION_SECRET ?? "", deploymentBypassSecret: process.env.PORTAL_AUTOMATION_BYPASS_SECRET });
}

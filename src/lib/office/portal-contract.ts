import { createHash } from "node:crypto";
import { z } from "zod";

// Only opaque references cross this boundary. Portal independently maps the
// asserted staff identity, checks school permissions and validates source data.
// The service token and signed assertion never grant school permissions.
const ref = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const key = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
});
export const portalInputSchema = z.object({ classRef: ref, sourceBatchRef: ref, date }).strict();
export type PortalInput = z.infer<typeof portalInputSchema>;

const requestWithoutHashSchema = z.object({
  parentJobId: ref,
  planVersion: z.number().int().positive().max(2_147_483_647),
  stepKey: ref,
  idempotencyKey: key,
  staff: z.object({ subject: ref, email: z.string().email().max(254) }).strict(),
  workflowVersion: z.literal(1),
  capability: z.literal("class.daily-summary.draft"),
  input: portalInputSchema,
}).strict();
export const portalRequestSchema = requestWithoutHashSchema.extend({ requestHash: digest }).strict();
export type PortalRequest = z.infer<typeof portalRequestSchema>;

/** Hash the normalized contract, not arbitrary object insertion order. */
export function hashPortalRequest(request: z.infer<typeof requestWithoutHashSchema> | PortalRequest): string {
  const { requestHash: _ignored, ...data } = request as PortalRequest;
  return createHash("sha256").update(JSON.stringify(requestWithoutHashSchema.parse(data))).digest("hex");
}

export const portalResponseSchema = z.object({
  operationId: ref,
  parentJobId: ref,
  idempotencyKey: key,
  requestHash: digest,
  revision: z.number().int().positive().max(2_147_483_647),
  status: z.enum(["ACCEPTED", "RUNNING", "WAITING_CONTENT_APPROVAL", "DRAFT_READY", "FAILED", "RESULT_UNKNOWN"]),
  evidence: z.object({ sourceRef: ref, artifactRef: ref.optional(), asOf: z.string().datetime({ offset: true }),
    checks: z.object({ complete: z.boolean(), identityMatched: z.boolean(), dateMatched: z.boolean(),
      sourceRows: z.number().int().nonnegative().max(10_000_000), reconciledRows: z.number().int().nonnegative().max(10_000_000) }).strict().optional(),
  }).strict().optional(),
  approvalRef: ref.optional(),
}).strict().superRefine((value, ctx) => {
  const checks = value.evidence?.checks;
  if (value.status === "DRAFT_READY" && (!value.evidence?.artifactRef || !checks?.complete
    || !checks.identityMatched || !checks.dateMatched || checks.sourceRows !== checks.reconciledRows)) {
    ctx.addIssue({ code: "custom", message: "Draft requires artifact evidence", path: ["evidence"] });
  }
  if (value.status === "WAITING_CONTENT_APPROVAL" && !value.approvalRef) {
    ctx.addIssue({ code: "custom", message: "Pending approval requires a reference", path: ["approvalRef"] });
  }
});
export type PortalResponse = z.infer<typeof portalResponseSchema>;

/**
 * POST /api/agentos/v1/operations; retry with the identical request/key.
 * GET /api/agentos/v1/operations/by-key/{key} reconciles an ambiguous POST.
 * Portal binds keys to requestHash, returns 409 for changed payloads and retains
 * monotonic revisions. No endpoint here approves content or sends messages.
 * Headers: Authorization: Bearer <service token>, X-AgentOS-Assertion: base64url
 * JSON, X-AgentOS-Signature: hex HMAC-SHA256 over that exact encoded assertion.
 * Assertion fields: issuer, audience (origin), subject, email, method, path,
 * bodyHash (SHA256 exact transmitted body), timestamp (Unix seconds), nonce.
 * Portal verifies signature, audience, freshness and unused nonce before staff
 * mapping/authorization; repeating a request gets a new assertion/nonce.
 */
export interface PortalClient {
  submit(request: PortalRequest, signal?: AbortSignal): Promise<PortalResponse>;
  lookup(request: PortalRequest, signal?: AbortSignal): Promise<PortalResponse | null>;
}

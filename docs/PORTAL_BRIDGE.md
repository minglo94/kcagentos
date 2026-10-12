# Portal draft bridge v1

Implemented on the AgentOS side, 2026-10-12. Keichi Local now has a separate repository and test deployment work. Its existing legacy bridge accepts raw synthetic rows; this new reference-only contract is being aligned on an isolated Portal branch. Production pairing has not been configured. These HTTP and database tests use synthetic fixtures; live school workflow and sending acceptance remain pending.

## Supported operation

`/office` has a class daily-summary draft template. Staff enter opaque Portal class/batch references and a source date. AgentOS saves a fixed v1 plan, exposes those inputs for approval, and dispatches only the approved version. No model is needed for this fixed template; the UI explicitly identifies it as a template. Free-form Hermes plans still require the model configuration.

The only capability is `class.daily-summary.draft`. Portal must validate completeness, identity, date and source/reconciled row totals. `DRAFT_READY` needs an artifact reference and all checks passing; it means this draft goal succeeded, not that content was approved or any email was sent. No send or content-approval API is provided by this bridge.

## Pairing and staff authorization

Set server-only `PORTAL_BASE_URL`, `PORTAL_SERVICE_TOKEN` (16+ characters), `PORTAL_ASSERTION_SECRET` (32+ characters). Use an explicit HTTPS origin or loopback HTTP, without credentials, path, query or fragment. Redirects are rejected. Store secrets outside Git and supervisor/model context. Start the separate office Worker after applying the additive PortalOperation migration.

The service token identifies the integration. It does not authorize student access. Each call carries a fresh HMAC-SHA256 signed staff assertion. Portal must verify trusted issuer `agentos`, configured audience, signature, allowed clock skew, nonce replay protection, method/path/body hash and the authenticated service. Then independently map the asserted `(issuer, subject, email)` to a provisioned, active Portal staff account and enforce class/capability permissions. Never auto-create school permissions from email, role text or a valid service signature. Deny unmapped/disabled/out-of-scope staff.

AgentOS checks its own active staff before dispatch. Portal owns the definitive staff/data authorization, content version and approval records. Receiving a signed request does not bypass these checks.

## HTTP contract

Schemas and exact assertion details: `src/lib/office/portal-contract.ts`.

- `POST /api/agentos/v1/operations`: accepted request includes parentJobId, planVersion, stepKey, idempotencyKey, requestHash, staff, workflowVersion=1, capability and bounded input.
- `GET /api/agentos/v1/operations/by-key/{key}`: reconcile the same operation after restarts or uncertain responses. Portal must apply staff scope to lookup too.
- `Authorization: Bearer <service token>`, `X-AgentOS-Assertion` (base64url JSON), `X-AgentOS-Signature` (hex HMAC over that exact assertion).
- Response includes correlated IDs/hash, monotonic revision, status, optional approvalRef and bounded opaque evidence. Raw student fields, report bodies, recipients and arbitrary URLs are rejected.
- 401/403 deny access; 409 rejects changed key/payload; lookup 404 means absent only when no previously accepted operation is known locally. Responses have a 64KB cap and a timeout; errors never expose remote bodies or secrets.

Portal atomically binds the idempotency key to the normalized request hash; same-key replay returns the same operation, changed payload returns 409. Preserve operation records/tombstones for the agreed recovery period. Repeated calls use fresh assertion nonces but the same business key. Source and artifact content stays in Portal.

## Recovery, approvals and UI

AgentOS persists PortalOperation before HTTP. The ledger is independent of OfficeStep and survives replanning. Returned operation IDs and revisions cannot change or regress; terminal states cannot revert. An accepted response remains recorded if pause/cancel happens in flight, while the parent job update is lease-fenced. Expired workers cannot overwrite job status with late errors.

Accepted/running/pending content approval/unknown results enter WAITING_PORTAL. The user can request reconciliation with “核實 Portal 最新結果”; no busy polling or repeated external action is scheduled. Manual evidence cannot complete a Portal step. Open/unknown operations prevent replanning that could accidentally duplicate them. If a previously accepted operation returns 404, preserve uncertainty and investigate in Portal; do not blindly POST again.

Cancellation stops parent dispatch. It does not revoke or undo an already accepted Portal operation. Portal staff handle that operation under its own permissions. The dashboard displays approval references and evidence only; content review/approval occurs in Portal for this milestone. Unified permission-checked preview/approval forwarding is a later increment.

## Verification and remaining gates

Tests cover real loopback HTTP authentication/signatures, redirects, response bounds, correlation, revision, denial and timeouts; database tests cover plan approval, ownership, manual-evidence rejection, same-key reconciliation, JSONB replay, cancelled parent fencing, old-ledger retention and missing pairing. Browser regression covers template creation and version approval alongside existing office flows.

Database fixtures use single-backend PGlite; qualify PostgreSQL concurrent workers separately. Real school Google login, Portal nonce/permission enforcement and actual source calculations must be tested in the separate Portal runtime. Next steps: implement that runtime contract, pair it with dedicated credentials, run synthetic complete class-summary workflow, then authorized small real-data pilot. Content/send approvals and outbox must pass before any cron or live delivery is enabled.

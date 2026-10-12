# Current milestone — 2026-10-12

Read the implementation branch `codex/agentos-foundation` and [PR #13](https://github.com/minglo94/kcagentos/pull/13) before continuing. Default-branch historical tasks are not evidence of current implementation.

Dependency repair: npm audit reports 0; Next 15/NextAuth/Tailwind/PostCSS and DOCX/Excel regression verified. AgentOS-side draft bridge is implemented with persistent operation correlation, signed staff requests, bounded transport and uncertain-result reconciliation. 35 Node/database/HTTP/document tests, typecheck, browser E2E and full build pass; one existing lint warning remains.

Keichi Local now exists as a separate Portal repo and is being tested by its own chat. Its reference-only receiver is implemented in an isolated branch; actual client → receiver HTTP verification passes with synthetic in-memory storage. These changes are isolated from that chat's deployment checkout. Pairing credentials, real source data, school SSO and PostgreSQL concurrency remain acceptance gates. No live student data, sends, business cron or AgentOS deployment was enabled here. Results apply to the implementation branch; default-branch application code is not upgraded until the PR is merged.

Implementation setup and detailed handover are on the branch: `docs/PORTAL_BRIDGE.md`, `docs/DEPENDENCY_REPAIR.md`, `tasks/handover.md`. Pixel Agents and night cron follow complete, verified school workflows.

Portal receiver is now reviewable in its separate private draft PR #1, branch `codex/agentos-reference-bridge`, commit `5bb6a60`. Its Prisma/typecheck and full npm test pass; native PostgreSQL and configured deployment pairing are still unverified. The Portal installation reported 7 inherited high advisories: fix those before formal release. The AgentOS audit result applies only to AgentOS.

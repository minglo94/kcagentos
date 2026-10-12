# Current milestone — 2026-10-12

Read the implementation branch `codex/agentos-foundation` and [PR #13](https://github.com/minglo94/kcagentos/pull/13) before continuing. Default-branch historical tasks are not evidence of current implementation.

Dependency repair: npm audit reports 0; Next 15/NextAuth/Tailwind/PostCSS and DOCX/Excel regression verified. AgentOS-side draft bridge is implemented with persistent operation correlation, signed staff requests, bounded transport and uncertain-result reconciliation. 35 Node/database/HTTP/document tests, typecheck, browser E2E and full build pass; one existing lint warning remains.

Keichi Local now exists as a separate Portal repo and is being tested by its own chat. Its older raw-row bridge needs alignment with the new reference-only contract. The receiving changes are isolated from that chat's deployment checkout. Pairing credentials, real source data, school SSO and PostgreSQL concurrency remain acceptance gates. No live student data, sends, business cron or AgentOS deployment was enabled here.

Implementation setup and detailed handover are on the branch: `docs/PORTAL_BRIDGE.md`, `docs/DEPENDENCY_REPAIR.md`, `tasks/handover.md`. Pixel Agents and night cron follow complete, verified school workflows.

# Protected Vercel test deployment — 2026-10-13

User authorized merging both integration PRs to main and deployment/testing, and selected synthetic test login while Google OAuth remains pending.

AgentOS target is `kcagentos-test`, separate from `keichi-local-test`. Both are on the verified owner team. Connector project creation returned 403; the same-team authenticated Vercel CLI fallback created the AgentOS project. Protected preview deployment is used; deployment protection is not disabled.

AgentOS has a separate Neon database and login role, plus a fixed synthetic reviewer. Portal has a separately provisioned synthetic teacher, scoped synthetic class and local source operation. Pairing asserts the AgentOS subject and that exact Portal staff email; no shared student database or broad staff delegation is introduced.

Synthetic credentials are opt-in: `AGENTOS_TEST_AUTH_ENABLED=true`, fixed `AGENTOS_TEST_AUTH_EMAIL` and salted scrypt-v1 `AGENTOS_TEST_AUTH_PASSWORD_HASH`. Existing active user required; credentials cannot create a user or grant a role. Marker-based test sessions stop working when configuration or account eligibility is revoked. Google sign-in remains pending. Password/hash, database URLs and signing keys stay in encrypted Vercel settings and ignored local verification files.

`PORTAL_AUTOMATION_BYPASS_SECRET` is an optional server-only authorization for Vercel's protected test deployment. The client sends it only to a configured HTTPS `.vercel.app` destination; redirects remain rejected. It does not bypass Portal signature, nonce, staff or class checks. Ordinary browser tests also use an operator-generated protection bypass, rather than exposing the site publicly.

Vercel runs the dashboard/API; it does not host the persistent office Worker or local models. Verification may run individual authorized Worker cycles from the local test host against the separate synthetic cloud database. Closing the local tester must not imply a continuously active worker. Business cron, live email, real student data and live model inference remain disabled.

Post-deployment results, exact merged/deployed SHAs and URLs will be recorded in tasks/handover.md after real cloud acceptance. A local build alone is not deployment success.

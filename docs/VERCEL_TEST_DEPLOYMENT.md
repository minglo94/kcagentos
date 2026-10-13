# Protected Vercel test deployment — 2026-10-13

User authorized merging both integration PRs to main and deployment/testing, and selected synthetic test login while Google OAuth remains pending.

AgentOS target is `kcagentos-test`, separate from `keichi-local-test`. Both are on the verified owner team. Connector project creation returned 403; the same-team authenticated Vercel CLI fallback created the AgentOS project. AgentOS first deployment was assigned the production target in its separate test project; Portal uses an explicit preview target. Both generated URLs retain Vercel authentication protection; deployment protection is not disabled.

AgentOS has a separate Neon database and login role, plus a fixed synthetic reviewer. Portal has a separately provisioned synthetic teacher, scoped synthetic class and local source operation. Pairing asserts the AgentOS subject and that exact Portal staff email; no shared student database or broad staff delegation is introduced.

Synthetic credentials are opt-in: `AGENTOS_TEST_AUTH_ENABLED=true`, fixed `AGENTOS_TEST_AUTH_EMAIL` and salted scrypt-v1 `AGENTOS_TEST_AUTH_PASSWORD_HASH`. Existing active user required; credentials cannot create a user or grant a role. Marker-based test sessions stop working when configuration or account eligibility is revoked. Google sign-in remains pending. Password/hash, database URLs and signing keys stay in encrypted Vercel settings and ignored local verification files.

`PORTAL_AUTOMATION_BYPASS_SECRET` is an optional server-only authorization for Vercel's protected test deployment. The client sends it only to a configured HTTPS `.vercel.app` destination; redirects remain rejected. It does not bypass Portal signature, nonce, staff or class checks. Ordinary browser tests also use an operator-generated protection bypass, rather than exposing the site publicly.

Vercel runs the dashboard/API; it does not host the persistent office Worker or local models. Verification may run individual authorized Worker cycles from the local test host against the separate synthetic cloud database. Closing the local tester must not imply a continuously active worker. Business cron, live email, real student data and live model inference remain disabled.

Post-deployment results, exact merged/deployed SHAs and URLs will be recorded in tasks/handover.md after real cloud acceptance. A local build alone is not deployment success.

## Verified cloud results — 13 October 2026

| Component | Merged application SHA | READY deployment |
| --- | --- | --- |
| AgentOS main | fb9cd031a5e62c1827c43e3b6ec0e5b5078b1449 | dpl_AQ2Jj2VCG2Sq5W5o2DEdy4b9yo7g; https://kcagentos-test.vercel.app |
| Portal main | a4d4d5e970a04e53db6b9b15a836cdf81a2d7e22 | dpl_GAeEgyK7r68uRgykpurqFyhme938; https://keichi-local-test-hzh4ih8gr-locmhy-7651s-projects.vercel.app |

AgentOS first deployment is production-target within the separate test project; Portal is preview. Both retain Vercel authentication. Sign in to the owning Vercel team before using the application's opt-in synthetic credentials form. Test email/password are available only in the ignored local .test-artifacts/test-login.txt, not this public repository.

Actual browser verification passed on the stable AgentOS alias: correct credentials, wrong-password rejection, anonymous 401, hostile Origin 403, desktop/mobile rendering without horizontal overflow. Browser created the fixed class-summary plan, stale hash approval returned 409, then the teacher approved the current plan. Two controlled local Worker cycles against the separate native cloud DB produced DRAFT_READY and SUCCEEDED; reload displayed the persisted Portal evidence and explicitly unsent draft. Raw synthetic student rows and service token were absent from the UI.

Actual AgentOS client → protected Portal route → native PostgreSQL passed complete three-row reconciliation, same-key POST replay, GET reconciliation, changed-payload 409, class-scope 403, unmapped-staff denial and response redaction. Three concurrent initial same-key requests produced one child operation and binding. The child has no content approval, send approval or send result. No email was sent.

Evidence remains in ignored local cloud-browser-result.json, cloud-pair-result.json, cloud-workflow-result.json and screenshots under .test-artifacts. These are bounded synthetic acceptance results, not real school-data/model acceptance.

An initial wrong-project deployment-protection token was rejected before reaching Portal. A fresh token for the verified Portal project fixed pairing without disabling protection. An accidental empty project with only one failed deployment was removed following explicit user confirmation. There was also an intermittent local Worker WORKER_FAILED during testing; a later instrumented run observed P2034 serialization retry and completed with the existing retry logic. Broader Worker transaction/lease contention qualification remains pending; do not describe this as proven continuous production operation.

Next session: run Worker near the selected database/local Portal, qualify concurrency and recovery before unattended cron, configure local model and Google OAuth, then verify authorized school-data flows. Existing Vercel tests do not keep the Worker running.

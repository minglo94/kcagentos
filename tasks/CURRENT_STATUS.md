# Current milestone — 2026-10-13

AgentOS PR13 is merged into main at fb9cd031a5e62c1827c43e3b6ec0e5b5078b1449; main is now the default branch. Portal PR1 is merged at a4d4d5e970a04e53db6b9b15a836cdf81a2d7e22. Read main and tasks/handover.md before continuing; earlier unmerged status is historical.

Both projects report full dependency audit 0. AgentOS: 38 Node/DB/HTTP/document/auth tests, typecheck, browser acceptance and production build passed (one inherited lint warning). Portal: 17 Node tests plus daily-summary/activity/meeting acceptance, typecheck and exact-head GitHub CI including native DB/standalone container acceptance passed (two inherited lint warnings).

Protected Vercel test deployments are READY. AgentOS: https://kcagentos-test.vercel.app ; Portal reference gateway: https://keichi-local-test-hzh4ih8gr-locmhy-7651s-projects.vercel.app . Synthetic credentials login, incorrect-password rejection, anonymous API gates, hostile Origin and desktop/mobile rendering are verified. Actual cloud pairing and approved workflow results are recorded in docs/VERCEL_TEST_DEPLOYMENT.md after acceptance.

The dashboard/API is deployed; the persistent Worker and local models require a local/Spark host. Cloud verification uses individual controlled local Worker cycles against a separate synthetic AgentOS DB. Google OAuth, broad multi-worker concurrency, real student data/eClass/mail, full Pixel Agents animation and business cron remain pending. Portal remains authoritative for content/send approval; no sending tool is enabled by this integration.

Credentials and test screenshots/results are ignored local artifacts; never publish them to GitHub. Test credentials are in .test-artifacts/test-login.txt. Read the protected-deployment guide for access instructions and test limits.

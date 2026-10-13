## Portal-only implementation progress — 13 October 2026

Branch codex/portal-teacher-entry implements Portal teacher submission, exact plan/step confirmation, durable decision/control delivery, scoped progress reconciliation and mapped synthetic draft execution. AgentOS browser is operator-only. Portal independently signs short-lived Ed25519 authority after live scope/decision checks.

Native two-service PostgreSQL synthetic acceptance passed: lost replies, immutable replay, teacher isolation, stale decisions, controls, draft evidence and mapping revocation. AgentOS52 tests/typecheck/lint and Portal tests/typecheck/lint pass. Actual Portal browser and final builds underway. This branch is not yet merged/deployed; older deployments below are a separate milestone.

Hermes is a restricted no-tools planner adapter; no local inference or automatic learning enabled. Progress is durable database state. See docs/HERMES_LEARNING_PLAN.md and docs/PORTAL_TEACHER_ENTRY_QUALIFICATION.md.

## 最新設計修正 — 2026-10-13：Portal 是老師唯一入口

普通老師只在 Portal 提交、批准計劃/行動步驟、確認內容/收件人/發送、追蹤及控制工作。AgentOS 是後台總管及管理/開發指揮台，不能代老師批准。下一步先做 Portal request/outbox→AgentOS authenticated ingress、multi-user mapping、decision relay、進度核實及普通老師 AgentOS 存取拒絕；規格見 docs/PORTAL_TEACHER_ENTRY.md。既有部署仍是舊 AgentOS-entry synthetic pilot，新入口未實作。
# Current milestone — 2026-10-13

AgentOS PR13 is merged into main at fb9cd031a5e62c1827c43e3b6ec0e5b5078b1449; main is now the default branch. Portal PR1 is merged at a4d4d5e970a04e53db6b9b15a836cdf81a2d7e22. Read main and tasks/handover.md before continuing; earlier unmerged status is historical.

Both projects report full dependency audit 0. AgentOS: 38 Node/DB/HTTP/document/auth tests, typecheck, browser acceptance and production build passed (one inherited lint warning). Portal: 17 Node tests plus daily-summary/activity/meeting acceptance, typecheck and exact-head GitHub CI including native DB/standalone container acceptance passed (two inherited lint warnings).

Protected Vercel test deployments are READY. AgentOS: https://kcagentos-test.vercel.app ; Portal reference gateway: https://keichi-local-test-hzh4ih8gr-locmhy-7651s-projects.vercel.app . Synthetic credentials login, incorrect-password rejection, anonymous API gates, hostile Origin and desktop/mobile rendering are verified. Actual cloud pairing and approved workflow results are recorded in docs/VERCEL_TEST_DEPLOYMENT.md after acceptance.

The dashboard/API is deployed; the persistent Worker and local models require a local/Spark host. Cloud verification uses individual controlled local Worker cycles against a separate synthetic AgentOS DB. Google OAuth, broad multi-worker concurrency, real student data/eClass/mail, full Pixel Agents animation and business cron remain pending. Portal remains authoritative for content/send approval; no sending tool is enabled by this integration.

Credentials and test screenshots/results are ignored local artifacts; never publish them to GitHub. Test credentials are in .test-artifacts/test-login.txt. Read the protected-deployment guide for access instructions and test limits.

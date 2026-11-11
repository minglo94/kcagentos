# Dazhi Cloudflare school-account acceptance — 2026-11-11

## Current staging Worker and SSO gap — 2026-11-11

The user's current premise is partly corrected by live checks: the separate `dazhi-migration-spike.kcadmin.workers.dev` staging Worker already has encrypted `AUTH_SECRET`, `STAGING_BASIC_AUTH`, and `STAGING_DATABASE_URL` bindings and reaches the isolated latest Neon candidate. Authenticated health checks returned PostgreSQL 18, 78 tables, and 830 users; `/login` returns 200 behind Basic Auth and 401 without it. These checks establish connectivity and page availability, not user-session or application write acceptance.

`/api/auth/providers` currently lists only `credentials`. The staging Worker has no Google OAuth bindings, and its source policy keeps OAuth callbacks blocked unless the exact staging Google configuration is present. The Google client in project `agents-os` has the Zeabur and older Worker callback URIs but not the current `dazhi-migration-spike.kcadmin.workers.dev` callback. The user said the change was done; after reload the exact URI was still absent from the authorized redirect list, so it is not verified as saved. Asked whether I should add that exact URI or the user will save it.

The user approved issuer-by-issuer rotation while keeping Zeabur and DNS. Google documents that resetting the compromised OAuth secret immediately invalidates the old secret and causes a temporary login outage until consumers are updated. The reset must be performed by the user in Google Cloud Console; do not request the secret in chat. An empty mode-0600 handoff file is ready at `/Users/cmlo/Downloads/Zeabur-Migration-Backups/dazhi-google-oauth-secret-20261111.txt`. No new secret, production binding, or Zeabur variable has been changed yet.

Staging-only code changes are local and undeployed: the Cloudflare config declares Google secret bindings, and the staging policy denies all unconfigured provider sign-in paths while allowing only Google POST sign-in and GET callback when the exact config exists. The staging test suite passes 12/12; `cf build` completes with one warning in generated upstream output. Cloudflare school-account CLI access now works using the `school` profile plus explicit school account ID. Zeabur Dazhi is currently `RUNNING`; its public login page returns 200. No production route or DNS change.

## Latest route and exposure recheck — 2026-11-11

The authorized school Cloudflare Dashboard shows `dazhi-production` has its public `workers.dev` URL enabled and lists no custom domain or zone route. This confirms the production Worker is not currently attached to `teacher.keichi.edu.hk`; it does not establish the current DNS record value. No route, DNS, Worker, or Zeabur setting was changed.

During read-only browser inspection, Chrome was still displaying the Zeabur Dazhi variables page and the interface exposed plaintext credentials in the computer-use result. Treat every displayed value as compromised. Do not repeat or reuse them. No credential was changed or rotated. Rotation approval remains unresolved; the user has only confirmed the Mac is unlocked.

Next: obtain explicit approval for issuer-by-issuer credential rotation with Zeabur kept online; rotate exposed values at their issuing services and update only intended encrypted staging bindings. Then validate staging login and limited data read/write/delete. Separately plan school-domain routing only after DNS zone and Worker route prerequisites are verified. Keep Zeabur and DNS unchanged until all release gates pass.

## Latest current-state recheck — 2026-11-11

The active school-account deployment has encrypted Auth.js, Google OAuth, and `DATABASE_URL` bindings; version 12 serves 100% of traffic. Their values and exact database destination remain unverified. A fresh Google sign-in on `workers.dev` returned `OAuthAccountNotLinked`, so current SSO acceptance fails.

Created two read-only Zeabur PostgreSQL custom-format backups with mode 0600 and validated each with `pg_restore -l`. Restored the newest snapshot into a new Neon branch/database, separate from prior rehearsal data. Compared all 78 public table names and row counts, then compared row hashes across every record: 18,213 rows in 56 populated tables match exactly; 22 tables are empty. The earlier snapshot showed concurrent source changes, which prompted the newer snapshot. The latest candidate is verified against its source snapshot but is not connected to the Worker.

The latest candidate is in Neon branch `dazhi-current-release-20261111`, database `dazhi_current_release_latest`; the branch uses 0.5 CU and expires 2026-11-18. A separate `dazhi_current_release` database retains the earlier snapshot. No Worker binding, account link, Zeabur service, or DNS was changed during these restores. The current Google identity remains linked to a Teacher record; preserve that role and Auth.js account-link protection.

Security incident: an unfiltered Cloudflare Worker version listing and the Zeabur variable page exposed plaintext integration credentials, including database and third-party service credentials. Treat all displayed values as compromised. No issuer rotation, secret update, Worker deploy, Zeabur restart, or DNS change has occurred. The user has not yet clarified whether “donee now” approves the staged issuer-by-issuer rotation and Teacher-only Google-link repair.

Next: confirm the two pending security/account-mapping decisions, inventory affected consumers, rotate credentials without interrupting Zeabur, update encrypted bindings, point only the staging Worker at the verified Neon candidate, then retest fresh teacher/admin login and disposable read/write/delete. Keep Zeabur and school DNS unchanged until every gate passes.

The school Cloudflare account is accessible through the authorized `cf` CLI profile. Worker `dazhi-production` is reachable on its `workers.dev` hostname. The teacher Google SSO session and teacher dashboard, activities, announcements, todos, classroom, and November calendar pages loaded against the isolated Neon rehearsal candidate. November returned 53 events. One temporary calendar activity was created and deleted through the app; its title is absent from the candidate and the count returned to 53. The candidate role now has CRUD on its 78 public tables; these grants apply only to the rehearsal database.

The school DNS record `teacher.keichi.edu.hk` remains a proxied A record; no DNS or Zeabur changes were made. Admin acceptance is blocked because `admin@demo.hk` has neither a password nor a linked Google identity. Remaining gates: rotate exposed integration credentials at their issuers, establish an approved admin test identity, qualify remaining routes and outbound integrations, and complete final sync/rollback acceptance. This is staging acceptance, not migration completion or authorization to cut over.

## Dazhi deployed Worker login/data follow-up — 2026-11-11

Read-only Cloudflare inspection confirms the Worker has secret bindings for Google auth, Auth.js, the database URL, and release configuration. The `workers.dev` login/providers/session endpoints returned 200; Google OAuth completed its callback and rendered the teacher dashboard. The dashboard read real restored rehearsal data; the earlier app-level temporary event create/delete was verified clean. This confirms the deployment is not missing all auth/database bindings, but does not qualify the latest production database sync or administrator login.

The supplied administrator identity is absent from the rehearsal candidate. Its existing placeholder ADMIN record has no local password or Google account link; the attempted login was rejected. No credential or database account was changed. A Cloudflare settings response also returned plaintext preview integrations, including a service-account private key, into diagnostic output. Treat those preview credentials as exposed; inventory consumers and rotate at issuers before production use, without disrupting Zeabur. Keep the school DNS unchanged.

An initial local check found no globally installed Zeabur CLI or SSH host alias. The official `npx` CLI was subsequently authenticated and used for a minimal read-only identity check, but no full live-source freshness/fingerprint comparison was completed. The Neon rehearsal candidate must not be treated as the final production database until that comparison is verified.

## Dazhi Zeabur source/admin follow-up — 2026-11-11

The official Zeabur CLI was already authenticated and lists the source `dazhi` and PostgreSQL services in `untitled-1-flowse`. A read-only query found the requested school-admin identity absent from the live source; the existing placeholder ADMIN record has a password verifier but no Google link. On the user's explicit address-mapping instruction, that single ADMIN record and its existing verifier were synchronized to the isolated Neon candidate only; the Zeabur source account was not changed. The first `workers.dev` credential attempt was rejected. The latest browser state is authenticated at `/teacher/admin/settings` with a visible sign-out control, confirming entry to the Worker admin area; it does not prove which credential flow completed sign-in or qualify the live production database.

Security incident update: the Zeabur CLI variable-list response included plaintext live database and integration values in diagnostic output. Treat affected values as exposed. Do not repeat or copy them. Rotation and binding replacement need a coordinated, no-outage plan that preserves Zeabur; no rotation, restart, or DNS change was performed.

## Branch integration — updated 22 October 2026

Portal PR5 is merged at 83239e457f7e77beda26e2d77b5d92d5c244f5ec. Every inventoried Portal remote branch is an ancestor of main. Exact-head GitHub CI passed both runs, including isolated PostgreSQL migration, restore, API and container checks; 63 local tests and production build passed. Two reviewed fixes preserve support-case identity and unsaved report edits.

AgentOS Phase2 is merged through PR16 at 5d9af6c61736b7ec20294ae24594b21a12cfe8bb; PR14 is also marked merged. Every inventoried remote branch, including the integration branch, is an ancestor of main. Final Linux suite104/104, Windows typecheck/lint/production build and dependency audit0 passed. Native synthetic two-service teacher acceptance and both upgrade migrations passed. See docs/BRANCH_INTEGRATION_20261021.md for inventory, conflict decisions and explicit safe legacy policy requalification.

Audited work requires Linux/WSL with private durable mode0700 storage outside the checkout; native Windows execution fails closed. Existing jobs without policy hashes require explicit safe requalification and fresh teacher approval. Jobs with existing Portal operations require reconciliation first. Genuine teacher browser qualification, live AD/local model, real school data/mail, persistent host and business cron remain unqualified. No new AgentOS deployment is included in this merge request. Historical sections below do not override this status.

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

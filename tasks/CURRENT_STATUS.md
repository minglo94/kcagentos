# Dazhi production DB target recheck — 2026-11-11

依使用者「確認正式 Worker 資料庫目標後改 DNS」要求，再唯讀查核：校方帳戶目前部署的正式 Worker 版本把 `DATABASE_URL` 列為受保護 binding，Cloudflare 版本 API 不提供值；Worker 的 preview base config 沒有 `DATABASE_URL`，不能用來推斷目前正式版本的資料庫目標。Neon 候選 branch 的查詢日誌沒有可用記錄，`pg_stat_statements` 未啟用，無法將正式 Worker 的讀取請求與該分支對上。現有 Google 教師登入／首頁讀取證明 Worker 可用，但不足以辨認它連到 Zeabur 或 Neon。Neon 候選庫仍少於最新 Zeabur 備份兩筆 `Account`；Zeabur Google 回退登入仍未通過，而使用者明確不允許改其機密。學校 DNS 和 Worker route 未變；正式資料庫目標、資料同步及回退門檻尚未通過。

# Dazhi rollback gate — 2026-11-11

再次唯讀查核時，Zeabur 備用網址及 `teacher.keichi.edu.hk/login` 均回 200；此前學校網址的 404 不是穩定現況。實際從 Zeabur 備用網址執行 Google 登入時，回調使用學校網域並落在 `/api/auth/error?error=Configuration`，因此 Google 登入回退未通過。使用者在知悉結果後明確維持「不更新 Zeabur」的決定；不可更新其 OAuth secret。正式 Worker 的 Google 教師登入已通過，但 Neon 候選庫仍比最新 Zeabur 備份少兩筆 `Account`，且正式 Worker 的 DB 目標未證實。學校 DNS／Worker route 保持原狀；這些門檻未通過前不可聲稱完成切換。

# Dazhi OAuth deployment and fresh-source check — 2026-11-11

使用者提供 Downloads 中的新 Google OAuth JSON；它與先前下載檔使用相同 client ID，但 secret 不同，並包含學校網域與正式 Worker 回調。檔案權限已改為 0600，沒有在工具輸出或 Git 顯示 secret。已更新 staging `AUTH_GOOGLE_SECRET`，受保護的登入、provider 和 DB health 均回 200。Cloudflare 因正式 Worker 有未部署較新版本而拒絕直接改 secret；改用 Wrangler 建立只含新 secret 的版本 `f96413a0-6917-4c93-be99-502b6c895cfe`，再以 `cf` 明確部署至正式 Worker 100% 流量。其 `workers.dev` 登入/provider 回 200；真實 Google 教師登入成功並載入教師首頁和行程。正式 Worker `/__migration/db-health` 仍為 404，資料庫目標未證實。

透過 Zeabur CLI 唯讀取得新的 PostgreSQL custom-format 備份，私密檔為 `/Users/cmlo/Downloads/Zeabur-Migration-Backups/dazhi-full-postgresql-20261111-precutover-fresh.dump`（0600）。PostgreSQL 18.6 `pg_restore -l` 可讀；與 16:02 備份比較，78 個 COPY 表均存在，總行數由 18,213 增至 18,215，只有 `Account` 表變動（233→235）。Neon `dazhi_current_release_latest` 的 `Account` 仍是 233 行。因此最新來源資料未全部同步到既有 Neon 候選庫。沒有對正式資料庫或 Zeabur 作寫入／設定變更，也沒有做正式 Worker 資料寫入測試。

學校正式 zone 仍無 Worker route，`teacher.keichi.edu.hk` 仍指向原代理 A 記錄；本次沒有改 DNS。接續先確認正式 Worker 的 DB 目標，安全同步新來源的差異並以完整表指紋驗證，完成教師資料讀寫及回退演練，才把學校網址接入正式 Worker。管理員登入依使用者之前決定暫不驗證；不動 Zeabur 機密設定。

# Dazhi production cutover preflight — 2026-11-11

使用者已明確要求切換正式 Worker／學校網域；目前仍未改正式 Worker、DNS 或 Zeabur，因必要驗收未通過。以校方 Cloudflare CLI profile 唯讀核實：校方 `keichi.edu.hk` zone 為 `active`，`teacher.keichi.edu.hk` 是代理 A 記錄；私密切換前 DNS 快照與現值一致。校方正式 zone 沒有 Worker route；同名 `initializing` zone 屬個人帳戶，不能用作正式路由。

即時 HTTP 檢查：`dazhi-production.kcadmin.workers.dev/login` 與 `/api/auth/providers` 為 200，`/__migration/db-health` 為 404，故正式 Worker 的資料庫目標／連通性尚未證實。`teacher.keichi.edu.hk/login` 和 `/api/auth/providers` 現為 404，回應帶有 Zeabur request header；目前學校網址未服務出可驗收登入頁。staging 曾通過獨立 Neon 健康檢查及教師流程，但該證據不能替代正式 Worker 的新鮮 Google SSO、正式資料庫目標、資料讀寫與功能驗收。新的 OAuth JSON 私密檔目前不存在；不重用先前下載或外洩關聯未釐清的憑證。管理員登入仍依使用者決定暫不驗證。

因此此刻切換會把已知的學校網域 404 換成正式 Worker 的未知 DB 狀態與未驗證 SSO；維持 Zeabur 和 DNS 原狀。接續先解決正式 OAuth 機密／憑證輪替授權範圍、核實正式 Worker 的資料庫與最新備份，並通過教師 SSO、資料讀寫及必要業務流程；再設置可回退的正式路由並驗證後，才切流。不要設定 Worker IP；Workers 網域接駁使用受支援的 route/custom-domain 機制。

# Dazhi Cloudflare school-account acceptance — 2026-11-11

## Latest security incident and staging credential update — 2026-11-11

A sanitized `cf workers versions list` inspection used an incorrect JSON filter and emitted plaintext preview configuration into tool output. Treat all exposed values as compromised, including database credentials, a Google service-account key, Auth/cron values, and AI, mail, and push integration credentials. No values were copied into repository files. The user authorized changes to Cloudflare staging only and explicitly declined Zeabur configuration changes; Zeabur and DNS were not modified in this continuation. This leaves any exposed values still consumed by Zeabur active until a separate coordinated rotation is authorized.

Rotated the staging Worker's `AUTH_SECRET` to a newly generated random value through the Cloudflare bulk-secrets API. The staging deployment list shows the resulting version serving 100% of staging traffic. Read-only checks after the update returned `/login` 200, Auth.js providers `google` and `credentials`, and database health 200 (PostgreSQL 18, 78 tables). Staging sessions signed with the previous `AUTH_SECRET` are invalidated. No other staging secret, Worker code, Zeabur setting, or DNS record was changed.

Fresh staging Google SSO is not requalified: the staging Google client secret must be replaced with a new client credential; the private secret handoff file is empty, and the downloaded OAuth client file must not be reused until its relationship to the exposed value is resolved. Obtain a separate staging OAuth client/secret, register the staging callback, and install it only on the staging Worker before repeating teacher sign-in and feature/data acceptance. The user chose to defer administrator login; preserve all account data.

The separate `dazhi-production` Worker was rechecked without reading secret values: its bindings include Auth.js/Google and `DATABASE_URL`; `/login` and `/api/auth/providers` both return 200, with Google and credentials providers. Its `/__migration/db-health` route returns 404, so this does not prove whether the production Worker can connect to its database or which database it targets. Do not copy production values into staging; continue validating against the isolated Neon release candidate. The requested replacement staging OAuth JSON file is not present yet.

## Latest staging verification — 2026-11-11 (supersedes earlier status below)

The separate staging Worker `https://dazhi-migration-spike.kcadmin.workers.dev` is gated by Basic Auth; use the private access file `/Users/cmlo/Downloads/Zeabur-Migration-Backups/dazhi-stage-access-20261111-rotated.txt` and its `Browser username` / `Browser password` fields. Do not paste credentials into chat. The user-saved Google redirect URI was confirmed, the downloaded OAuth client credentials were installed as staging secrets, and `/api/auth/providers` lists Google. A fresh Google sign-in succeeded and rendered the teacher dashboard.

The staging Worker is connected via `STAGING_DATABASE_URL` to the isolated Singapore Neon PostgreSQL 18 release candidate `dazhi_current_release_latest` on branch `dazhi-current-release-20261111`, using the restricted application role. Protected health checks report database `ok`, PostgreSQL major 18, 78 tables, and 830 users. The teacher TODO flow passed app-level create, reload/read, delete, and reload verification; the synthetic item was removed and the count returned to its prior 24. `node --test migration-tests/*.test.mjs` passed 31/31; Wrangler dry-run passed with an upstream generated-bundle `=== -0` warning.

Fresh read-only verification reconfirmed the staging Worker secret binding names and the `google` provider, `/login` 200, `/__migration/db-health` 200, and authenticated teacher route redirect behavior. A fresh browser session reached the teacher dashboard through Google SSO. A newly created synthetic TODO remained visible after a full page reload. Invoking the app delete control produced an irreversible-action confirmation; after dismissing the dialog, the item was absent after another reload, and a restricted-role Neon aggregate confirmed 24 remaining TODOs and zero rows with the smoke-test title. The exact timing of the app's delete side effect relative to that dialog is uncertain. An existing ADMIN session opened administrative pages, but a fresh credential login using the existing demo ADMIN address and the user-provided password was rejected. A read-only query found the old demo ADMIN but not the intended school-admin address; the user declined changing the account mapping, and no account data was modified. Admin fresh sign-in remains unqualified. The account's `dazhi-production` Worker also lists Auth.js, Google, and database secret bindings by name; secret values and its database destination were not read or verified, so binding names alone do not establish production runtime readiness.

## Cloudflare preview configuration exposure — 2026-11-11

A read-only `cf workers get` request unexpectedly returned plaintext values from `dazhi-production`'s preview base configuration in tool output, including database and third-party integration credentials. Treat all returned plaintext credentials as compromised. Do not repeat, reuse, or store them. No Cloudflare Worker settings, Zeabur variables, DNS, or issuer credentials were changed during that inspection. The prior user authorization to rotate exposed credentials while preserving Zeabur and DNS remains in scope; map the affected issuers and consumers before replacing credentials, and do not deploy or restart production as an incidental step.

The code is committed locally in the separate Dazhi worktree on `codex/dazhi-cloudflare-neon-staging` as `641c2fb` (`feat: isolate Dazhi Cloudflare staging`). Its `origin` is a local checkout path, not GitHub, so this code commit has not been pushed. The root `KeiChi` repository is on `main`; current staging verification notes are pushed to GitHub through commit `810e702`.

Release remains blocked: the Neon branch is about 82 MB. With the user's approval, its expiry was removed; read-back confirms `expires_at` is unset. Protection could not be enabled because the current plan has reached its protected-branch limit, so the branch remains unprotected. Do not upgrade the plan or alter other branches without authorization. This preserves the restored school dataset in the same Neon project but does not by itself qualify the branch as production-ready. Administrator login, remaining app routes and integrations, latest-source synchronization, credential-rotation follow-through, and final rollback rehearsal remain to be qualified. Zeabur remains running; the production Worker, school DNS, and custom-domain routing were not changed. Do not treat staging acceptance as production cutover authorization.

## Latest staging deployment and rollback — 2026-11-11

The user chose to add the exact staging Google redirect URI themselves; the URI is still unverified in Google Cloud Console. No OAuth credential was reset and no consumer credential was updated.

Staging code checks: 12/12 policy/guard/static-routing tests passed. OpenNext production build completed after setting Next.js standalone output; the generated bundle has an upstream `-0` comparison warning. `cf deploy --dry-run` could not produce Cloudflare Build Output for this OpenNext project. A Wrangler dry-run passed, but the first upload omitted the prior asset binding behavior and authenticated requests failed. I rolled staging back to its previous version. The old gated `/login` and `/api/auth/providers` now return 200 with the private access file; providers remain `credentials` only. Database and Prisma health requests timed out, so database availability is not currently re-verified. The secret names remain present; no values were read.

The local migration worktree has uncommitted staging changes, including `next.config.mjs`, `pnpm-workspace.yaml`, and `cloudflare.config.ts`; preserve its unrelated edits. Do not deploy that bundle again until its `ASSETS` binding and `runWorkerFirst` behavior match the verified version and authenticated health endpoints pass locally and in a dry run. Zeabur remains running; production Worker, school DNS, and domain routes were not changed. Next: verify the user's saved Google callback, recover a passing DB health check, then complete secret rotation and staging SSO/read-write acceptance before any cutover.

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

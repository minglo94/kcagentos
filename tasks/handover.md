# AgentOS 進度交接

> 最新接續：PostgreSQL 合成驗證已擴展至 9/9，新增真實 subprocess SIGKILL 的 planning/execution recovery 測試。用戶已確認學校為本機 Windows AD，並要求同時支援 AD 及獨立 AgentOS 帳號；用戶已批准書面設計 `docs/SCHOOL_AUTH_DESIGN.md`；implementation plan 見 `docs/superpowers/plans/2026-10-09-school-auth.md`，等待 review/執行方式，尚未實作。下方 Google SSO 假設及七項驗證數字為歷史紀錄。

> Phase 2 接續（2026-10-09）：本機分支 `codex/agentos-phase2` 基於 foundation `de8725c`，新增正式 PostgreSQL 16.15 的合成雙連線驗證（7/7），並確認 Node 17/17、Python 6/6、typecheck 及 lint（原有一項警告）。用戶已批准 commit/push，已發布 `9a7e221` 及 [草稿 PR #14](https://github.com/minglo94/kcagentos/pull/14)（base：`codex/agentos-foundation`）；尚未合併或部署。詳細命令及限制見 `docs/POSTGRES_QUALIFICATION.md`；本節優先於下方歷史「PostgreSQL 未驗證」描述。

> 最新實施交接（2026-10-09）：首版已在 `codex/agentos-foundation`，見 [草稿 PR #13](https://github.com/minglo94/kcagentos/pull/13)，commit `d05bc1f9ceab1301e0cd6586700178414ba90acd`。尚未合併或部署。
> 已驗證：17 個 Node／資料庫測試、6 個 Python 測試、瀏覽器 E2E、typecheck 及完整 build；lint 有一個既有警告。模型尚未設定，接駁及測試骨架完成；Portal、完整像素動畫及夜間 cron 待續。PGlite 不代表 PostgreSQL 多 worker 驗證，現有依賴漏洞需另行修復。
> 下次先讀該分支的 `tasks/handover.md`、`docs/OFFICE_FOUNDATION.md` 及 PR，再接續工作；下方歷史狀態不代表最新實施進度。


更新：2026-10-09（香港時間）

## 現況（原計劃快照；最新實施進度見下方）
- 已完成：閱讀 kcagentos 架構與另一個 Teacher Portal 聊天；確認 Hermes 總管、本機首版、開發＋學校、計劃及對外操作審批；整理完整計劃與夜間排程設計。
- 已檢查：現有 repo 有 dashboard、文件審批、學校專員及 Claude/Ollama/LM Studio 模型層；未驗證部署運行。
- 尚未開始：功能實作、UI草圖、模型調用、校務資料收集、部署、排程啟用。
- 阻塞證據：已安裝 Hermes 命令的 chat --help 返回 `uv trampoline failed to canonicalize script path`，需在第一階段定位修復。

## 下一次提醒
1. 先讀 AGENTS.md、docs/AGENTOS_PLAN.md、tasks/todo.md、本文件、tasks/lessons.md，並檢查當前branch及工作區。
2. 用戶已在本次會話批准開始實施；模型服務及後续部署仍按已確認階段驗收，不啟用未批准對外操作。
3. 第一件實施工作：Hermes 專用profile與受控adapter接駁驗證，然後Codex app-server；不要先砌動畫假裝執行。
4. Portal聊天：codex://threads/01a120d8-4d93-7f70-aa40-fa96902e9bd2；只讀取需要的最新狀態，不自行向該聊天發指令。
5. 啟用排程前確認時間、校曆、來源、通知管道；Spark型號/OS/連線、ESDA定義、APASO規則及IEP範本仍需確認。

## 更新規則
每個里程碑、阻塞、重要決策、會話結束更新本文件和todo；記實際測試結果、失敗與commit。未測標明未測。公開GitHub不得保存學生資料、憑證或內網資訊。

## 2026-10-09 整合責任更新

用戶已要求記錄：整合使用，分開服務與資料庫；見 docs/INTEGRATION_DECISION.md。AgentOS負責唯一總管與業務排程，Portal負責唯一學生資料、校務子操作及業務審批。不得各自實作完整排程/派工/計分/電郵系統。

已同步修訂本機 Keichi Local 計劃與任務；其private repo尚未建立，不宣稱已發布。下一次先讀整合決定，實施前把父job/子operation/批准引用協議驗證清楚。所有功能、部署與cron仍未開始。

## 最新實施交接 — 2026-10-09

- 授權：用戶要求開始實施；選擇 A（左總管、中辦公室/任務、右審批）；確認尚未設定本地模型，先完成接駁及測試骨架。
- 工作分支：`codex/agentos-foundation`，本機checkout與OneDrive規劃文件分開。
- 已實作：`/office`登入後指揮台；Office父任務/步驟/事件/版本批准；authenticated API；獨立Worker租約及恢復；人工證據；隔離Hermes規劃/ Codex唯讀adapter；baseline及additive migration。
- Hermes：舊uv trampoline錯誤不再重現，不改私人安裝。原生ACP工具過廣，改用no-tools規劃bridge；依賴/no-tools檢查通過，沒有真實推理。
- Codex：隔離empty profile與禁connector/插件、read-only/network-disabled policy；真實initialize握手通過，未啟動模型turn，未證明OSsandbox的正式效果。
- 已驗證：17個Node/Prisma測試、6個Python限制測試；真實Next/瀏覽器合成E2E（認證、Origin、批准、人工證據、SSE、reload、跨帳戶拒絕）通過。TypeScript通過；lint只有原有approvals頁的hook dependency warning。
- 測試限制：PGlite單backend，不替代正式PostgreSQL多Worker競爭測試；SSO測試用合成簽名session，不是學校Google真實登入。未接學生資料、Portal、排程、電郵、部署或完整Pixel Agents。
- 建置：改為bundled fonts避免Google Fonts下載；完整production build已通過（使用合成build設定，不代表正式部署）。
- 依賴：npm安裝audit報24項（7 moderate/15 high/2 critical，含既有Next/NextAuth）；此分支不能宣稱production ready，需獨立測試升級。

### 下一次具體步驟
1. 讀本交接與 `docs/OFFICE_FOUNDATION.md`；確認PR/branch現況及測試結果，不重建重複Portal功能。
2. 本地模型可用後按 `docs/HERMES_BRIDGE.md` 建專用profile，再測真實繁中JSON計劃；不可繼承私人憑證或工具。
3. 在獨立PostgreSQL驗證migration、兩個Worker claims、批准競爭、重啟及fencing；已有DB先備份核實baseline，禁止reset。
4. 再接Portal scoped operationId/idempotency/權威批准，之後接Pixel Agents及唯一業務cron。模型未設定前維持明示不可用，勿生成假結果。
5. 每個驗收里程碑及結束更新todo/交接並同步GitHub；保持學生/個案/憑證與測試artifact不進Git。

## 學校流程修訂交接 — 2026-10-09
用戶批准更新 GitHub plan 並同步 Teacher Portal 聊天。完整新增規格見 docs/AGENTOS_PLAN.md 第11節。
優先班務完整流程，再活動文件包、會議決議跟進；新增版本化流程契約、受控知識庫、結構化證據、草稿/內容批准/發送批准/正式結果與老師使用成效規格。
下一步：完成既有技術前置驗證後，以合成資料驗收班務流程（Portal 工具/權限/權威批准/outbox），再授權真實小批，最後 cron；不以 manual 證據文字或動畫宣稱完成。
已向 Build private AI teacher portal（01a120d8-4d93-7f70-aa40-fa96902e9bd2）發送用戶授權同步指示，由該聊天更新其本地計劃與交接。Portal private repo 未建立時不得宣稱 GitHub 已同步。
本次只有計劃文件修訂，沒有新功能、學生資料、發送、部署或排程。首版技術骨架仍見 PR #13；既有測試證據不等於新增流程已驗收。

## Phase 2 接續 — PostgreSQL 驗證（2026-10-09）

- 用戶要求繼續 Phase 2 並提供 repo；按照最新交接先完成現有資料庫行為驗證，沒有增加業務功能。
- 分支：`codex/agentos-phase2`；起點 `de8725c`，工作區 `/workspace/kcagentos-phase2`。驗證 commit `9a7e221` 已 push；草稿 PR #14：https://github.com/minglo94/kcagentos/pull/14，target `codex/agentos-foundation`。發布狀態由本次文檔 commit 同步；兩個 PR 均未合併或部署。
- 已完成：`tests/office-postgres.ts`、`npm run test:postgres`、可重現驗證文件。使用 loopback 專用 `agentos_qualification` DB；每次建立 UUID schema、deploy 兩個 migration、核實 migration 記錄與不同 backend PID，最後只刪自己的 schema。
- 已驗證：7 項 PostgreSQL 16.15 測試通過（兩 worker claim、批准重複/競爭、批准後單次執行、重複 recovery、client reconnect、取消及 stale-result fencing）；原 Node 17/17、Python 6/6、typecheck 通過；lint 只有既有 approvals-client warning。Teardown 後測試 schema 數量為零。
- 限制：這是雙 Prisma client 與合成 adapter；不是多 process crash、負載、正式 migration、Google SSO、模型推理或 OS sandbox 驗收。Browser E2E/build 本次未重跑。沒有 Portal、學生資料、發送、cron、部署；既有依賴問題仍待升級。
- 下一步：本次用戶已批准並完成 commit/push 與草稿 PR；接著設定專用本地模型，確認 private Portal capability/身份/operationId/idempotency/權威批准契約後接班務合成流程。不要重建 Portal 計分或 outbox。

## Worker-core process crashes and school login — 2026-10-09

- 用戶要求繼續未完成工作，確認登入須支援本機 Windows AD 與獨立 AgentOS 帳號。
- 已完成：增加 `tests/fixtures/office-worker-process.ts`；planner/executor 進入真實 `runNext` 後 SIGKILL，核實持久化租約、單次 recovery、執行暫停、不盲重跑及人工 resume。正式 PostgreSQL 合成測試 9/9，typecheck 通過，lint 只有既有警告。
- 技術限制：子程序用合成 blocked service；不是完整 office-worker CLI、模型子程序、主機 reboot 或負載驗收。持久化 lease expiry 由測試調前，不等候自然 30 秒。Application source 未修改。
- 登入：現有只有 Google provider；寫成具體 AD/local credentials/identity linking/throttle/revocation/provisioning 設計並已获用戶批准；實施計劃已寫成，等待 review/執行方式。不得把已確認「兩種登入」當成已完成 AD 接駁；沒有學校 AD 位址、帳密或內網連線。
- 依賴：此次 npm audit 仍為 24（7 moderate / 15 high / 2 critical），沒有做強制升級；raw JSON 留 `/workspace/scratch`。現有 Next 14/NextAuth 4 需分別評估升級，不能宣稱 production ready。
- 下一步：完成 `docs/superpowers/plans/2026-10-09-school-auth.md` review，按選定方式實作已批准的登入設計；模型、Portal scoped operation/identity/批准契約及班務流程仍待接續。沒有新增學校資料、發送、部署或 cron。

## School authentication implementation started
- User reiterated continuation of all unfinished milestones after the concrete plan; proceeding directly, without another authorization request.
- Tested milestone: additive auth migration, scrypt password primitives, local credentials/provisioning/session-revision store and explicit directory identity records. Password/store tests passed (2+4); PostgreSQL qualification now 10/10 including a shared five-attempt budget across independent backends.
- Existing User IDs and Office ownership remain unchanged. Real AD, credentials browser integration and final release validation are not yet accepted; do not claim full login completion from these store tests.

## School login and load milestone — 2026-10-09
- Implemented both explicitly enabled AD/local providers, admin provisioning/reset/link/unlink, protected interactive bootstrap, login/admin UI, bounded scrypt and shared login budgets. Setup: docs/SCHOOL_AUTH_SETUP.md. No real AD endpoint or staff account configured.
- Fresh reviewer identified five substantive issues: rolling eight-hour expiry, unbounded LDAP admission, abandoned attempt rows, contact-email Google attachment and stale-admin PATCH. Five reproducing tests failed then passed. Fixed with immutable sign-in deadline, per-instance admission, indexed bounded expiry deletion, legacy Google provenance and transactional actor recheck/audit. New migration 20261009000300_auth_review is additive; old tokens must sign in again.
- Node tests 32/32; Python bridge 6/6; real local-login and Office browser tests passed; production build passed with synthetic configuration; typecheck passed; lint retains the pre-existing approvals hook warning. One concurrent PGlite run transiently closed a connection; isolated and full subsequent runs passed. Dev browser hydration was intermittent; preserving the old generated cache and rebuilding clean passed. No product authorization checks were relaxed.
- PostgreSQL 12/12 including independent clients, actual subprocess SIGKILL, auth uniqueness and six workers draining 32 approved jobs. Initial load exposed immediate serializable retry exhaustion; row-locked skip-locked claims and bounded randomized backoff fixed the reproduced issue. This is small synthetic load, not production capacity or live-model worker-loop crash qualification.
- Deferred review minors: CA file/client creation and cleanup can exceed the logical ten-second directory operation deadline (native operations bounded to five seconds; unbind destroys socket); budget unlock lacks an audit entry. Account PATCH audit is now transactional.
- Rulings: continuation after plan means proceed inline (cost: user may prefer another method); atomic PostgreSQL budget replaces serializable reservation retries (cost: alternate DB needs qualification); preserve legacy Google provenance while refusing contact-email attachment to newly provisioned users (cost: credential-assigned legacy users before migration may need administrator recovery).
- Still pending: real school AD, production migration, actual local model, private Portal contract/class-summary, full Pixel Agents, business scheduling and Spark deployment. No student data, live business operation, email, cron or deployment occurred. Next milestone is separate dependency qualification.
- Final repeat: Node 32/32 and PostgreSQL 12/12 again; typecheck passed after using Array.from for Map iterators under the existing TS target. Legacy token-based setup explicitly marks newly created Google administrators; it never adds credentials or AD links.

## Dependency upgrade milestone — 2026-10-09
- Next/ESLint 15.5.27, Tailwind/PostCSS plugin 4.3.3, PostCSS 8.5.29 and compatible lockfile updates. Next 15 route params/searchParams now awaited; TS target ES2017 set by Next; internal links use Next Link. React remains 18 and Prisma remains 5 (documented v7 compatibility constraint).
- Audit at qualification: 8 packages/chains (0 critical/5 high/3 moderate), down from 24. Remaining ESLint development chain uses unpatched braces; Mammoth's CLI-only argparse/sprintf-js dependency remains unpatched. Do not replace these with API-incompatible major overrides or obsolete Mammoth downgrades. Still not production-ready from a zero-advisory perspective.
- Narrow overrides: PostCSS uses the direct patched version; ExcelJS UUID uses CommonJS-compatible 11.1.1. Synthetic DOCX → raw text → ZIP and XLSX write/read test 2/2. This test found an existing Archiver 8 named-class export mismatch in notice ZIP generation; replaced obsolete factory call with a shared ZipArchive adapter.
- Final Node suite 34/34; production build passed; both-provider UI discovery and real local credentials/CSRF/cookies plus UI account creation, active-admin rejection, forged GUID/missing-Origin rejection passed. Office browser E2E passed on Next 15.5.27. Lint passes with existing approvals hook warning and next-lint deprecation.
- Live model, private Portal, AD and Spark details remain unavailable. Pixel Agents upstream inspected at d1e007a9fdf3003c252d2973abe1999ae59aec33: MIT, standalone CLI exists, but only Claude HookProvider registered; Codex/Hermes integration is not built-in. Do not launch its default private transcript watcher or treat the current seats as full Pixel integration.
- Runtime prerequisite clarified to Node >=22.13.0; tsx moved to runtime dependencies so production workers/bootstrap remain runnable after dev dependency removal.

## Migration/deployment preparation — 2026-10-09
- Added synthetic existing-installation PostgreSQL upgrade/replay test: resolves only the known fixture's baseline/office history, preserves exact user/job/approval identities and hashes, adds auth without credentials automatically, and confirms four applied records plus no-op repeat. Suite 13/13. This is not a production backup/restore.
- Prepared Docker/Compose/optional AD CA mount and host-worker unit. Database and web are loopback-only, provider flags default off, secrets stay in deploy/private, migrations require a separate maintenance command. No automatic production migration or cron. Host worker remains beside the isolated local model profile, because container loopback cannot reach a host model.
- Compose config --quiet and systemd syntax verification passed; actual target account/paths/OS are unverified. Initial container build hit disk exhaustion under the managed VFS storage driver after successful compilation. Preserved/generated test cache and unused build cache were cleared, copies consolidated, then build retried; local runtime browser acceptance pending. No application DB/container was reset.
- docs/PHASE2_STATUS.md records remaining runtime/Portal/AD/Spark gates and concrete Portal protocol semantics to verify. Pixel source is MIT but only Claude is registered/constructed; assets have not been imported and their attribution review remains a gate. No default private transcript watcher was launched.
- Local container acceptance completed: consolidated-copy production image built on Linux/AMD64; browser login/scope/persisted-job/revocation passed against an explicitly migrated disposable PostgreSQL volume. Runtime tsx loads and ESLint is absent; web runs non-root/read-only. Test project containers/volume removed; real PostgreSQL qualification schemas count zero. Node 24/Prisma native packaging verified locally, not Spark hardware.
- Full audit remains 8 (0 critical/5 high/3 moderate); production-only audit result is recorded separately below. Raw data stays local. The prepared image/Compose/runbook is reviewable; no actual school deployment, host worker activation, migration, schedule or send occurred.
- Production-only npm audit: 3 moderate, 0 high, 0 critical (Mammoth CLI chain). Full audit: 8. Deployment artifacts/verification commit follows this entry and will be pushed on codex/agentos-phase2; PR #14 stays draft and targets the foundation branch.

## Publication handover — 2026-10-09
- Published on codex/agentos-phase2: 0626b94 (credential store), 1822436 (AD/local login + review fixes/load correction), ceeb9cf (dependency qualification), cb70031 (production image/legacy migration rehearsal). PR #14 title/body synchronized, still draft, base codex/agentos-foundation; PR #13 and #14 remain unmerged.
- Evidence: Node 34/34, Python 6/6, PostgreSQL 13/13, auth/Office browser tests, actual production-container browser test, build/typecheck/lint (existing warning), Compose quiet validation and systemd syntax. Full audit8; production-only3 moderate/no high or critical. No generated DB schemas/test project containers/volumes remain; dedicated disposable PostgreSQL qualification service remains available on loopback.
- First next action: supply/configure dedicated local runtime/model, private Portal repo/authoritative API contract, protected school LDAPS/CA/test identity and Spark hardware/OS/host access. Do not repeat completed synthetic auth/dependency/container work or treat it as live school validation. Remaining full Pixel/schedule work follows the approved rollout and verified execution/Portal boundary.
- Explicit outstanding review minors remain: LDAP factory/CA setup and cleanup outside logical ten-second deadline (native timeout/socket teardown bounded); login-budget unlock has no audit. Rulings and costs are preserved above. No new user approval was requested for already authorized implementation or publication.

## School data policy design — 2026-10-10
- User requires every-task input/output records for administrators, mainly local LLMs, read-only NAS/configured input folders, separate output folders, read-only online Teacher Portal queries and no online search during student-data processing. Database clarified as PostgreSQL vector; pgvector is an assumption pending schema verification.
- Inspected actual adapters, worker and legacy llm.ts: cloud inference remains reachable; AuditLog is metadata-only. Do not claim these requirements are enforced.
- Added docs/SCHOOL_DATA_POLICY_DESIGN.md and integration/status clarification. Recommended shared application policy plus host isolation, protected payload references, locally generated embeddings and independently scoped database views. No product code, credentials, student data or live service changes.
- Next: written-design review then implementation plan. Brainstorming skill explicitly requires written-spec approval before implementation planning; prior school-auth approval covers a different design. Actual Portal views/scope/vector schema, mounted roots, model runtime and retention remain deployment inputs.
- Verification: documentation-only diff and whitespace review; runtime tests not rerun. Commit/push authorized by existing user instruction.

## Approved data design and implementation plan — 2026-10-10
- User “Ok / How to do it” approves the presented written design and asks how to proceed. No separate approval button or command is needed.
- Prepared and self-reviewed docs/superpowers/plans/2026-10-10-school-policy-audit.md: server policy/local routing, durable attempt payloads, worker/chat coverage, admin inspection and legacy entry-point qualification. Preserve prior native/inline execution choice.
- Separate later stages cover NAS adapters, Portal PostgreSQL/vector queries and OS isolation. First stage fails closed for unsupported restricted paths; real student processing remains disabled until storage/retention/host qualification.
- Writing-plans skill requires written-plan review before implementation. No product changes or runtime tests in this documentation-only turn; diff/whitespace checked before publication.

## School policy/audit implementation — 2026-10-10
- Implemented first stage of the approved design in branch codex/agentos-phase2. Synthetic-only school task execution, server-owned restricted policy, loopback local inference, durable task-attempt input/output records, active-admin viewer, and denial of unqualified legacy source/outbound paths. No actual model runtime or student task was used.
- Added additive 20261010000000_task_audit migration, policy hash on Office jobs, protected private artifact files and auditable worker/chat/manual/Codex attempts. Scoped allowlisted development Codex output now stores partial deltas before accepting completion. Parent/child attempt fencing blocks stale model streams.
- Fresh independent reviewer found two Important issues (stale nested model success, missing failed Codex partial output), reproduced both RED and fixed GREEN. Review initially noted two pagination/correlation issues. Regraded pagination Important because tied timestamps could hide records; a regression test failed then passed after a timestamp-plus-ID cursor. Worker-attempt step IDs/UI links remain a Minor improvement. No Critical finding.
- Initial full PG run saw DATABASE_P2034 under six-worker load; scoped row-locked ReadCommitted audit/plan transactions fixed the reproduced test. Final validation: see following publication note once checks finish. Ruling: use local manual planner while Hermes stock profile lacks qualified school data isolation; keep separate bridge disabled for restricted tasks. Development actor allowlist is server-side.
- Remaining gates: protected shared storage with retention/encryption/backup, actual local model, NAS/input/output adapters, scoped Portal PostgreSQL vector contract, real AD, real production migration/Spark, full Pixel and approved schedules. Synthetic mode is not a live student-data setting.
- Final first-stage evidence: Node 55/55; Python bridge 6/6; guarded PostgreSQL 13/13 including real subprocess crashes, legacy additive migration and 6-worker/32-job drain; auth/audit browser and Office browser passed; typecheck, lint and production build passed. Lint retains only the pre-existing approvals-client hook warning; Tailwind module-type build warning remains. Generated PostgreSQL qualification schema count is zero. No actual local model, Portal/AD service, student dataset, send, schedule or Spark deployment was used.
- Exact publication commit/PR head is checked after push. The fresh review's remaining Minor is absent worker step ID on parent attempts and plain-text job references in the audit UI; nested Codex attempts include step IDs. Timestamp pagination was fixed after review.

## Controlled-file synthetic stage — 2026-10-10
- On `codex/agentos-phase2`, implemented private server-configured named input roots, output root and actor grants. Policy hashes bind the current configuration; changed grants or roots invalidate queued work. File reads use Linux directory handles with `O_NOFOLLOW`, relative paths, allowed UTF-8 text extensions and a bounded 1 MiB read. Separate mode 0700 output root stores a single atomic content+manifest bundle per audit attempt in an actor-specific private staging directory.
- Audit wrappers persist requests before file operations and actual results before success; failed write attempts try to remove staged bundles. Generic chat tools remain journaled/denied, including for actors with file grants. No live job/tool route exposes staging, no output is promoted/published, and real student mode remains unavailable.
- Fresh review found publication-before-audit, arbitrary task-directory and split file/manifest risks in the initial implementation. Reworked to private per-attempt staging and one atomic bundle. Remaining gates: plan-bound job authorization, per-job quotas, orphan reconciliation/promotion, verified NAS read-only mounts, storage/retention/OS isolation and authoritative Portal scoped-query contract. Root pathname substitution before descriptor opening is controlled only by future mount/process isolation; this synthetic adapter is not a live NAS proof.
- Six-worker PostgreSQL load exposed intermittent `DATABASE_P2034` in step completion, including an isolated run. Temporary phase instrumentation localized it to the `Serializable` step-completion transaction, whose bounded retries exhausted during concurrency. That transaction now locks its job row and runs at `ReadCommitted` while retaining lease/version and audit fencing; five consecutive guarded PostgreSQL suites passed 13/13 after the change.
- Final verification after the worker change: controlled-file tests 3/3, full Node 58/58, Python 6/6, guarded PostgreSQL 13/13 in five consecutive runs, typecheck, lint and production build; Office browser also passed. Auth/audit browser passed earlier in this stage before the worker-only change. Lint retains the existing approvals hook warning. Browser runner needs `CHROMIUM_BIN=/usr/bin/chromium` in this workspace.
- Implementation commit `1b8e337` was pushed to `codex/agentos-phase2`; draft PR #14 remains stacked on foundation PR #13. No school services, real student records, Portal queries, real AD, production migration, schedule, send or Spark deployment were activated.

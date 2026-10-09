# 任務清單

> 最新實施交接（2026-10-09）：首版已在 `codex/agentos-foundation`，見 [草稿 PR #13](https://github.com/minglo94/kcagentos/pull/13)，commit `d05bc1f9ceab1301e0cd6586700178414ba90acd`。尚未合併或部署。
> 已驗證：17 個 Node／資料庫測試、6 個 Python 測試、瀏覽器 E2E、typecheck 及完整 build；lint 有一個既有警告。模型尚未設定，接駁及測試骨架完成；Portal、完整像素動畫及夜間 cron 待續。PGlite 不代表 PostgreSQL 多 worker 驗證，現有依賴漏洞需另行修復。
> 下次先讀該分支的 `tasks/handover.md`、`docs/OFFICE_FOUNDATION.md` 及 PR，再接續工作；下方歷史狀態不代表最新實施進度。


## Phase 1 — 核心 MVP ✅ 已完成

> 驗收標準：登入 → 講「幫我出 F.3 數學測驗」→ 60 秒內收到可下載 Word/PDF，任務記錄出現

- [x] 節 0：專案腳手架（Next.js 14、Tailwind、Prisma schema、CSS tokens、.env.example）
- [x] 節 1：Google SSO（domain 限定 gs.keichi.edu.hk、JWT 8h、requireRole middleware、登入頁）
- [x] 節 1a：用戶管理面板 `/admin/users`（ADMIN only、角色指派、停用/啟用）
- [x] 節 2：6 個 Agent system prompts（A01 Dispatcher → A06 Donna）
- [x] 節 3：對話介面（Header pills、SkillRail 18 功能卡、ChatPanel SSE、DocCard）
- [x] 節 4：`/api/chat` 兩段式路由、Pusher 廣播（可選）、AuditLog
- [x] 節 5：`/api/doc` Word（純內容）+ PDF（Noto Sans TC 嵌入，無亂碼）
- [x] 節 6：`/api/tasks` 最近 6 條任務、SkillRail 輪詢更新
- [x] 修復：error=Callback（移除 PrismaAdapter）、空白回應（錯誤處理）、PDF 亂碼（字體嵌入）

---

## Phase 2 — 真實自動化 ✅ 已完成（待部署驗收）

> 驗收標準：上載時間表 CSV →「IT 組 5 人夾空堂」回傳真實共同時段；代課 WhatsApp 發出且回覆可更新狀態

### 1. 時間表上載

- [x] `1.1` `/settings/timetable` 頁面（ADMIN only）：上載 CSV/Excel 介面，套設計系統
- [x] `1.2` `POST /api/timetable/upload`：multipart 接收 CSV，格式「老師,星期,節次,班別,科目」
- [x] `1.3` CSV 解析器：驗證欄位（星期 1-5、節次 1-9）、錯誤行報告 `{ parsed: n, errors: [] }`
- [x] `1.4` 寫入 `Timetable` 表（upsert，依 `teacherName+dayOfWeek+period+term` unique key）
- [x] `1.5` 學期（term）選擇器，支援覆蓋重新上載
- [x] `1.6` 上載成功後顯示統計摘要（幾多位老師、幾多筆記錄）

### 2. 夾空堂引擎

- [x] `2.1` `src/lib/timetable.ts`：空堂計算核心 — `getCommonFreeSlots(teachers[], term)` 回傳共同空堂時段
- [x] `2.2` `GET /api/timetable/common?teachers=a,b,c` → `{ slots: [{day, period}] }`
- [x] `2.3` `timetable_query` 工具整合：A05 Andy 收到夾空堂請求 → `[NEED_TOOL:timetable_query]` → API 調用真實計算 → 結果回饋俾 Agent 生成回覆
- [x] `2.4` 老師名單模糊匹配（輸入「陳sir」可對應「陳大文」）+ 找唔到老師時的友好錯誤提示
- [x] `2.5` 結果以表格形式顯示喺對話中（星期 × 節次 grid）

### 3. 找空堂老師

- [x] `3.1` `GET /api/timetable/free?day=3&period=5` → `{ teachers: [] }`
- [x] `3.2` A05 整合：「星期三第五節邊個有空？」→ 回傳該節空堂老師名單
- [x] `3.3` 配合代課流程：請假日期+節次 → 自動列出候選代課老師

### 4. WhatsApp 推送

- [x] `4.1` `src/lib/notify.ts`：n8n webhook client，payload `{title, content, recipients[], requestId}`
- [x] `4.2` `POST /api/notify`：驗證 session → 轉發 n8n webhook → 寫 AuditLog（action=PUSH_WA）
- [x] `4.3` DocCard 加「WhatsApp 推送」按鈕 + 收件人選擇 UI
- [x] `4.4` `SubstitutionRequest` 建立流程：代課確認時建立記錄（waStatus=SENT）

### 5. WhatsApp 雙向回覆

- [x] `5.1` `POST /api/notify/callback`：n8n 回調端點，shared secret header 驗證（`N8N_WEBHOOK_SECRET`）
- [x] `5.2` 回調更新 `SubstitutionRequest.waStatus`（CONFIRMED / DECLINED）
- [x] `5.3` Pusher 通知前端「✓ 陳老師已確認」（toast 或對話內系統訊息）

### 6. 本地 LLM 切換

- [x] `6.1` `SettingsModal.tsx`：引擎設定面板（Claude / Ollama / LM Studio + URL + model 名）
- [x] `6.2` 引擎選擇持久化（localStorage 或 User 表），`/api/chat` 接收 engine 參數（已有基礎）
- [x] `6.3` Header 引擎標籤：本地引擎時轉琥珀色「本地」（已有基礎，接通設定）
- [x] `6.4` A06 Donna 強制提示：成績分析時 UI 顯著提示「建議切換本地引擎」
- [x] `6.5` 雲端模式下學生姓名以學號代替送入 LLM（匿名化處理）

### 7. 收尾與驗收（邏輯已單元測試通過；端到端需部署後真實數據驗收）

- [ ] `7.1` 端到端測試：上載 CSV →「IT 組 5 人夾空堂」→ 回傳真實共同時段
- [ ] `7.2` 測試：「星期三第五節邊個有空」→ 正確名單
- [ ] `7.3` 測試：代課 WhatsApp 發出 → n8n 回調 → 狀態更新 → 前端通知
- [ ] `7.4` 測試：切換 Ollama 引擎 → 對話正常 → header 顯示「本地」
- [x] `7.5` 更新 `tasks/lessons.md`

### 0. 範本庫（提早至 Phase 2）✅ 已完成

- [x] `0.1` `/settings/templates` 管理頁（CRUD、isDefault 開關、所有登入用戶可用）
- [x] `0.2` `GET/POST /api/templates` + `GET/PATCH/DELETE /api/templates/[id]`
- [x] `0.3` Agent 生成前自動查找預設範本，注入 Specialist 系統提示（`AGENT_DOC_TYPES` 映射）
- [x] `0.4` Header 用戶選單 + SkillRail 加入「範本庫」快速連結

---

_最後更新：Phase 2 實施完成（2026-06-11）_

---

## Phase 3 — 流程與整合（待確認後開始）

> **驗收標準：** 家長通告生成後狀態 = PENDING\_APPROVAL → APPROVER（副校長）一鍵批核 → DocCard 解鎖「發出」按鈕；生成文件自動存入 Google Drive；代課確認後事件寫入教師 Calendar；語音輸入可用；週五自動推送週摘要。

---

### 1. 審批流程

> 已有基礎：`Document.approvalStatus`（NOT_REQUIRED / PENDING / APPROVED / REJECTED）、`[NEEDS_APPROVAL]` 標記、`APPROVER` 角色。本節打通整條流程。

- [ ] `1.1` Prisma migration：`Document` 加 `approvedBy String?`（批核人 userId）、`approvedAt DateTime?`、`rejectionReason String?`
- [ ] `1.2` `/approvals` 頁面（APPROVER + ADMIN）：待批清單，每行顯示文件標題、申請人、類型、提交時間，可展開預覽內容
- [ ] `1.3` `PATCH /api/approvals/[id]`：批核（→ APPROVED）或退回（→ REJECTED，附原因）；寫 AuditLog（action=APPROVE / REJECT）
- [ ] `1.4` DocCard UI 更新：`PENDING` → 顯示「⏳ 待 APPROVER 批核」鎖定狀態；`REJECTED` → 顯示退回原因；`APPROVED` → 解鎖 Word / PDF 下載及 WhatsApp 推送按鈕
- [ ] `1.5` Pusher 通知：批核 / 退回時廣播俾申請人（channel `user-{userId}`，event `doc-approval`）→ 前端 toast
- [ ] `1.6` Header 加「待批核」紅點徽章（APPROVER 專屬），輪詢 `GET /api/approvals?status=PENDING`，有未處理項目時顯示數字

---

### 2. 範本庫 ✅ Phase 2 已完成

> `/settings/templates` CRUD、isDefault、`{{佔位符}}`、Agent 注入均已在 Phase 2 實施。Phase 3 如有需要可加版本歷史或多語言範本，暫列為選做。

- [ ] `2.1`（選做）範本版本歷史：每次 PATCH 前保存舊版，可一鍵還原
- [ ] `2.2`（選做）範本預覽：前端即時把 `{{佔位符}}` 替換成示例值顯示效果

---

### 3. Google Drive 存檔

> 依賴：Google Workspace service account（與現有 Google SSO 同一 project）或 OAuth2 impersonation。

- [ ] `3.1` Prisma migration：`Document` 加 `driveUrl String?`、`driveFileId String?`
- [ ] `3.2` `src/lib/gdrive.ts`：`googleapis` npm client（service account JWT auth）；`ensurePath(docType, date)` 建立 / 找到 `學校文件/{docType}/{YYYY-MM}/` 資料夾；`uploadFile(buffer, filename, mimeType, folderId)` 回傳 `{ id, webViewLink }`
- [ ] `3.3` `/api/doc` 生成後：DOCX + PDF 各上傳一份，更新 `Document.driveUrl` + `driveFileId`（背景執行，失敗唔影響下載）
- [ ] `3.4` DocCard 顯示「☁ Drive 連結」按鈕（driveUrl 存在時才顯示）
- [ ] `3.5` `.env.example` 加：`GOOGLE_SERVICE_ACCOUNT_JSON`（base64 編碼的 service account key JSON）、`GOOGLE_DRIVE_ROOT_FOLDER_ID`

---

### 4. Google Calendar 代課事件

> 代課老師 WhatsApp 回覆 CONFIRMED → `SubstitutionRequest.waStatus = CONFIRMED` → 自動在代課老師 Calendar 建立事件。

- [ ] `4.1` `src/lib/gcal.ts`：`googleapis` Calendar client；`createSubstitutionEvent(sub)` → 建立事件（title=`代課：{classCode} {subject}`、開始/結束時間由節次換算、description=`代替 {requesterName} 老師`）
- [ ] `4.2` `/api/notify/callback` 在 status=CONFIRMED 後呼叫 `createSubstitutionEvent`（背景，失敗唔影響回調回應）
- [ ] `4.3` `SubstitutionRequest` 加 `calendarEventId String?`（Prisma migration）
- [ ] `4.4` `.env.example` 加：`GOOGLE_CALENDAR_ID`（default calendar ID，或可按老師 email 查對應 calendar）
- [ ] `4.5` 節次時間對照表（config）：節次 1-9 對應學校上課時間（`src/lib/schedule.ts`）

---

### 5. 語音輸入

> Web Speech API（瀏覽器原生，無需後端）；HTTPS 已由 Zeabur 提供。

- [ ] `5.1` `src/components/VoiceButton.tsx`：`SpeechRecognition` API 封裝，語言設 `zh-HK`；錄音中顯示紅色脈衝動畫；interim transcript 即時顯示到 textarea
- [ ] `5.2` ChatPanel 輸入區加咪高風按鈕（緊靠 textarea 右側）；瀏覽器不支援時自動隱藏（`typeof SpeechRecognition === 'undefined'`）
- [ ] `5.3` 靜音自動停止（`SpeechRecognition.continuous = false`），錄音結果追加到現有輸入內容
- [ ] `5.4` 視覺反饋：錄音中 textarea border 轉紅色 + 「🎙 錄音中…」提示

---

### 6. 每週摘要 Cron

> Zeabur scheduled job 呼叫安全端點，不依賴前端。

- [ ] `6.1` `GET /api/cron/weekly-summary`：header `x-cron-secret: {CRON_SECRET}` 驗證；查最近 7 天 Task / AuditLog / SubstitutionRequest
- [ ] `6.2` 統計：總任務數（按 Agent / docType 分）、DOCX / PDF 生成數、WhatsApp 推送數、審批數（批核 / 退回）、代課數
- [ ] `6.3` 用 Claude（claude-haiku-4-5）生成摘要段落，標示異常（如某天任務量暴升）
- [ ] `6.4` 推送 via `sendWhatsApp()`（發到 `WEEKLY_SUMMARY_RECIPIENTS`，逗號分隔電話）
- [ ] `6.5` `.env.example` 加：`CRON_SECRET`、`WEEKLY_SUMMARY_RECIPIENTS`
- [ ] `6.6` Zeabur cron 表達式：`0 8 * * 5`（UTC 08:00 = HKT 16:00，每週五）；說明寫入 `tasks/zeabur-cron.md`

---

### 7. 收尾與驗收

- [ ] `7.1` 審批流程端到端：出家長通告 → PENDING → APPROVER 批核 → DocCard 解鎖 → 下載 / 推送
- [ ] `7.2` 退回流程：APPROVER 退回並填原因 → 申請人收 toast → DocCard 顯示退回原因
- [ ] `7.3` Google Drive：生成 DOCX → 確認檔案出現在 Drive `學校文件/{type}/{YYYY-MM}/`
- [ ] `7.4` Google Calendar：代課 CONFIRMED → 事件出現在代課老師 Calendar
- [ ] `7.5` 語音輸入：Chrome/Safari 講廣東話 → 文字準確出現在輸入框
- [ ] `7.6` 週摘要：手動 curl `/api/cron/weekly-summary` → WhatsApp 收到摘要
- [ ] `7.7` 更新 `tasks/lessons.md`

---

_Phase 3 任務清單建立於 2026-06-11，等待確認後開始實施_


## AgentOS 指揮台與校務排程（2026-10-09）

完整規格：docs/AGENTOS_PLAN.md；下一次接續：tasks/handover.md。

- [x] 確認總管、團隊、介面、審批方向及整理完整計劃
- [ ] 取得功能實施批准
- [ ] Hermes/Codex 受控接駁驗證及修復Hermes CLI
- [ ] A/B/C介面草圖確認
- [ ] 持久化Job/Worker/審批/事件及像素橋接
- [ ] 真實開發垂直流程驗收
- [ ] eClass/Excel/班主任摘要/發送審批小批驗收
- [ ] 非辦公時間排程及故障恢復驗收
- [ ] Portal權限與分析/IEP/問卷/關顧逐模組整合
- [ ] Spark部署及過夜測試

### Review
本次只保存計劃與交接；未開始功能實作，未啟用cron。舊清單勾選須以實際代碼及運行驗證。

### 跨服務責任修訂（2026-10-09）
- [x] 記錄分開服務/資料庫、整合使用的決定
- [x] 明確唯一業務排程與Portal資料/校務執行責任
- [x] 修訂本機Portal計劃及GitHub AgentOS計劃/交接
- [ ] 實作前驗證parentJobId/operationId/idempotencyKey及權威批准協議

Review：本次為文件修訂；未執行產品測試、未啟用排程或部署。

## Foundation implementation — 2026-10-09
User authorized implementation in this session. Work branch: codex/agentos-foundation.
- [x] Verify installed protocol handshakes and isolated no-tools planning/read-only adapters (live inference pending).
- [x] Add durable parent job schema, version-bound plan approval and authenticated APIs.
- [x] Add background worker lease/recovery and restricted executor interface; unsupported operations fail closed.
- [x] Verify transport, version/idempotency, cancellation/recovery and ownership tests on isolated fixtures.
- [x] Implement user-selected layout A and pass synthetic browser E2E.
- [x] Prepare setup, progress and next-session handover documentation.
- [ ] Configure and validate real local inference (user confirmed no model yet).
- [ ] Qualify real PostgreSQL multi-worker serialization and school Google SSO.
- [x] Phase 2 continuation: real PostgreSQL 16.15, independent backends, seven synthetic concurrency/recovery checks; production migration, process crash/load testing and real SSO remain pending.
- [ ] Portal operation/approval contract integration, full Pixel Agents bridge and business cron.
- [ ] Dependency security upgrade and production/Spark qualification.

### Foundation review
17 Node/Prisma tests + 6 Python bridge tests pass; browser E2E passes with real Next APIs and synthetic sessions/plans. No live model, student data, email or deployment. This is an implementation foundation, not full product completion; see latest handover and docs/OFFICE_FOUNDATION.md.

## 學校流程優先修訂 — 2026-10-09
- [x] 用戶批准六項計劃修訂並要求同步 Portal 聊天。
- [x] 記錄流程優先順序、版本契約、知識庫、證據、正式行動狀態及成效指標。
- [ ] 實作 workflow 版本契約及 Portal 強制核對/權限；不要只靠文字 prompt。
- [ ] 合成資料驗收班務完整流程及停止/批准失效/防重複/未知發送結果。
- [ ] 授權真實小批驗證後再啟用唯一業務 cron。
- [ ] 班務驗收後依次活動文件包、會議決議跟進；再擴展 IEP/問卷/關顧。
- [ ] 建立人工基準，量度老師耗時、修改量、漏項及同事獨立使用。

Review：此次只修訂文檔；檢查跨服務分工、驗收及 Git diff，不代表新增程式測試或功能完成。

## Phase 2 continuation — PostgreSQL qualification (2026-10-09)

- [x] Resume latest foundation handover on isolated branch `codex/agentos-phase2`, based on `de8725c`.
- [x] Add opt-in `npm run test:postgres` with explicit local disposable database guard and generated-schema cleanup.
- [x] Deploy and verify both migrations; test independent-backend claims, duplicate/opposing approvals, recovery, reconnect and stale-result fencing (7/7).
- [x] Existing Node tests (17/17), Python tests (6/6), typecheck and lint (one existing warning).
- [x] User approved commit/push; published `9a7e221` on `codex/agentos-phase2` and opened [draft PR #14](https://github.com/minglo94/kcagentos/pull/14), targeting `codex/agentos-foundation`. No merge or deployment.
- [ ] Configure dedicated local inference; confirm private Portal API/identity/approval contract before school workflow implementation.

Review: application behavior unchanged; no live model, Portal, school data, email, cron or deployment. See `docs/POSTGRES_QUALIFICATION.md` for reproducible commands and evidence limits. This milestone does not complete the full AgentOS plan.

## Continued verification and school authentication — 2026-10-09

- [x] User confirmed both AD and separate AgentOS accounts; AD is a local Windows domain.
- [x] Extend real PostgreSQL qualification to kill separate worker-core processes during planning/execution; 9/9 checks passed.
- [x] Prepare written authentication design in `docs/SCHOOL_AUTH_DESIGN.md`; user approved the written design. Login implementation has not started.
- [x] User approved written authentication design; self-reviewed implementation plan saved at `docs/superpowers/plans/2026-10-09-school-auth.md`.
- [x] User reiterated continuation after plan handoff; inline implementation authorized.
- [ ] Implement/test AD over verified LDAPS, local credentials, administrator provisioning, shared attempt budgets and session revocation.
- [ ] Validate school-controlled AD connection and staff test accounts after authorization and private configuration.
- [x] Recheck dependency audit: still 24 advisories (7 moderate, 15 high, 2 critical); raw audit output is local scratch, not committed.
- [ ] Test dependency upgrades separately; do not use automatic forced upgrades as production evidence.

Review: the new process tests execute the real worker core with synthetic blocked services and accelerated persisted lease expiry. Full worker-loop/model process crashes, load, machine reboot, school authentication, Portal and deployment remain unverified. Typecheck passed after adding the test subprocess's required `NODE_ENV`; lint retains the existing warning.

## School authentication implementation — in progress
- [x] User continued after the written-plan handoff; proceed directly with the reviewed design.
- [x] Additive credential/AD-identity/attempt-budget schema and bounded scrypt primitives (password tests 2/2).
- [x] Local authentication, active-admin provisioning, bootstrap guard, reset revision and explicit identity store checks (4/4).
- [x] Real PostgreSQL shared login budget: ten concurrent reservations allow exactly five; total PostgreSQL qualification 10/10.
- [x] AD/local provider, provisioning, login/admin UI, absolute session revocation and first-admin CLI implemented; fresh review findings fixed with failing-then-passing tests.
- [x] Genuine local NextAuth browser exchange, Office browser workflow and synthetic production build passed; real AD remains pending.
- [x] Concurrent PostgreSQL bootstrap/credential/GUID conflicts and six-worker, 32-job synthetic load passed (12/12); exposed claim/retry contention fixed.
- [ ] Real school AD and live model/Portal/Spark acceptance require their configured services.

## Dependency qualification — 2026-10-09
- [x] Next 15.5.27 / matching ESLint config, Tailwind 4.3.3, PostCSS 8.5.29; compatible lockfile updates and scoped ExcelJS UUID 11.1.1 override.
- [x] Migrate async route/search parameters, PostCSS integration and internal Next links; production build passed.
- [x] Document pipeline compatibility uncovered existing Archiver 8 factory mismatch; shared ZIP class adapter now passes DOCX extraction/ZIP and spreadsheet round trips.
- [x] Node 34/34; genuine browser auth now also covers both provider choices, UI provisioning, missing Origin, forged GUID and disabled admin; Office browser passed.
- [x] Audit reduced 24 → 8 (0 critical, 5 high, 3 moderate). Remaining chains: build-time ESLint/fast-glob/micromatch/braces and Mammoth CLI argparse/sprintf-js. No compatible fixed release established; no unsafe historical downgrades.
- [ ] Production hardening/real AD and service qualification remain gates.

## Migration/deployment continuation — 2026-10-09
- [x] Real PostgreSQL pre-auth migration rehearsal preserves users, owned jobs, plan hashes/versions and approvals; repeated deploy is a no-op. Suite 13/13.
- [x] Prepare non-root production Docker image definition, loopback Compose with explicit migration profile, optional verified school CA mount and host-worker unit; Compose quiet validation and systemd syntax verification passed.
- [x] Production Linux/AMD64 image built; disposable-container browser qualification passed (non-root/read-only web, real local login, scope, persistence, revocation, runtime loader without dev tooling). No actual Spark deployment or service activation.
- [x] Record concrete remaining dependencies and verified Pixel upstream limitations in docs/PHASE2_STATUS.md. Portal implementation still requires its authoritative contract; no invented API, duplicate outbox or business cron.
- [x] Production-only audit: 3 moderate, zero high/critical; full tree remains 8.

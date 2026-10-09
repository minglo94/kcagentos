# AgentOS 進度交接

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

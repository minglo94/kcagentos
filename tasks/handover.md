# AgentOS 進度交接

> 最新實施交接（2026-10-09）：首版已在 `codex/agentos-foundation`，見 [草稿 PR #13](https://github.com/minglo94/kcagentos/pull/13)，commit `d05bc1f9ceab1301e0cd6586700178414ba90acd`。尚未合併或部署。
> 已驗證：17 個 Node／資料庫測試、6 個 Python 測試、瀏覽器 E2E、typecheck 及完整 build；lint 有一個既有警告。模型尚未設定，接駁及測試骨架完成；Portal、完整像素動畫及夜間 cron 待續。PGlite 不代表 PostgreSQL 多 worker 驗證，現有依賴漏洞需另行修復。
> 下次先讀該分支的 `tasks/handover.md`、`docs/OFFICE_FOUNDATION.md` 及 PR，再接續工作；下方歷史狀態不代表最新實施進度。


更新：2026-10-09（香港時間）

## 現況
- 已完成：閱讀 kcagentos 架構與另一個 Teacher Portal 聊天；確認 Hermes 總管、本機首版、開發＋學校、計劃及對外操作審批；整理完整計劃與夜間排程設計。
- 已檢查：現有 repo 有 dashboard、文件審批、學校專員及 Claude/Ollama/LM Studio 模型層；未驗證部署運行。
- 尚未開始：功能實作、UI草圖、模型調用、校務資料收集、部署、排程啟用。
- 阻塞證據：已安裝 Hermes 命令的 chat --help 返回 `uv trampoline failed to canonicalize script path`，需在第一階段定位修復。

## 下一次提醒
1. 先讀 AGENTS.md、docs/AGENTOS_PLAN.md、tasks/todo.md、本文件、tasks/lessons.md，並檢查當前branch及工作區。
2. 確認用戶批准實施；目前批准的是計劃保存，不是功能實作。
3. 第一件實施工作：Hermes 專用profile與受控adapter接駁驗證，然後Codex app-server；不要先砌動畫假裝執行。
4. Portal聊天：codex://threads/01a120d8-4d93-7f70-aa40-fa96902e9bd2；只讀取需要的最新狀態，不自行向該聊天發指令。
5. 啟用排程前確認時間、校曆、來源、通知管道；Spark型號/OS/連線、ESDA定義、APASO規則及IEP範本仍需確認。

## 更新規則
每個里程碑、阻塞、重要決策、會話結束更新本文件和todo；記實際測試結果、失敗與commit。未測標明未測。公開GitHub不得保存學生資料、憑證或內網資訊。

## 2026-10-09 整合責任更新

用戶已要求記錄：整合使用，分開服務與資料庫；見 docs/INTEGRATION_DECISION.md。AgentOS負責唯一總管與業務排程，Portal負責唯一學生資料、校務子操作及業務審批。不得各自實作完整排程/派工/計分/電郵系統。

已同步修訂本機 Keichi Local 計劃與任務；其private repo尚未建立，不宣稱已發布。下一次先讀整合決定，實施前把父job/子operation/批准引用協議驗證清楚。所有功能、部署與cron仍未開始。

## 學校流程修訂交接 — 2026-10-09
用戶批准更新 GitHub plan 並同步 Teacher Portal 聊天。完整新增規格見 docs/AGENTOS_PLAN.md 第11節。
優先班務完整流程，再活動文件包、會議決議跟進；新增版本化流程契約、受控知識庫、結構化證據、草稿/內容批准/發送批准/正式結果與老師使用成效規格。
下一步：完成既有技術前置驗證後，以合成資料驗收班務流程（Portal 工具/權限/權威批准/outbox），再授權真實小批，最後 cron；不以 manual 證據文字或動畫宣稱完成。
已向 Build private AI teacher portal（01a120d8-4d93-7f70-aa40-fa96902e9bd2）發送用戶授權同步指示，由該聊天更新其本地計劃與交接。Portal private repo 未建立時不得宣稱 GitHub 已同步。
本次只有計劃文件修訂，沒有新功能、學生資料、發送、部署或排程。首版技術骨架仍見 PR #13；既有測試證據不等於新增流程已驗收。

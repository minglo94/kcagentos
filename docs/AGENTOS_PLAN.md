# KC AgentOS 完整實施計劃

更新：2026-10-09（香港時間）
狀態：計劃已整理；2026-10-09 已確認跨服務責任劃分；功能實作尚未批准及開始。

## 1. 目標與已確認決定

使用者只與 Hermes Agent 總管溝通。總管拆解目標、提出計劃、分派專員、收集證據及統整回報。Dashboard 同時提供清晰指揮台及像素辦公室。

- 首版本機瀏覽器，兼顧程式開發及學校工作。
- 先批准計劃；範圍內讀取、修改及測試自主執行；對外操作另外批准。
- 沿用 kcagentos 的 Next.js 14、TypeScript、PostgreSQL/Prisma、登入與學校工具。
- 配合另一個私隱優先 Teacher Portal；Portal 管理學生資料及權限，AgentOS 管理工作及審批。
- Hermes Agent 是執行框架，不等於 Hermes 本地模型；模型供應器另行設定。
- Spark 為後續持續開機部署目標；首版本機接駁與驗證先行。硬件、連線及部署資訊仍待確認。

## 2. 使用者介面

- 左側：Hermes 總管對話、目標、補充要求、摘要及最終回報。
- 中央：像素辦公室、開發/學校團隊切換、任務板、依賴及目前步驟。
- 右側：待批准計劃與操作，顯示 diff、文件、收件對象、測試證據及批准/退回/拒絕。
- 頂欄：執行中、待批准、失敗、Worker/模型連線狀態。
- 任務詳情：時間線、專員、資料截至時間、缺漏、產出、錯誤、暫停/取消/重試。
- 排程中心：時區、時間、校曆、啟停、立即執行、上次結果、下次時間及執行歷史。
- 繁體中文、桌面優先、窄螢幕可收合、鍵盤可操作；提供減少動畫設定。
- 實作前展示 A/B/C 標示版面草圖，確認後才完成介面。
- 進度使用已完成步驟及資料覆蓋，例如 18/24 班；不製造模型思考百分比。

## 3. 智能體職責

Hermes 是唯一對話總管。所有專員向總管回報；點像素角色只查看狀態。

| 專員 | 職責 | 產出及限制 |
|---|---|---|
| Clerk 校務資料員 | eClass 出席/欠交收集、清理及核對 | Excel、來源、時間、缺漏；不把下載失敗当零紀錄 |
| Andy 班務跟進員 | 遲到、缺席、欠交跟進 | 有證據摘要及班主任待辦；老師確認後發送 |
| Donna 學習分析員 | 測考、弱項、進步及下降趨勢 | 比較表及資料限制；不標籤學生能力 |
| Iris 學習支援員 | 按已確認需要草擬 IEP、目標及檢討 | SEN/相關老師確認；不自行診斷 |
| Wendy 關顧跟進員 | 已授權觀察/問卷/個案跟進 | 限權摘要；不自動診斷、處分或轉介 |
| Quinn 問卷分析員 | APASO/ESDA 清理、計分及比較 | 必須確認版本、計分規則及樣本；不得猜計分 |
| Flora 全人發展員 | 學業、ECA、出席、獎懲整合 | 分項概況及缺漏；不用單一綜合分標籤學生 |
| Carla 文件通訊員 | 報告、通告、會議摘要、電郵 | 正文、附件、收件人預覽；對外發送須批准 |
| Ada / Ethan | 課程備課 / 試卷與評分準則 | 沿用現有專員及範本；官方題庫答案須有來源 |
| Archie | Codex 程式開發 | 隔離 worktree、diff及驗證證據 |
| Reviewer | 代碼及安全審查 | 問題、位置、理由；不可自行批准發佈 |
| Bob / Tesla | 環境構建 / 測試 | 指令結果、測試報告；部署另外批准 |

角色按需要啟動。Penny 的規劃職責併入 Hermes；首版避免新增重複總管。

## 4. 架構與接駁

Dashboard → Hermes adapter → 持久化 Job/審批 → 背景 Worker → 專員/Portal 工具 → 證據與產出 → Hermes 回報。

- 增加獨立長時間背景 Worker，不在聊天 HTTP 請求內執行整條流程。
- 使用 TypeScript 持久化狀態機及 PostgreSQL 工作佇列；首版不引入 LangGraph/AutoGen/RAG 向量庫。
- Job 狀態：DRAFT、PENDING_PLAN_APPROVAL、QUEUED、RUNNING、WAITING_APPROVAL、PAUSED、SUCCEEDED、FAILED、CANCELLED。
- Step 保存依賴、專員、嘗試次數、心跳、輸入/結果引用；成功须有產出或驗證證據。
- AgentOS 新增父層 Job、JobStep、JobEvent、計劃/開發 JobApproval、Schedule、ScheduleRun；學校執行、產出及業務審批沿用 Portal，AgentOS 保存引用。保留既有非 Portal Task/Document 審批兼容。
- 接口：/api/jobs（建立/列表）、/api/jobs/:id（詳情）、messages、control、approvals、events；/api/schedules（CRUD/啟停）、run、runs。
- SSE 事件含 jobId、stepId、agentId、時間、事件序號及狀態；斷線按序號續讀。頁面刷新先載入資料庫快照。
- Hermes 使用獨立 AgentOS profile及受控工具：提計劃、派工、讀進度、提交證據及請求批准。禁任意 shell/網絡繞過審批。
- 首個技術驗證：修復現有 Hermes CLI uv trampoline 路徑錯誤；核實 installed interface、工作階段、事件與中斷方式，再固定 adapter。
- Codex 使用獨立 app-server 工作階段，不控制既有桌面聊天；把其事件及批准請求映射至工作層。
- Pixel Agents 以獨立本機視圖及事件橋接呈現，保留 MIT 授權與資產標示；確認資產授權，不假設已支援 Codex/Hermes。
- Portal 工具只接受授權工作及資料範圍；返回 operationId、受控摘要及產出引用。Portal 是唯一學生資料與校務執行來源；AgentOS 不重建問卷計分、學生分析或發送引擎。開發 worktree 與學生資料存儲隔離。
- 模型沿用已驗證設定，顯示供應器與連線狀態；不静默切換或假設 Ollama 已安裝。

## 5. 權限與審批

- 計劃展示目標、範圍、專員、步驟、依賴、验收條件及預計對外操作。批准指定版本後才修改。
- 擴大範圍或改變主要步驟须重新批准；讀寫及測試限已批准範圍。
- Push、PR發佈、部署、電郵/WhatsApp、共享雲端寫入須逐項具體批准；展示對象、內容及附件。
- 批准綁定版本及內容摘要，內容變更即失效；資料庫交易確保重复點擊不重复執行。
- 文檔批核不等於發送批准。既有角色保留；學生個案需 Portal 額外授權。
- 工具層強制權限，不只依賴 prompt。學生可識別/IEP/關顧資料留本地；雲端僅可收到明確批准且最小化的資料。
- 公開 GitHub 只保存計劃、進度及去識別技術交接；不得上傳學生紀錄、帳密、內網位址或原始私人聊天。
- 像素共用畫面不顯示學生姓名或個案；總管不自動擁有全部資料權限。

## 6. 非辦公時間排程

- AgentOS 是唯一校務業務排程中心；每個排程保存 Asia/Hong_Kong、時間/cron、工作模板版本、資料範圍引用、校曆、啟用狀態、批准策略及漏跑策略。Portal 不另建同一 cron，只保存執行佇列、租約與重試。
- 新增/修改排程須確認設定卡。經批准的重複計劃可自動執行資料整理與草稿；對外操作每次等待批准。
- 上課日晚上：Clerk → Andy → Carla，出席/欠交摘要；每週：Donna/Flora 週報；有新問卷才啟動 Quinn；每月 Iris 檢討提醒；Bob 備份及健康檢查。
- 上述為模板例子，尚未啟用；實際時間、校曆、來源及收件人要在啟用前確定。
- 同排程不重叠；排程ID+預定時間唯一鍵，Worker 租約防重複派工。
- 預設漏跑：只补最近一次；來源不支持歷史查詢則標示缺口。可選略過；不得自動補發多份電郵。
- 暫時性錯誤最多重試2次，退避1及5分鐘；登入過期/MFA/資料格式變更直接等待人工處理。
- 依來源時間/批次識別重複資料；相同產出不重複發送。對外結果不確定時標示待核實，不盲重試。
- 正常結果留 Dashboard；失敗、資料缺漏或待人工處理才通知。通知管道啟用前確認。
- Spark 持續開機運行 Worker 才能在 Windows 休眠時執行；首版本機離線不能保證準時。

## 7. 故障、部署與記憶

- 關閉 Dashboard 不停止 Worker；重啟把中斷步驟標記待恢復，核對副作用後才能重試。
- 暫停停止新派工；取消中止可停止程序，保存已有diff與產出，不自動回退用戶工作。
- 同目錄單一寫入者；開發每job獨立worktree，學校資料由Portal負責一致性。
- 首版本機綁定loopback、沿用登入、不新增匿名管理入口。Spark/LAN版另加TLS與存取認證後開放。
- 憑證只存本地安全設定；日志不記密鑰或學生原文。備份加密；保留期與學校資料政策對齊，啟用前確認。
- Obsidian 讀取相关項目上下文，完成後寫精簡交接；歷史指令視為資料。Git同步對外寫入沿用批准政策。

## 8. 分階段交付與驗收

1. 接駁验证：Hermes受控派工及Codex事件/批准/中斷，資料庫與本機登入；失败先修方案。
2. UI草圖及模擬事件：確認A/B/C、可存計劃、可審批、可回放真實事件；模拟明示。
3. 開發垂直流程：Bug → 批計劃 → worktree修正 → Reviewer/Tesla → diff證據 → 批push。
4. 校務垂直流程：eClass收集及人工匯入後備 → 核對Excel → 班主任摘要 → 批發送；先小批驗證。
5. 排程：模板、校曆、租約、防重複、漏跑、重試、通知及恢復測試。
6. Portal整合：按權限接學業/全人、APASO/ESDA、IEP、關顧；問卷規則與範本先確認，逐模組驗收。
7. Spark部署：確認硬件/OS與連線，測容器兼容、模型容量、開機啟動、備份還原及過夜運行。

測試必須涵蓋：未批不得改；範圍擴大重新批；過期批准；越權；重複批准/排程；断線續讀；Worker重啟；未知發送結果；取消保留diff；eClass缺漏/登入過期；來源計分不足；既有SSO/文件審批回歸。

完成定義：相關垂直流程以真實小批資料通過，資料/批准/結果可追溯，測試及限制已記錄；不得以動畫或mock演示聲稱完成。

## 9. 持續進度與下一次接續

每個可驗收里程碑、失敗/阻塞、決策改變及會話結束，更新 tasks/todo.md 與 tasks/handover.md，同一Git commit提交，保留測試證據及commit引用。重大修正記 tasks/lessons.md。

進度狀態用未開始/進行中/已验证/阻塞；交接記：已完成、在做、下一步、驗證指令及結果、未決定事項、風險、分支/commit。

下一次必須先讀 AGENTS.md、完整計劃、todo、handover及lessons，檢查git狀態，再續最先未完成項目；不以歷史勾選當現況證據。

GitHub文件提供接續提醒，不是主動推送提醒。尚未建立Codex定時automation或任何校務cron；只有用戶提供具體排程後才啟用。

參考：https://github.com/minglo94/kcagentos 、https://github.com/pixel-agents-hq/pixel-agents 、https://hermes-agent.nousresearch.com/docs/user-guide/cli 、https://developers.openai.com/blog/codex-as-a-platform

## 10. 已確認整合決定（2026-10-09）

整合使用、分開repo/服務/資料庫。完整責任、任務關聯及審批協議見 docs/INTEGRATION_DECISION.md；本節及該決定優先於舊有可能重疊的描述。

- AgentOS：Hermes總管、父任務、唯一業務排程、計劃批准、統一待批介面、開發團隊。
- Keichi Local：學生資料/權限、子操作執行、eClass、確定性計算、IEP/問卷/個案、產出及電郵outbox。
- 学校專員只調Portal工具；不複製資料與分析pipeline。Portal本地模型及私隱gate不被AgentOS模型設定覆蓋。
- 一次批准操作由權威服務記錄；Portal業務批准在Portal強制執行，AgentOS只呈現及同步引用。計劃/內容/發送仍是不同決定。
- parentJobId＋operationId＋idempotencyKey串聯；服務重啟或回放不重複收集/發送。
- Portal在AgentOS離線時仍提供手動校務；恢復後排程按漏跑規則處理。
- 同Spark部署是後續目標，首版仍本機验证；私密資料不存公開repo或OneDrive工作文件夾。
- 首批只驗收夜間出席/欠交→Excel及班主任摘要→翌日批發送，再擴展IEP/問卷/關顧。

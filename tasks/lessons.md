# 錯誤記錄 — 防止重複

## 2026-10-13 — Cloud qualification
- Finish provisioning processes that load Prisma before generating/building its Windows client; otherwise the query-engine DLL cannot be replaced.
- A Neon admin may need membership in a newly created restricted role before assigning that role database ownership. Keep the new application database and credentials separate; do not fall back to Portal's schema.
- Verify current parallel-chat/repository state before relying on an older handover. Portal now exists and its separate gateway branch/dependency qualification must be reflected accurately.

## 2026-10-12 — Dependency repair and Portal reconciliation
- npm audit may suggest destructive downgrades when a transitive library has no patch. Prefer replacing the unused vulnerable dependency or its build-tool chain; document lint coverage changes and verify document/CSS behavior.
- Next 15 requires awaited dynamic params/searchParams and the current serverExternalPackages key. Browser tests must wait for the actual mutation response rather than assume cold dev compilation fits a five-second assertion.
- Portal operations must survive OfficeStep replacement. Persist the key/hash before HTTP, reject changed identities/payloads, and do not resubmit known accepted operations when lookup returns 404.
- JSONB may reorder object keys; parse through the same strict schema before equal-revision comparison. Unknown or late responses must not overwrite terminal records or expired parent leases.

| 日期 | 問題 | 解決方法 |
|------|------|---------|
| Phase 1 | Prisma v7 改變 `datasource` 配置格式，`url = env(...)` 唔再有效 | 降回 Prisma v5（`prisma@5 @prisma/client@5`） |
| Phase 1 | `Buffer` 唔直接相容 `BodyInit`（Node 22 類型收窄）| 用 `as unknown as BodyInit` cast |
| Phase 1 | Next.js App Router 用 `<link>` 引入 Google Fonts 會觸發 `no-page-custom-font` 警告 | 改用 `next/font/google` |
| Phase 1 | `create-next-app` 唔能夠直接 scaffold 至已有檔案的目錄 | 先 scaffold 到 `/tmp`，再 `cp -r` 入目標目錄 |

## Phase 2 教訓

- **archiver CJS 與 Next.js webpack 唔兼容**：`Module not found: Default condition should be last one`。`experimental.serverComponentsExternalPackages` 對 archiver 無效（webpack 仍嘗試以 ESM import），最終用 `config.externals.push("archiver")` + route 內 `require()` 解決。
- **@types/archiver 冇 default export**：TypeScript strict 下 `import archiver from "archiver"` 報錯，改用 `import type` + `require()` 取值。
- **tsx 測試腳本喺 /tmp 時 `@/` alias 唔生效**：要用絕對路徑 import，或日後加 vitest 配 tsconfig paths。
- **Agent 工具迴圈設計**：`[NEED_TOOL:x]{json}` 喺串流完成後先解析，將結果以 user message 回饋再串流第二輪（上限 2 輪），避免阻塞首輪輸出。

## 2026-10-09 — 避免跨項目重複實作

AgentOS及Keichi Local同時規劃時，先確定功能權威與共享契約。總管/業務排程只在AgentOS；學生資料、校務子操作、計分、文件及發送在Portal。不同層級工作紀錄可並存，但不得重複派工或審批權威。

## 2026-10-09 — Implementation verification

- User approved layout A and clarified no local model exists yet. Complete the adapter/test foundation without claiming inference or downloading a model implicitly.
- Stock Hermes ACP has broad tools; a dedicated profile alone is insufficient. Validate no-tools runtime and keep Worker approval authoritative.
- Codex read-only filesystem policy alone is insufficient for inherited connectors; use isolated home/environment and disable extra capabilities.
- PGlite multiplexes one backend; simultaneous Prisma clients can collide in prepared statements. It is a fixture, not proof of real PostgreSQL concurrency.
- Next dev can normalize request origins; compare state-changing requests to the configured NEXTAUTH_URL and test both legitimate and hostile origins.
- Windows Prisma DLL generation must run after the app is stopped; do not build while browser tests hold that DLL.

## 2026-10-13 — Verify deployment identity before mutation

- Inspect the actual checkout's `.vercel/project.json` project/team IDs before every deployment; named-project inspection alone does not verify linking.
- Stop immediately on native command failure in PowerShell. A failed link followed by deploy can create an unintended project.
- Use an explicit preview target for Portal pairing. A project's first default deployment can become production even when test credentials are protected.
- Confirm the READY deployment, protected access and real authenticated browser behavior; local build success alone is insufficient.

## 2026-10-13 — Teacher interface correction

The user clarified that normal teachers use Portal only, including every approval and action confirmation. Do not require an AgentOS login or treat the operator dashboard as school approval authority. Preserve backend orchestration in AgentOS and implement Portal-originated request/decision/progress protocols; current test UI does not prove that workflow exists.


## 2026-10-13 — Teacher entry qualification

- Next route Request URLs may normalize to an internal localhost origin. Validate configured public Host and signed service audience independently; keep browser Origin rejection and never infer audience from arbitrary forwarded headers.
- Run only one Next dev process per checkout at a time: different ports still share build artifacts. Separate databases do not isolate `.next`.
- Pre-approval pause can strand a workflow when resume requires approval; reject before writing a command and disable the corresponding control in the UI.
- A bounded per-call timeout does not bound a page of sequential batches. Use one overall read deadline, cached-state freshness labeling and live scope checks.
- Worker heartbeat writes may contend with Serializable transactions on remote PostgreSQL. Verify against actual paired services after changing heartbeat cadence.
## 2026-10-09 — School authentication correction

- User clarified that school login uses local Windows AD and explicitly requested both AD and separate AgentOS accounts. Do not carry the old Google-only school-login assumption into acceptance tests.
- Keep AD identities and local credentials explicitly provisioned; a similar username/email is not evidence of account ownership. Never store AD passwords or silently fall back to local login after AD failure.
- Process-crash qualification must kill a separate process. A database-client reconnect alone is not a worker-process restart test; record accelerated lease expiry and synthetic service limits explicitly.

## 2026-10-10 — School data boundary clarification

User permits read-only online Teacher Portal PostgreSQL vector queries while prohibiting online search during student processing. Distinguish a scoped Portal connection from internet search. Local provider names and read-only Codex settings do not prove local inference or input-folder containment. Every-task audit needs protected input/output payload records, not action metadata alone; do not place student content in shared events or public Git.
## 2026-10-22 — Branch integration evidence

- Re-enumerate branches and refresh main before publication: another session may merge a branch during review. Preserve ancestry and incorporate its changes instead of repeating a stale merge.
- Adding a policy hash to existing jobs needs an explicit upgrade path that invalidates old approvals; never silently treat null as the current policy. Existing external operations must be reconciled before changing operation keys.
- Persist accepted external receipts independently of later audit/authorization finalization, so revocation cannot roll back knowledge of an accepted effect.
- Linux security guarantees must be tested using actual Linux Node/Prisma and a private Linux filesystem audit root. Plain WSL invocations can inherit Windows npm; assert process.platform and retain verification logs outside temporary snapshots.

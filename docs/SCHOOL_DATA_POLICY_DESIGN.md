# School data access and task audit design

2026-10-10 — user approved this written design with “Ok”. Synthetic policy/audit and private controlled-file staging have been implemented; live school activation and Portal query enforcement remain pending. Plans: `docs/superpowers/plans/2026-10-10-school-policy-audit.md` and `docs/superpowers/plans/2026-10-10-controlled-files.md`.

## Confirmed requirements

Every task keeps input/output records administrators can inspect. Agents mainly use local LLMs. Retrieval is limited to a NAS or configured input folders, with a separate output folder. The online Teacher Portal database is queried read-only. Online search is prohibited while processing student data. The user identifies the Portal database as PostgreSQL vector; pgvector is the working assumption, pending schema verification.

## Recommended approach

Use one server-owned policy across chat, planning, workers and tools, backed by filesystem and network restrictions on the school execution service. Prompt-only instructions cannot enforce these requirements. Application checks alone cannot constrain arbitrary subprocesses.

Keeping all retrieval behind Portal APIs is another option and simplifies Portal authorization, but does not itself provide the requested database-query option. Support only named queries against school-managed scoped views using a least-privilege database identity. Do not accept unrestricted SQL or general database credentials.

## Execution and models

Persist initiating staff identity, policy version, data classification, source IDs and output location ID with the task. Default school and unknown-data tasks to restricted. Clients and models cannot downgrade classification; derived summaries remain restricted. Scope or destination changes invalidate execution approval.

Default agents to local inference. Restricted tasks require an administrator-configured local runtime/model and local embeddings, with no cloud fallback. Validate actual destinations; disallow arbitrary client base URLs and cross-destination redirects. A provider named local is not evidence that it runs locally.

Deny online search, browser tools, arbitrary HTTP, external model/embedding APIs, cloud uploads and content-bearing notifications during student processing. Enforce before sending any prompt or invoking tools, including existing chat/document routes. Reject restricted execution paths without policy coverage.

Allow only configured local inference and the specific Portal connection for task data access. Authentication, persistence and audit service connections do not become agent tools. The online Portal exception does not allow general internet access. Existing Codex read-only settings do not prove local inference or restricted file visibility; disable that executor for student tasks until both are qualified. Preserve separately approved development workflows.

## Files

Administrators privately configure named roots and permissions. Agents select authorized IDs and relative paths, never arbitrary host paths or share credentials. Mount the NAS with a dedicated read-only identity. Input roots are read-only; output roots are separate, non-overlapping and never automatically become retrieval sources. Each task gets its own output directory, with no implicit overwrite.

Reject absolute paths, traversal, symbolic-link/reparse escapes and overlapping roots. Canonical path checks require mount/process isolation against path-swap races; string prefixes are insufficient. The agent must not see unrelated host folders. Apply file type/size/count limits and record source version/hash and read time. Missing sources fail explicitly.

Stage bounded outputs and publish atomically with a manifest/hash. Preserve incomplete status after cancellation/crash. Export/send remains separately approved. Linux mounts and Windows share/reparse behavior need platform-specific verification before real use.

## PostgreSQL and vector queries

Portal remains the authoritative student store. Use verified TLS and a dedicated non-owner, non-superuser, non-BYPASSRLS identity limited to approved views. Enforce read-only transactions, statement/lock timeouts and row/result-size limits, backed by actual database privileges. Revoke write, DDL, unsafe function and file/network capabilities. A SELECT prefix is not sufficient: functions can have side effects.

Expose named parameterized queries, never model-generated SQL. Portal must authorize the requesting teacher and class/date scope independently. Use a trusted Portal gateway or database-enforced scope; a shared credential plus a model-supplied teacher ID is insufficient. Verify view/RLS behavior for the deployed PostgreSQL version. Deny activation without an independently enforced scope contract.

For vector retrieval, verify extension, schema, embedding model/version/dimensions and distance metric. Generate query embeddings locally, apply authorized scope to the retrieval query, and return source references and timestamps. Do not copy the vector corpus into AgentOS, create indexes, install extensions or write embeddings using this account. Missing or incompatible embeddings fail explicitly.

Record parent job/query correlation, source freshness, completeness and authorization evidence. Query access cannot change records or send messages. Actual views, identity mechanism and vector schema remain unavailable; the adapter stays disabled until configured and qualified.

## Every-task input/output records

Assign durable attempt IDs before planning, chat, tool calls, worker execution and manual evidence submission; include retries and future scheduled tasks. Record actor, job/step IDs, policy version, executor/model, timestamps, status and approved source/output references.

Capture actual submitted inputs, tool requests/results and generated outputs, including partial output, refusal, failure, cancellation and crash recovery. Do not request hidden chain-of-thought. Never store credentials, session tokens, secrets or connection strings in these records.

Sensitive payloads remain in protected school-controlled audit/artifact storage; Portal-owned student payloads stay in Portal-controlled storage. AgentOS events and Pixel views expose safe metadata and opaque references. Administrator inspection resolves references through authenticated access, never public URLs. Check active administrator identity on every list/detail/download; Portal independently checks student-data access. AgentOS administrator status does not override Portal permissions. Audit inspection and exports too.

Persist input before invocation; stop if audit storage fails. Persist output before marking success. Crash recovery marks incomplete attempts without inventing output. Use existing lease/version fencing for stale results and idempotent attempt records for replays. Bound payload size, stream large content to protected artifacts, and visibly mark partial capture.

Configure encryption, access, backup and retention before live activation. Expired payloads leave content-free expiry markers; administrative deletion is audited. Existing AuditLog action metadata and Office events are insufficient evidence of full input/output capture. Inventory every task entry point before claiming complete coverage.

## Implementation sequence and acceptance

1. Add server-owned policy, durable attempt records and admin inspection using synthetic data. Cover workers and legacy chat; refuse uncovered restricted paths.
2. Add local routing and controlled file adapters. Test cloud/search denial, endpoint substitution, path traversal, symlink escape, overlapping roots and unauthorized output writes.
3. Add PostgreSQL named-query adapter after Portal views and scope contract are supplied. Test denied writes, unsafe functions and cross-teacher/class/vector retrieval against a disposable database.
4. Qualify isolation and auditing: forbidden traffic cannot leave, unrelated files are inaccessible, crash/cancel/retry records remain accurate, stale workers cannot publish success, revoked admins are denied and events/Pixel contain no student payloads.
5. Configure protected school services and retention; run an authorized small live workflow. Real student processing waits for these gates.

Live models, real AD, production migration, full Pixel Agents, scheduling and Spark remain unfinished. The design itself is a requirements document; current runtime coverage and gaps are in `docs/TASK_POLICY_COVERAGE.md`.

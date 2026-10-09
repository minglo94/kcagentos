# Phase 2 continuation — 2026-10-09

Branch: `codex/agentos-phase2`. [Draft PR #14](https://github.com/minglo94/kcagentos/pull/14) is stacked on `codex/agentos-foundation`; neither PR is merged. User authorized continuation and commit/push. Production migration, deployment and actual school business operations remain separate approvals.

| Requested work | Delivered evidence | Remaining requirement |
| --- | --- | --- |
| Live local-model planning/execution | Restricted Hermes/Codex adapters, protocol/approval/cancellation tests; explicit unavailable states | No configured model runtime/profile here. Need runtime/model choice and dedicated local configuration; then actual inference and approved read-only execution. |
| Portal/class summary | Ownership and workflow requirements preserved; AgentOS parent jobs/approval foundation | Private Portal repo/API contract unavailable. Verify staff mapping, capability/scope, parent/operation/idempotency/version binding, authoritative approvals and delivery reconciliation before implementing its adapter. |
| School login | Local and AD providers, verified LDAPS adapter, explicit GUID linking, provisioning UI/CLI, shared limits and revocable absolute sessions; real local browser exchange passes | School-controlled LDAPS/CA/test staff and authorized network connection. Synthetic LDAP tests do not qualify real AD. |
| Migration and worker qualification | Four additive migrations; pre-auth upgrade preserves IDs/jobs/approvals and no-op replay. Real PostgreSQL 13/13 includes process SIGKILL and six workers/32 approved jobs | Production backup/restore/migration window, full worker-loop/live-model crashes, long load, host reboot and actual capacity. |
| Dependencies | Next 15.5.27, Tailwind 4.3.3, PostCSS 8.5.29, NextAuth 4.24.15, compatible updates; 34 Node tests, two browser suites, build/typecheck/lint | Eight audit packages/chains remain, without established compatible fixes: development braces chain and Mammoth CLI sprintf-js chain. Recheck before release. |
| Full Pixel Agents | Upstream source/interface inspected at `d1e007a9fdf3003c252d2973abe1999ae59aec33`; MIT source, standalone CLI and typed provider boundary confirmed | Upstream registers only Claude and the CLI constructs a Claude runtime. Add a dedicated AgentOS provider and pin/build its standalone integration; retain licensing/asset attribution, disable launch/hooks/private transcript scanning, map real approved worker events and verify reconnect/replay. Current seats are not full Pixel Agents. |
| Scheduling | Approved ownership/settings requirements documented; no new business cron enabled | After Portal/class-summary acceptance, implement template/version/calendar/timezone/nonoverlap/missed-run policy and verify unique schedule/slot dispatch. Actual settings/notifications need user confirmation before activation. |
| Spark | Container/Compose, optional school CA mount and host-worker unit prepared; actual Linux/AMD64 production-container browser test passes; deployment/migration runbook | Confirm hardware/OS/architecture, qualify actual host/model/backup/HTTPS, then approve concrete deployment. Local container results do not establish Spark compatibility. |

## Portal/class-summary contract to verify with its owner

The authoritative Portal interface must establish these semantics before AgentOS ships a school executor. No endpoint paths or capabilities have been invented in code:

1. A requesting staff identity mapped deliberately to Portal, independently checked against class/date/data scope. AgentOS contact email or a successful AgentOS login cannot grant Portal access.
2. An immutable workflow ID/version and exact source/scope references bound to parent job plan version/hash. Raw student records stay in Portal; AgentOS receives permitted status/evidence/artifact references.
3. A durable `operationId` returned for the stable `idempotencyKey`; identical replay reconciles to the same child, changed payload rejects instead of silently reusing approval.
4. Unique ordered/replayable events carrying parent and operation IDs. Reconnection cannot duplicate a child or accept a stale version as completion.
5. Distinct draft/content/send states; Portal alone records and enforces approvals bound to artifact version, content and recipients. AgentOS plan approval cannot replace them.
6. Stop/incomplete-source/out-of-scope/cancel/changed-content cases fail closed. Unknown delivery is reconciled through Portal's durable outbox, never blindly resent by AgentOS.
7. Synthetic pilot: validated attendance/homework inputs → coverage/identity/duplicate/total checks → class summary, follow-up and permitted artifact references → staff content/recipient approval → authoritative delivery result. No real sends during fixture acceptance.

Schedules and full school workflow must use that boundary rather than rebuilding Portal student tables, calculations, approval authority or email delivery. Current code still supports manual and approved Codex read-only steps only.

Setup and evidence: `SCHOOL_AUTH_SETUP.md`, `DEPENDENCY_QUALIFICATION.md`, `POSTGRES_QUALIFICATION.md`, `HERMES_BRIDGE.md`, `SPARK_DEPLOYMENT.md`, and the latest task handover. Public files contain no staff credentials, private endpoints, student records or real backups.

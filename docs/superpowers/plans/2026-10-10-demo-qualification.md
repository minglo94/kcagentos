# Phase 2 Demo Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the school a repeatable, demo-data-first way to exercise AgentOS approvals, local-model protocol, file/audit boundaries and a proposed Portal class-summary contract without implying live school services are connected.

**Architecture:** The existing approved AgentOS/Portal split in `docs/AGENTOS_PLAN.md` and `docs/INTEGRATION_DECISION.md` governs the work. Disposable test-only fixtures own all synthetic student-like records and a loopback model stub; AgentOS persists only parent-job metadata and audit attempts. Portal contract simulation runs offline and never activates a production connector, database query, outbox or send.

**Tech Stack:** Next.js/TypeScript, Prisma/PGlite for disposable fixtures, Node test runner and the existing PostgreSQL qualification service. No new production model or Portal dependency.

**Spec:** `docs/AGENTOS_PLAN.md` §§4–8,11; `docs/INTEGRATION_DECISION.md`; approved `docs/SCHOOL_DATA_POLICY_DESIGN.md`.

## Global constraints

- Every task input and output remains administrator inspectable through protected audit storage.
- School/unknown work remains restricted and synthetic-only. Local model calls use a loopback URL; no online search while processing student data.
- Portal alone authorizes student scope, owns child operations and approvals, and records delivery. AgentOS does not create a student store or send engine.
- A synthetic fixture does not establish real AD, model, NAS, Portal/PostgreSQL vector, Spark, Pixel asset provenance, or production migration acceptance.

## Review focus

- A changed replay payload must not reuse a Portal child operation (Task 1).
- Incomplete or ambiguous source data must not become a complete class-summary draft (Task 1).
- AgentOS manual evidence must not masquerade as Portal content/send approval or delivery (Task 1).
- The demo must use a disposable database, bound loopback fake model, and no actual connector or send (Task 2).
- Generated demo artifacts must stay ignored/private, while a user can follow the test guide from a clean checkout (Task 3).

## File responsibilities

`src/lib/office/portal-class-summary-contract.ts` defines a proposed, bounded wire shape without production transport. `tests/fixtures/synthetic-portal.ts` holds fixture-owned synthetic calculations/approvals/unknown-delivery state. `tests/portal-class-summary.test.ts` validates the contract boundary. `tests/demo-school-cli.ts` orchestrates a disposable AgentOS approval/local-model/file-audit flow using the existing test database fixture; `tests/demo-school.test.ts` validates its report. `docs/DEMO_TEST_GUIDE.md` gives commands and explains which checks are synthetic versus live gates. Status/todo/handover follow each milestone.

## Task 1: Offline Portal class-summary contract

- [x] Write failing tests for stable idempotency, changed-payload rejection, independently scoped staff/class/date, missing/partial/ambiguous source refusal, version-bound content and send approvals, and unknown delivery staying nonterminal.
- [x] Run `node --import tsx --test tests/portal-class-summary.test.ts` and confirm expected failure.
- [x] Implement only a versioned request/result parser and a fixture Portal simulator. Request carries parent job and approved plan hash/version, opaque mapped staff ID, class/date/source references, workflow version and idempotency key. Results carry operation ID, ordered event IDs, completeness/check totals and opaque artifact/approval/delivery references; no student rows enter AgentOS output.
- [x] Rerun focused tests. Document that the contract is a proposal after inspecting the provided Portal source, which has no matching operation API.

## Task 2: Runnable synthetic AgentOS demonstration

- [x] Write a failing integration test requiring a disposable local-account/approved Office job, actual loopback OpenAI-compatible model call, file read/output audit attempts, denied cloud/search capabilities, and terminal job status after manual evidence; no live send/Portal calls.
- [x] Implement `npm run demo:school` with disposable synthetic fixtures, private temporary roots and a fake model clearly labelled as such. Print a JSON result; remove temporary data on exit. Refuse an externally supplied school database URL.
- [x] Verify the focused demo test and command, then the existing Node, PostgreSQL, browser, typecheck, lint and build checks appropriate to touched code.

## Task 3: User test guide and publication

- [x] Write clean-checkout prerequisites, copy-paste demo commands, expected output and UI/browser checks. Separate fake model from real Ollama setup, and list non-secret inputs needed for Portal, AD, NAS, production migration, Pixel licensing and Spark acceptance.
- [x] Review the full diff for confidential values and false completion claims. Update `tasks/todo.md`, `tasks/handover.md`, `docs/PHASE2_STATUS.md` in the same commit as the relevant implementation.
- [x] Commit, push the authorized branch and synchronize draft PR #14. Keep it draft; do not merge, migrate production, activate business cron or send messages.

## Decomposition after this plan

Business scheduling and the full Pixel renderer are separate implementation plans. Scheduling requires durable unique slots and a school calendar but remains disabled until approved settings and Portal execution. Upstream Pixel assets need per-asset provenance before import; its stock CLI and transcript watcher must not launch. Real Portal PostgreSQL/vector queries require a reviewed Portal-owned scoped capability and school test role. Real AD, local model and Spark tests require protected host access. This plan provides a runnable demo, not a claim those live gates are finished.

# Synthetic Zeabur Review Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current AgentOS branch deployable as an isolated, synthetic-only Zeabur review service so staff can inspect the latest authenticated UI and a pending sample Office plan.

**Architecture:** Zeabur builds a dedicated Dockerfile from this branch. The web service uses a separate review PostgreSQL database and persistent audit volume; startup prepares that volume and drops to the unprivileged Node user. Schema migration and first-admin/sample-job creation are explicit one-off commands, never automatic on web startup. No worker, real model, Portal client, AD, NAS or outbound connector is activated.

**Tech Stack:** Next.js, Node 24, Prisma/PostgreSQL, Docker, Zeabur Git deployment.

**Spec:** `docs/AGENTOS_PLAN.md` §§4–8, `docs/INTEGRATION_DECISION.md`, `docs/SPARK_DEPLOYMENT.md`, `docs/SCHOOL_DATA_POLICY_DESIGN.md`.

## Constraints and review focus

- Only a new, separate review database can receive migrations or synthetic bootstrap data. Existing Portal and school databases remain untouched.
- Existing login and administrator authorization remain mandatory. Review password arrives through protected Zeabur environment settings and is removed after one-time bootstrap.
- The sample Office plan starts pending approval and has a manual step. It cannot invoke a cloud model, send, Portal operation or unrestricted tool.
- Audit payload storage is persistent, private and outside `/app`; the process runs as the unprivileged Node user after volume initialization.
- Public health responses disclose no database address, secret, filename or exception.
- Missing synthetic-mode flags, database, session settings or audit volume must fail startup/bootstrapping rather than silently create a broken public service.

## Task 1: Safe one-off review initialization

- [x] Write a failing test for explicit synthetic-review flags, empty-database admission, no duplicate bootstrap, real local credential creation, pending Office plan and protected audit record.
- [x] Implement a one-off `npm run review:bootstrap` command using protected environment variables and the existing auth/Office stores. No fixed production password or automatic run on service startup.
- [x] Add a database-and-audit readiness endpoint returning only ready/unready. Test the live route in the container qualification.

## Task 2: Zeabur image and deployment guide

- [x] Add a dedicated Zeabur Dockerfile and startup script; Zeabur auto-selection must use `ZBPACK_DOCKERFILE_NAME=zeabur` per its Dockerfile documentation. Prepare `/data/audit` from a mounted persistent volume, then run Next as `node` on the provided `PORT`.
- [x] Build the image locally and exercise startup failure with missing review flags/volume, plus successful login, readiness and pending sample plan with a disposable PostgreSQL database.
- [x] Document exact Zeabur Git branch, separate database, volume, protected environment settings, migration/bootstrap commands, domain/login checks and limits. Include rollback/removal without touching Keichi.

## Task 3: Publication

- [x] Run appropriate Node, Python, PostgreSQL, browser, typecheck/lint/build checks and inspect the final diff for secrets or false live claims.
- [x] Update `tasks/todo.md`, `tasks/handover.md` and deployment status; commit and push the authorized branch, then update draft PR #14. No Zeabur service is created without project access.

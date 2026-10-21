## Integrated runtime requirements — 21 October 2026

Teachers use Portal only. AgentOS browser access is for active ADMIN operators; school approvals and sending remain under Portal authority. Phase 2 authentication, audit/policy, controlled-file and deployment work is integrated with the signed teacher protocol. See [integration and upgrade guide](docs/BRANCH_INTEGRATION_20261021.md).

**Task execution requires Linux or WSL/Linux**, Node >=22.13, `AGENTOS_TASK_DATA_MODE=synthetic` and `AGENTOS_AUDIT_ROOT` pointing to an existing canonical Linux directory owned by the service user, mode 0700, outside the checkout. The audit and controlled-file protections depend on POSIX permissions/durable directory sync and `/proc/self/fd`; Windows task execution fails closed. Windows remains usable for source editing, typechecking and building; do not infer executable worker qualification from a Windows build. Browser/server requests that create audited work also require this protected Linux storage.

Existing pre-integration Portal jobs need explicit policy requalification and fresh teacher approval; see the upgrade guide. No real student mode, sending, business cron, model inference or new deployment is enabled by this merge. Existing protected cloud deployments continue to run their earlier immutable code.

## Hermes office foundation

The authenticated `/office` dashboard adds persistent jobs, version-bound plan approvals and a separate Worker. It also includes the AgentOS-side [Portal draft bridge](docs/PORTAL_BRIDGE.md) and [dependency repair](docs/DEPENDENCY_REPAIR.md). Real local inference, separate Portal runtime pairing, cron and full Pixel Agents visualization remain pending.

See [setup and verification](docs/OFFICE_FOUNDATION.md), [Hermes bridge](docs/HERMES_BRIDGE.md), [integration ownership](docs/INTEGRATION_DECISION.md), and [current handover](tasks/handover.md).

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

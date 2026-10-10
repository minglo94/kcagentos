# Dependency qualification — 2026-10-09

Next.js/ESLint configuration: **15.5.27**. Tailwind and its PostCSS plugin: **4.3.3**. PostCSS: **8.5.29**. NextAuth: **4.24.15**. React stays on 18, Prisma on 5. Use Node **22.13 or newer**, preferably current Node 24 LTS. Archiver 8's Node ESM exports require modern Node; its obsolete factory API has been replaced with `ZipArchive`.

Next 15 route parameters and page search parameters are asynchronous. All dynamic handlers now await them; owned-job APIs, approval/control/evidence and SSE behavior pass the existing browser workflow. Tailwind uses its version 4 PostCSS plugin and loads the existing theme configuration. Internal links follow the current Next lint rules. Next generated the ES2017 TypeScript target. `tsx` is a runtime dependency because the standalone worker and administrator CLI use it.

Compatible dependency updates are recorded in the lockfile. Two narrow overrides are qualified: every PostCSS copy uses the direct patched version, and ExcelJS uses CommonJS-compatible UUID 11.1.1. Synthetic document tests check actual DOCX generation/extraction/ZIP packaging and XLSX write/read. No student documents are used.

## Evidence

- Node/Prisma/document tests: 34/34.
- Real local NextAuth browser exchange: passes both login-choice discovery, administrator UI provisioning, teacher scope, hostile/missing Origin rejection, submitted GUID rejection, password reset revocation and disabled staff/admin rejection. AD configuration is synthetic; no successful real AD bind is claimed.
- Office browser: authenticated APIs, cross-account denial, plan approval, manual evidence, SSE and reload pass.
- Production build and typecheck pass. Lint retains the existing approvals hook warning; `next lint` is deprecated upstream.
- PostgreSQL qualification: 13/13, including auth conflicts and six workers/32 synthetic approved jobs. This is not a production soak.

## Remaining audit results

`npm audit` reports **8 affected packages/chains: 0 critical, 5 high, 3 moderate**, down from 24 before upgrades. The remaining roots are:

| Chain | Exposure and follow-up |
| --- | --- |
| ESLint Next plugin → fast-glob/micromatch → braces | Development/build tooling. No compatible patched braces release was established. Keep tooling away from untrusted pattern inputs; reevaluate upstream releases. Production images omit dev dependencies. |
| Mammoth → argparse → sprintf-js | Mammoth CLI argument formatting; AgentOS imports its document library, not the CLI. No compatible patched sprintf-js release was established. Do not use obsolete Mammoth downgrades or incompatible argparse major overrides to make the audit count disappear. |

An audit count is dependency evidence, not proof that every advisory is exploitable in this app or that production is safe. TLS, actual school AD, deployment/migration review, runtime isolation and live-service qualification remain required. Raw audit JSON stays in local scratch; rerun the audit before release because advisories change.

Production-only `npm audit --omit=dev` reports 3 moderate affected packages/chains and no high/critical advisories, all in the Mammoth CLI argparse/sprintf-js chain. The full dependency audit remains 8.

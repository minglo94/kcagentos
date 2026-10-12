# Dependency repair — 2026-10-12

Current lockfile audit has zero reported vulnerabilities (previously 24: 7 moderate, 15 high, 2 critical). This is registry advisory evidence, not a proof that the application has no security defects.

- Next.js 14 → patched 15.5.27 and NextAuth 4.24.15. Route params/searchParams are awaited; server external packages use the current config key. React 18 remains supported by this increment.
- Tailwind 3 → 4.3.3 with its PostCSS adapter and explicit legacy config. This removes the vulnerable braces/chokidar build-tool chain.
- Lint runs the ESLint CLI with TypeScript, React and hooks rules. The old Next lint preset was removed because its fast-glob/micromatch/braces chain has no patched release. Next-specific plugin checks are no longer supplied by that preset; build/typecheck/browser tests are still required. One pre-existing hooks warning remains in approvals-client.
- PostCSS is pinned/overridden to 8.5.29, including Next's older nested version. ExcelJS's UUID dependency is overridden to CJS-compatible 11.1.1. Existing attendance/FAD8 workbooks have roundtrip regression coverage.
- Mammoth's unused CLI dependency pulled vulnerable sprintf-js without an upstream patch. DOCX quotation text extraction now uses JSZip plus patched xmldom, reads only the main document, rejects DTD/entities and malformed XML, and bounds compressed input at 10MB and streamed XML at 16MB. Tests include a compressed expansion limit case.

Source guidance: [Next.js 15 migration guide](https://nextjs.org/docs/app/guides/upgrading/version-15). Preserve lockfile reproducibility, run npm audit and regression checks after future changes; do not apply forced dependency downgrades suggested by audit to silence findings.

Formal deployment still requires real PostgreSQL/SSO, model pairing if used, Portal authorization, recovery and target Spark qualification. No application was deployed during this repair.

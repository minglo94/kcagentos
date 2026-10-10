# School AD and Local Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorised staff sign in with local Windows AD or independently provisioned AgentOS username/password accounts.

**Architecture:** Extend NextAuth with explicit AD/local credentials providers backed by AgentOS User IDs. Separate password verification, directory verification, provisioning and session validation; Portal remains a separate authorization authority. Additive migrations preserve Office ownership and approvals.

**Tech Stack:** Next.js 14, NextAuth 4.24.15, TypeScript, Prisma 5/PostgreSQL, Node 22+ scrypt, ldapts 9.2.0, node:test and Playwright.

**Spec:** `docs/SCHOOL_AUTH_DESIGN.md` (user approved 2026-10-09).

## Global Constraints

- Support both local Windows AD and separate AgentOS accounts. No public signup, no automatic identity linking, no fallback after AD failure.
- User IDs and application roles remain authoritative. Portal independently checks staff scope.
- Local username: case-insensitive ASCII `[a-z0-9._-]`, 3–64 characters. Password: 12–128 characters, never trimmed or normalized.
- scrypt: N=65536, r=8, p=1, 64-byte key, random salt and versioned encoding; timing-safe comparison, bounded memory and dummy verification for unknown accounts.
- Reserve at most five attempts per provider/account-hash in fifteen minutes, atomically in PostgreSQL; success does not reopen the window.
- AD: configured `ldaps:` endpoint only, verified TLS/hostname, trusted optional CA, bounded I/O, escaped sAMAccountName filter, exactly one enabled user, explicit objectGUID mapping.
- Never persist AD passwords or return local hashes. Credentials/AD endpoint/configuration stay out of Git and browser responses.
- Eight-hour sessions bind the User session revision; reset/unlink/deactivation revokes sessions. Directory disablement is checked on new login; live directory revocation is not claimed.
- Use only synthetic accounts/LDAP responses in development verification. No deployment, Portal calls, model downloads, business cron or real AD connections.
- NextAuth 4.24.15 is required before enabling multiple providers because the current 4.24.14 audit includes provider-cookie binding advisories. Other dependency migrations stay separate.

## Review Focus

- Similar AD/local usernames or emails must not silently merge identities (Task 3 and Task 5 tests).
- Parallel invalid attempts must not bypass a shared throttle (Task 2 real PostgreSQL test).
- Reset followed by reactivation must never restore an old token (Task 4 tests).
- LDAP errors/ambiguous users must not invoke local password fallback or leak directory details (Task 3 tests).
- A credential callback or administrative mutation must not grant a role from submitted input (Task 4 and Task 5 HTTP tests).

## File responsibilities

- `src/lib/school-auth/password.ts`: canonical usernames and versioned password hashing/verification.
- `src/lib/school-auth/store.ts`: attempt reservation, local login, provisioning, directory linking and revision changes.
- `src/lib/school-auth/directory.ts`: configured LDAP lookup/bind, GUID normalization and TLS-safe client lifetime.
- `src/lib/school-auth/session.ts`: database-backed session identity/revision validation.
- `src/lib/auth.ts`: conditional providers and NextAuth callbacks.
- `src/lib/school-auth/admin-http.ts`: active ADMIN and origin/input validation for account mutations.
- `src/app/api/admin/users/route.ts`: existing listing plus account creation.
- `src/app/api/admin/users/[id]/credentials/route.ts`: local username/password assignment/reset.
- `src/app/api/admin/users/[id]/directory/route.ts`: verified AD link/unlink.
- `scripts/create-local-admin.ts`: interactive host-local initial admin setup.
- Existing login/admin client pages: provider choices and account management forms.
- `tests/school-auth*.test.ts`, `tests/school-auth-postgres.ts`, `tests/school-auth-browser.ts`: unit/store/directory/session, real concurrency and actual credential browser flow.

### Task 1: Credential schema and password primitives

**Files:** schema; additive `prisma/migrations/20261009000200_school_auth/migration.sql`; password module; `tests/school-auth-password.test.ts`; existing Office store/browser/PostgreSQL migration fixtures.

**Interfaces:** `normalizeUsername(value: string): string | null`; `hashPassword(value: string): Promise<string>`; `verifyPassword(value: string, encoded: string): Promise<boolean>`.

- [ ] Write tests asserting `normalizeUsername('Teacher.One') === 'teacher.one'`; reject lengths 2/65, Unicode and domain/UPN syntax. Verify a 12-character password round-trip, changed password false, malformed hash false, 11/129-character password rejection and no trimming.
- [ ] Run `node --import tsx --test tests/school-auth-password.test.ts`; Expected: FAIL before the module exists.
- [ ] Implement primitives using Node crypto. Encode algorithm version, parameters, salt and derived key; validate exact parameters/encoded lengths before work. Precompute a dummy hash for the credential store.
- [ ] Add User `authRevision Int @default(0)`, `LocalCredential(userId unique FK, username unique, passwordHash)`, `DirectoryIdentity(directoryId, objectGuid, userId FK; unique directoryId+objectGuid)`, and `LoginAttempt(key primary, windowStartedAt, attempts)`. User deletion cascades credentials/identities; no default credential or directory identity.
- [ ] Update all three existing migration fixtures to include the additive migration; verify all migration records in the PostgreSQL fixture. Preserve existing baseline files.
- [ ] Run primitive tests, `npm test`, `npm run typecheck`, and isolated `npm run test:postgres`; Expected: all pass with the third migration, no existing ownership changes.
- [ ] Commit schema, primitives, tests and updated todo/handover.

### Task 2: Atomic attempt budgets and local credentials

**Files:** store module; `tests/school-auth-store.test.ts`; `tests/school-auth-postgres.ts`; package test script; reusable synthetic fixture helpers if needed.

**Interfaces:** `reserveAttempt(db, provider: 'local'|'school-ad', username: string, now?: Date): Promise<boolean>`; `authenticateLocal(db, username: string, password: string): Promise<{id: string; authRevision: number} | null>`; `setLocalCredential(db, actorId: string, userId: string, username: string, password: string): Promise<void>`; `clearAttempts(db, provider, username): Promise<void>`.

- [ ] Write tests: five attempts true, sixth false, new window after fifteen minutes; two independent Prisma clients submit ten reservations and exactly five succeed. Local login returns active provisioned User only, never creates unknown users or changes roles. Reset changes revision and never returns a hash. Unknown username still calls dummy verification.
- [ ] Run targeted tests; Expected: FAIL before store implementation.
- [ ] Implement serializable transactions with the existing retry helper. Use provider+SHA-256 normalized identifier keys; reserve before verification/bind. Bound credential inputs and hash work; use a per-instance cap of four active password verifications with a generic busy response to avoid unbounded memory allocation.
- [ ] Hash outside the provisioning transaction, then require active ADMIN and upsert credential/ increment User revision plus minimal audit in the same transaction. Reject assigning an existing username to another User. Local authentication reads revision and active state again after verification.
- [ ] Run store tests and the new opt-in PostgreSQL test; Expected: account uniqueness, all throttle and local login assertions pass, schema cleanup confirmed.
- [ ] Commit store/tests and evidence.

### Task 3: Verified local Windows AD adapter

**Files:** directory module; package/lockfile (`ldapts@9.2.0`); `.env.example` placeholders; `tests/school-auth-directory.test.ts`.

**Interfaces:** `readDirectoryConfig(env): DirectoryConfig | null`; `lookupDirectoryIdentity(username: string, config: DirectoryConfig, factory?: LdapFactory): Promise<{directoryId: string; objectGuid: string} | null>`; `authenticateDirectory(db, username: string, password: string, config: DirectoryConfig, factory?: LdapFactory): Promise<{id: string; authRevision: number} | null>`.

`DirectoryConfig` contains logical ID, LDAPS URL, search base, bind DN/password and optional CA path. `LdapFactory` creates a client with `bind`, `search` and `unbind`; tests inject fixtures. Lookup requests DN/objectGUID/sAMAccountName/userAccountControl only, normalizes the raw 16-byte GUID consistently, and excludes disabled accounts.

- [ ] Write tests for plaintext/incomplete config rejection; filter escaping; zero/multiple/disabled results; empty/wrong password; no linked AgentOS identity; disabled AgentOS User; verified identity bind success; timeout/TLS/bind failure and unbind in every exit path. Assert a same-email unlinked object is denied and no local verifier is called.
- [ ] Run targeted tests; Expected: FAIL before module exists.
- [ ] Implement with TLS `rejectUnauthorized: true`, connect timeout 5s, operation timeout 5s and end-to-end timeout 10s. Use the returned DN on a separate user-bind client; close both clients. Do not retry failed binds blindly.
- [ ] Add blank `AGENTOS_AD_*` and provider-enable placeholders only; no school endpoint, CA material or password in Git. Reject unconfigured provider startup rather than using implicit defaults.
- [ ] Run tests/typecheck; Expected: all synthetic LDAP paths pass without network calls. Real LDAP remains an explicit acceptance gate.
- [ ] Commit adapter/config/tests and evidence.

### Task 4: NextAuth providers and revocable sessions

**Files:** session module, `src/lib/auth.ts`, token types, existing browser signed-token fixtures, legacy setup route, package/lockfile for `next-auth@4.24.15`; `tests/school-auth-session.test.ts`.

**Interfaces:** `resolveSessionUser(db, userId: string, revision: number): Promise<{id; email; name; role; department; authRevision} | null>`; NextAuth token adds integer `authRevision`. Provider IDs: `local`, `school-ad`, optional `google`.

- [ ] Write callback/session tests: login-supplied roles ignored; disabled/deleted/reset users rejected; stale/absent token revision rejected; fresh revision succeeds; database roles refresh. Reset/reactivation must not restore old sessions. Cross-provider same username never changes User identity.
- [ ] Run tests; Expected: FAIL before session implementation.
- [ ] Upgrade only NextAuth to the verified patch release, preserving existing compatible React/Next major versions. Add explicitly enabled provider configuration, credentials authorization through Tasks 2/3 and existing optional Google only with complete settings. Credentials sign-in cannot use the old Google-profile-only callback. Google still checks the school domain and verified email, resolves its existing email-owned User and never creates local/AD credentials.
- [ ] At sign-in bind User ID/current revision. Later JWT/session callbacks validate the bound revision and active User; missing revision requires reauthentication. Keep eight-hour expiry and database role refresh. Existing sessions must sign in again after deployment; no automatic old-token upgrade.
- [ ] Update the legacy setup/reactivation code to advance revision before reactivation. Return generic sign-in errors and restrict callback redirects to the app origin.
- [ ] Update signed synthetic browser tokens with revision zero. Run session tests, existing Node tests/typecheck and Office browser E2E; Expected: session revocation and existing ownership/approvals still pass.
- [ ] Commit provider/session changes and evidence.

### Task 5: Administrator account provisioning

**Files:** admin HTTP module; three admin routes; existing user PATCH route; store extension; `tests/school-auth-admin.test.ts`.

**Interfaces:** `requireAccountAdmin(req): Promise<{userId: string}>`; `createLocalUser(db, actorId, {name,email,username,password,role}): Promise<SafeUser>`; `linkDirectoryUser(db, actorId, userId, verifiedIdentity): Promise<void>`; `unlinkDirectoryUser(db, actorId, userId): Promise<void>`.

- [ ] Write tests for anonymous/TEACHER denial, hostile/missing origin denial, disabled ADMIN denial, input validation and conflicting usernames/GUIDs. Assert explicit links do not merge or move jobs. Responses/audits contain no passwords/hashes. Only an active ADMIN can assign roles.
- [ ] Run targeted tests; Expected: FAIL before provisioning interfaces exist.
- [ ] Implement POST user creation, credential PUT/reset and directory PUT/DELETE. AD linking accepts a username, uses verified server-side directory lookup, then stores its GUID; never accept a client-selected GUID as proof. Mutations use same-origin checks, bounded JSON and serial transactions, minimal audits and revision changes.
- [ ] Update existing user PATCH deactivation to increment revision; safe responses use explicit fields. Do not add public signup/password reset.
- [ ] Run provisioning tests/typecheck; Expected: all denial/link/revision tests pass.
- [ ] Commit provisioning routes/store/tests.

### Task 6: Interactive first-administrator setup

**Files:** `scripts/create-local-admin.ts`, a small reusable bootstrap store function, package script; `tests/school-auth-bootstrap.test.ts`; setup guide.

**Interfaces:** `bootstrapLocalAdmin(db, {name,email,username,password}): Promise<SafeUser>`; refuses when any ADMIN User already exists, including inactive administrators.

- [ ] Write tests: empty database creates one local ADMIN transactionally; existing ADMIN refuses; concurrent bootstrap has one winner; password/hash absent from returned safe user.
- [ ] Run tests; Expected: FAIL before bootstrap implementation.
- [ ] Implement an interactive TTY-only CLI with username/name/contact-email prompts and hidden password+confirmation. Refuse noninteractive stdin and password arguments. Inside a serializable transaction check no ADMIN exists and create User/credential atomically. No web bootstrap credentials endpoint.
- [ ] Run tests and synthetic CLI input validation; Expected: existing admins cannot be bypassed, noninteractive password input fails safely.
- [ ] Commit bootstrap/tests/guide.

### Task 7: Login and administrator user interfaces

**Files:** existing login/admin client pages; minimal server/provider configuration boundary; admin guide and `.env.example`.

- [ ] Add browser assertions for explicit AD/local choice, enabled-provider discovery, accessible username/password labels, generic errors and no public registration. Mocked provider availability is UI-only evidence.
- [ ] Run targeted browser assertions; Expected: FAIL on the Google-only page.
- [ ] Add Traditional Chinese AD/local tabs or select, appropriate autofill and pending state; clear passwords after sign-in attempts. Google appears only if enabled; no providers shows a configuration message. Keep provider secrets server-side.
- [ ] Add ADMIN forms for creating a local user, setting/resetting credentials, clearing attempt locks and verified AD linking/unlinking. Confirm destructive unlink/reset actions with clear impact text in the app. User listings remain credential-free.
- [ ] Run browser assertions/typecheck/lint; Expected: UI paths pass without real AD connections.
- [ ] Commit UI changes and evidence.

### Task 8: Real local-login flow and final acceptance

**Files:** `tests/school-auth-browser.ts`, npm test script, auth setup guide, todo/handover, approved spec status.

- [ ] Seed only synthetic local ADMIN/TEACHER and disabled Users in an ephemeral database, start real Next on loopback with local auth enabled and AD/Google disabled. Exercise real NextAuth CSRF/callback/cookie flow, not manually signed tokens, for the new login tests.
- [ ] Assert correct/wrong/disabled login, Office access and ownership, ADMIN-only provisioning, password-reset/session revocation, hostile-origin rejection and no hash in APIs. Verify login remains usable without Google configuration.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, Python bridge tests, both PostgreSQL suites and both browser suites; Expected: zero failures, existing lint warning only. Run production build with synthetic settings after browser processes stop; Expected: exit zero.
- [ ] Re-run audit into ignored scratch and document remaining advisories; do not claim NextAuth patch fixes the other 23 package advisories.
- [ ] Self-review against the five Review Focus items and spec; verify unimplemented features remain marked pending. No real AD/live model/Portal/deployment claim.
- [ ] Commit tested acceptance evidence, progress and real-school configuration gates together. Publish to the existing draft PR under the user's continuing commit/push authorization; do not merge/deploy.

## Execution handoff

Recommended: implement directly in this session (Native). The eight tasks share a small set of identity/store interfaces, and completing them in sequence avoids simultaneous edits to authentication and schema files. Review this written plan and choose execution before implementation. AD/network configuration and real school acceptance remain separate from synthetic implementation.

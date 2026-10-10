# School login setup and qualification

Requires Node.js 22.13 or newer (Node 24 LTS recommended), PostgreSQL and the additive migrations. Keep the application on loopback while qualifying it. Production access requires HTTPS, a protected `NEXTAUTH_SECRET`, database backup/migration review and school acceptance.

## Separate AgentOS accounts

1. Stop the app/worker, back up an existing database, review its migration history, then run `npm run db:migrate`. Never reset an existing school database.
2. On a new installation with no administrator, run `npm run auth:bootstrap` in an interactive terminal. Passwords are hidden, not supplied as arguments. An existing installation uses its current administrator instead.
3. Set `AGENTOS_LOCAL_AUTH_ENABLED=true` in protected host configuration and restart the app. Sign in with the provisioned username/password.
4. In administrator user management, create staff accounts or assign credentials to existing users. Contact email does not establish AD identity. Passwords must have 12–128 characters; they are not trimmed.

Five login attempts per normalized username/provider are allowed in fifteen minutes across application instances. Success does not reset the budget. Administrators can unlock a budget. Per-instance admission limits and indexed expiry cleanup bound login work and abandoned attempt rows. Password reset and account disablement revoke existing AgentOS sessions; role changes are read from the database.

## Local Windows AD

Configure these values privately; do not put school endpoints, bind credentials or staff data in this repository:

| Setting | Purpose |
| --- | --- |
| `AGENTOS_AD_AUTH_ENABLED=true` | Explicitly enables the configured provider |
| `AGENTOS_AD_ID` | Stable logical directory identifier |
| `AGENTOS_AD_URL` | LDAPS URL with a hostname matching its certificate |
| `AGENTOS_AD_BASE` | Restricted staff search base |
| `AGENTOS_AD_BIND_DN` / `AGENTOS_AD_BIND_PASSWORD` | Read-only directory search identity |
| `AGENTOS_AD_CA_PATH` | Optional protected school CA file; default uses system trust |

Complete settings are required before AD appears on the login screen. Certificate and hostname verification stay enabled. Staff enter their `sAMAccountName`, without a domain prefix or UPN. Administrators link a directory identity to an existing AgentOS user by verified lookup. Matching names/emails never link automatically; AD failure never falls back to an AgentOS password.

Legacy Google email authentication is retained only for pre-credential users marked by the additive migration. New local accounts cannot acquire Google access from contact email alone. Existing sessions lacking the new revision or absolute deadline must sign in again.

Link/unlink and local reset invalidate that user's sessions. AD disablement is checked at new sign-in; already issued AgentOS sessions have an eight-hour maximum unless AgentOS itself disables the user or changes its revision. Immediate external AD revocation requires a separate synchronization service.

## Evidence and release gates

Synthetic tests cover local password exchange through actual NextAuth CSRF/cookies, active-admin/teacher access, hostile origins, reset revocation and disabled login. LDAP tests use a fake directory boundary; they do not prove school network access or a real certificate chain. PostgreSQL qualification verifies the shared attempt budget with independent backends.

Run `npm test`, `npm run test:postgres` with its guarded disposable database URL, `npm run test:auth:browser`, `npm run test:browser`, `npm run typecheck`, `npm run lint` and `npm run build`. Browser tests use disposable migrated databases and synthetic staff; optionally set `CHROMIUM_BIN` to an installed Chromium path.

Before school rollout, authorize a school-controlled test account and qualify: valid and untrusted certificates, inaccessible LDAPS, enabled/disabled/unlinked staff, wrong passwords, explicit linking, reset/unlink revocation, role changes, shared lock/unlock and migration/rollback procedures. Configure credentials outside Git. Portal still checks staff scope independently. Passing synthetic login tests does not authorize production migration or deployment.

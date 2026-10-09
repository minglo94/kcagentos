# School AD and local-account authentication design

2026-10-09 · Written design approved by the user in this session; not implemented.

## Confirmed requirement

School staff must be able to use both local Windows Active Directory accounts and separate AgentOS username/password accounts. Google-only sign-in is insufficient. This corrects the earlier Google SSO acceptance assumption. The existing User ID, roles, disabled-account checks, owned jobs and version-bound approvals remain authoritative inside AgentOS. Portal still enforces school-data scope independently.

## Recommended approach and alternatives

Extend the existing NextAuth session flow with two explicitly selected credentials providers: `school-ad` and `local`. Keep Google optional when its existing configuration is present. Both new methods resolve an explicitly provisioned AgentOS User; neither can grant roles or register accounts through a login request.

This makes both required methods usable through the current app without requiring a new identity service. A central identity broker would reduce authentication code in AgentOS but adds another service and an unconfirmed school dependency. Local-only login would be simpler but would not satisfy the confirmed AD requirement. Entra-only OAuth does not match the confirmed local Windows domain.

## Account and identity model

- Keep the existing User table, including its required contact email. Email is profile/contact data, not proof of an AD identity.
- Add `LocalCredential`, with a unique canonical username, unique User reference and password hash. Passwords and hashes never appear in user-management responses or audit events.
- Add `DirectoryIdentity`, with a unique directory ID plus canonical AD objectGUID and a User reference. An administrator deliberately links this identity after directory verification. Never link by display name, username or email resemblance.
- Add an integer session revision to User. Password reset, identity unlink/relink and account deactivation increment it. Tokens bind the revision issued at sign-in; stale tokens fail authentication. Role changes are still read from the database on authenticated requests.
- Existing Google sessions/users have no new credentials automatically. Existing Office records retain their User IDs. Before enabling new providers, deploy an additive migration and provision accounts.
- No public registration, shared/default passwords or automatic AD-to-local password fallback.

## Local login

Admin-created usernames are case-insensitive ASCII, 3–64 characters from letters, digits, dot, underscore and hyphen. Display names remain Unicode. Username normalization is applied consistently for creation and login.

Passwords are 12–128 characters with no trimming, normalization or silent truncation. Store a versioned Node scrypt hash with random salt and an explicit parameter set (N=65536, r=8, p=1, 64-byte key, bounded memory). Verify with a timing-safe comparison; unknown usernames use a precomputed dummy hash so they still perform verification work. Do not rehash on ordinary failed requests.

Use a database-backed attempt budget shared across app instances: reserve an attempt atomically before expensive password verification or AD binds. Key by provider and a hash of the normalized submitted account identifier. Allow at most five attempts in a fifteen-minute window; expired windows reset. Invalid usernames, nonexistent users and wrong passwords use the same public error. Successful login does not reset the active window, avoiding races that reopen a budget. Administrators may clear a lock when managing an account. Limit request and credential lengths before allocating hash memory. Do not trust arbitrary forwarded IP headers as a throttle bypass key.

Local login resolves an active User and credential before issuing a session. Changing a local password revokes that User's sessions. Password recovery is an authenticated administrator action in this slice; email reset, self-service recovery and MFA are separate future work.

## AD login

Use a server-configured LDAPS endpoint only, with certificate and hostname verification. Allow a configured school CA file from protected host configuration. Never accept the server, search base, domain, certificate policy or bind settings from the login request. AD is disabled until its configuration is complete; network/TLS/directory failures cannot trigger local-account fallback.

The administrator configures a logical directory ID, LDAPS endpoint, directory search base, allowed user search scope and read-only search bind identity. These settings and passwords stay in protected local environment/configuration; the public repository contains placeholders only.

The staff-facing AD input is `sAMAccountName` for the single configured domain. Reject domain prefixes and UPN forms in this first slice rather than guessing account mappings. Bound input length, escape LDAP filter metacharacters, search within the configured base/scope and request only DN, objectGUID, sAMAccountName and userAccountControl. Require exactly one user result and reject disabled accounts.

Resolve the object's GUID to its admin-provisioned DirectoryIdentity and active AgentOS User. Authenticate the entered password by binding as the returned directory DN on a separate TLS-verified client. Never persist or log the supplied AD password; always close clients and bound connect/search/bind durations. AD objectGUID normalization must be consistent in lookup, linking and tests. Directory errors are sanitized before returning to the browser.

AD disablement is checked on each new sign-in. Existing AgentOS sessions expire after eight hours; synchronizing AD disablement immediately across already-issued sessions would require a separate revocation/sync mechanism. AgentOS deactivation and revision changes invalidate sessions on subsequent authenticated requests.

## Administrative setup and management

Extend the existing admin user page to create local users, assign/reset local credentials and link/unlink a verified AD identity. Every mutation requires an active ADMIN session, same-origin validation and a validated request. Include a minimal audit entry identifying actor, target and action; exclude passwords, hashes, directory credentials and raw directory responses. Linking an existing identity to a different User requires an explicit unlink/relink action and revokes affected sessions.

Provide a host-local CLI to create the first local administrator only when no administrator exists. Read the password interactively without echo, refuse noninteractive password arguments, and create the User plus credentials transactionally. It does not become an anonymous HTTP signup/bootstrap endpoint. An existing installation uses its current administrator to provision accounts.

The existing token-based setup endpoint cannot set passwords or link directory identities. Its legacy account-reactivation behavior must increment the revision before reactivation so previously revoked tokens do not become valid again. No credentials or private AD endpoints are committed.

## Interface and configuration

The login screen offers clearly labelled school AD and AgentOS account choices. Both use username/password fields with appropriate autofill attributes, pending state and generic errors. Display Google only when enabled. Hide incomplete/disabled providers and show a clear administrator-configuration message if none is enabled. Use the existing Traditional Chinese design and accessible form labels. Redirect successful sign-in to the office; reject off-site callback destinations.

Enable each provider explicitly in host configuration. Local login needs the migrated database and provisioned credentials. AD additionally requires complete directory settings. Provider flags cannot be enabled by localStorage or submitted form data. Production credentials are sent over HTTPS; the app remains loopback-only until its deployment/authentication gate is passed.

## Verification before release

1. Unit tests: username canonicalization, password verification/invalid encodings, length bounds, dummy verification, filter escaping and GUID normalization.
2. Store tests: no registration, independent AD/local identities, no automatic email linking, role preservation, disabled accounts, reset/unlink revision revocation and transactional provisioning.
3. Real PostgreSQL tests: concurrent attempt reservations never exceed the five-attempt budget; credential/identity uniqueness conflicts do not produce duplicate users.
4. Synthetic LDAP tests: zero/multiple results, disabled identities, wrong password, TLS/configuration/timeouts, escaped input and client cleanup. No real school AD or credentials in fixtures.
5. Browser/HTTP checks: both configured login choices, genuine local credential exchange into a NextAuth session, anonymous/teacher/admin access, hostile-origin mutation rejection, session revocation and owned Office API behavior. Use synthetic staff only.
6. Typecheck, lint, existing Office tests and production build. Qualify dependency updates separately before production.

Real school AD acceptance requires a school-controlled LDAPS endpoint, trusted CA, test staff identity and permission to connect. Passing a fake LDAP test is not evidence of real school login. The private Portal must still authorize the requesting staff identity independently; AgentOS sign-in does not grant Portal access.

## Delivery boundary

This authentication change precedes the first Portal school workflow. It does not implement Portal data, outbox, questionnaire scoring, schedules, live models or deployment. The written design is approved; implementation remains pending review of its concrete implementation plan and execution method.

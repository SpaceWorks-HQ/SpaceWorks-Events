# Authentication production review — 2026-09-14

This review covers password signup/login, inbox verification, password recovery,
account password changes, JWT sessions and revocation, MFA enrollment and removal,
TOTP/recovery-code consumption, Google identity linking, super-admin step-up,
protected-route gates, auth input handling, and relevant dependency advisories.
Existing unrelated work in the checkout was preserved.

> Later change: the super-admin TOTP step-up (`/super-admin-mfa` and its
> 10-minute proof) has since been removed. The super admin now signs in with
> email and password, set only from the server, under the same sign-in
> protections as everyone else. Organisation staff must use an authenticator
> app instead, confirmed per session at sign-in or on `/verify-mfa`. See
> [Security model](SECURITY.md) for the current controls. The notes below
> describe the system as reviewed on 2026-09-14.

## Changes

- Credential verification now enforces normalized account and IP limits before
  database/bcrypt work. Missing and Google-only accounts perform dummy bcrypt
  comparison. Signup returns the same result for existing and new identities and
  handles concurrent duplicate creation without exposing a database exception.
- New passwords require 12 characters and reject values exceeding bcrypt's
  72-byte UTF-8 limit. Legacy sign-in remains compatible. Email/password/reset
  inputs have bounded sizes and reset tokens require the issued format.
- Password proof carries its observed session version through JWT issuance.
  Concurrent revocation cannot upgrade old proof into a new session. Revoked,
  deleted-user, and legacy unversioned sessions become anonymous; client session
  updates cannot refresh authentication time. Freshness rejects invalid/future
  timestamps and requires a valid authenticated user.
- MFA enrollment requires fresh authentication at both stages, cannot replace an
  active authenticator, binds the pending setup to the session version, and
  consumes the exact pending token once. Database uniqueness makes TOTP use
  single-use across application replicas and between login and admin step-up.
  MFA removal conditionally updates the verified state and atomically checks a
  recovery code when one is used.
- Password changes require fresh sign-in plus the existing password when present,
  compare the verified credential/version at mutation time, revoke sessions, and
  invalidate pending recovery/setup links. Password recovery remains single-use,
  verifies the inbox, preserves MFA, revokes sessions, and adds an audit event.
  Security transactions lock the user before token mutation to avoid conflicting
  lock orders during concurrent reset, enrollment, and credential changes.
- Google linking rejects unverified password identities both in the callback and
  at the adapter lookup, closing the pre-registration takeover path. New account
  links store provider identity without retaining OAuth bearer tokens.
- Login destinations reject backslashes, control characters, and external URLs.
  Auth.js logs omit exception payloads. Login, verification, recovery, and security
  forms show recoverable failures; the reset form works in light/dark themes.
- Updated Next.js/ESLint to 16.3.5, Sharp to 0.35.4, and the affected transitive
  YAML dependency. Nodemailer remains at 8.0.11 as requested for Auth.js
  compatibility. npm resolves it consistently for NextAuth and @auth/core.
  The dependency audit still reports one high-severity vulnerable package
  (Nodemailer, with multiple advisories); its upgrade is deferred.

## Verification

Tests run against a newly initialized disposable PostgreSQL database with all 43
repository migrations. Browser tests use synthetic credentials, local origins,
and the existing explicit CI-only insecure transport mode. They do not validate
production TLS or an external identity/email provider.

- Passed: ESLint, TypeScript, 227 unit tests, 30 PostgreSQL integration tests,
  production build, 22 production Playwright tests, migration status, schema
  contract. Dependency audit was run and reports the deferred Nodemailer
  advisories; all other reported vulnerable packages were updated.
- Added callback/adapter tests for rate limiting, dummy password work, oversized
  inputs, version races, revoked sessions, untrusted session updates, Google
  linking, and OAuth-token minimization.
- Added PostgreSQL tests for concurrent TOTP use, concurrent MFA confirmation,
  stale enrollment, and password-reset/password-change races.
- Added browser tests for failed/successful login, local return paths, cookie
  flags, revoked-session clearing, unverified account gating, CSRF rejection,
  authenticator login, single-use password reset, and inbox confirmation.
- The full production browser suite also covers machine-client tenant/scope
  boundaries, public visibility, session polling, mobile navigation, tickets,
  feedback, and certificates.

## Deployment notes and remaining boundaries

- Rebuild and deploy the application and lockfile together. No schema migration
  or encryption-key rotation is required. MFA setups started before this release
  must be restarted; existing enrolled authenticators continue to work.
- A TOTP accepted for sign-in cannot be reused for super-admin step-up. Wait for
  the next code. Google sign-in continues to rely on Google's MFA policy, while
  super-admin access still requires the application's separate TOTP proof.
  (Superseded: see the note at the top.)
- Previously persisted Google OAuth tokens are not automatically purged by this
  change. Review historical account-token retention before deployment.
- Live Google consent/callback behavior and real SMTP acceptance/inbox delivery
  require checks using the deployment's provider configuration. These were not
  exercised against external accounts. No production database, deployment,
  credentials, or runtime TLS/proxy settings were inspected or changed.
- Production Playwright was used as the browser release gate; a separate dev
  server run and Docker image build were not performed. Docker was unavailable.
  Production environment validation was not run against real deployment secrets.
- This is an application hardening review, not an independent penetration test
  or a claim that every tenant mutation has been exhaustively audited.

# Security model

[Documentation index](README.md)

This page documents implemented controls and security boundaries. It is not a substitute for an external penetration test, infrastructure review, or jurisdiction-specific privacy assessment.

## Authentication

- Passwords are bcrypt hashes and are never stored or logged in plaintext. New passwords require at least 12 characters and must fit bcrypt’s 72-byte UTF-8 limit; existing passwords remain usable for sign-in.
- Auth.js sessions include a user `sessionVersion`; incrementing it invalidates issued sessions.
- Password reset uses expiring verification tokens and the transactional outbox.
- Password accounts require a one-time, expiring inbox-verification link before sign-in or event creation. Tokens are stored only as hashes and consumed once.
- Credential users can enable TOTP MFA and receive one-use recovery codes. TOTP use is claimed atomically in PostgreSQL, so a code cannot be replayed across replicas or between login and super-admin step-up. Wait for the next authenticator code when completing consecutive challenges. MFA enrollment is single-use, bound to the account session version, and cannot replace an active authenticator.
- TOTP seeds are encrypted with AES-256-GCM using `MFA_ENCRYPTION_KEY`; recovery codes are stored as keyed hashes. Super-admin SMTP and Google client secrets are separately domain-encrypted from that key and never rendered back to the browser.
- Sensitive account operations require recent authentication, revoke existing sessions, invalidate pending MFA setup, and write audit events. Password changes also invalidate outstanding reset links. A completed inbox password reset verifies that email while preserving any enabled MFA. Revoked JWTs return an anonymous session and are cleared by Auth.js.
- The super-admin panel requires a second, fresh TOTP step-up verification even after a normal authenticated session. Its signed, HttpOnly proof lasts 10 minutes and is bound to the user/session version.
- Google OAuth security, including MFA, is governed by the linked Google account. Linking to a password account requires that account’s email to be verified first; an unverified account must use inbox password recovery before linking. New Google links retain only provider identity fields, not reusable access/refresh/ID tokens. Previously stored provider tokens are not retroactively purged.
- Super-admins with a fresh TOTP proof can disable new password and Google account creation; existing users can continue to sign in.
- External applications use high-entropy, tenant-bound API credentials under `/api/v1`; raw secrets are displayed once and only SHA-256 digests are stored.

## Authorization and tenancy

- Organisation membership is the tenant boundary.
- Owner/admin/member permissions are checked inside Server Actions and server-rendered pages.
- Hiding a control in the UI is never treated as authorization.
- Super-admin access is checked server-side against `SUPER_ADMIN_EMAIL` and fails as not found. Each super-admin page calls `requireSuperAdminMfa()` itself, because a layout check does not re-run on client navigation; a unit test fails if any page omits it.
- Leaving an organisation from `/account/organisations` removes only the caller's own membership. It locks the organisation row and refuses to remove the last owner, and is audited as `ORGANISATION_MEMBER_LEFT`.
- Database foreign keys and uniqueness constraints provide a second integrity layer.
- Machine clients resolve their organisation from the authenticated credential and require an explicit endpoint scope. Caller-supplied organisation identifiers never select the tenant.

## Input, output, and browser controls

- Zod validates public/API and action inputs.
- Registration and feedback answers are validated against current server-owned field definitions.
- Uploads are size/signature/pixel checked; images are decoded, rotated, resized, metadata-stripped, and re-encoded. WebP dimension checks read lossy (VP8, little-endian), lossless (VP8L), and extended (VP8X) headers before decoding.
- A per-request nonce protects scripts with a strict Content Security Policy. Normal application pages deny framing; the public `/embed/:orgSlug/:eventSlug` route is framable only by exact HTTPS origins in `ALLOWED_EMBED_ORIGINS`. It reuses the canonical public-event access checks and must not be used for ticket, account, dashboard, or administrative content.
- Production responses include HSTS, frame denial, MIME sniffing protection, a permissions policy, and a strict referrer policy.
- Server Actions default to same-origin requests, with an explicit trusted-origin allowlist when required.

## Tokens and sensitive links

- Check-in and certificate tokens are high-entropy random values.
- The public ticket status and live-event routes validate the token shape, return only `{ checkedIn, checkedInAt }` with `no-store` and `no-referrer`, and answer unknown tokens with an empty 404. Realtime check-in channels are keyed by RSVP id, so ticket tokens never pass through Redis.
- Event short codes are random seven-character values containing at least one uppercase letter, so they cannot collide with a lowercase organisation slug. Only owners and admins can create or regenerate them (audited as `EVENT_SHORT_LINK_CREATED`/`EVENT_SHORT_LINK_REGENERATED`). Resolution redirects only published events with a released page, so a code never reveals a draft or hidden event's slug; unknown, unreleased, and rate-limited lookups return the same not-found response as an unknown organisation, and the destination page still applies its own privacy rules.
- Venue check-in stations require an event-scoped, bcrypt-protected rotating PIN. PIN management/recovery requires a fresh administrator sign-in and recoverable PIN ciphertext uses a domain-separated authenticated-encryption key. A station can open only from 24 hours before the event through one hour after it ends. Successful entry creates a signed, HttpOnly proof bound to that event, expiry, and PIN version; rotation and disablement invalidate existing proofs immediately. Station PINs, proofs, attendee exports, and offline rosters are never exposed through the public station.
- Ticket, certificate, invitation, password-reset, and MFA enrollment values are secrets or bearer capabilities.
- They must not appear in logs, audit metadata, monitoring tags, or analytics.
- Readiness and scheduler secrets are compared in constant time and unauthorized calls return generic responses.

## Abuse protection

- Password login applies account and IP limits inside the credential verifier, in addition to proxy limits. Missing and OAuth-only identities perform dummy bcrypt work; signup returns the same response for existing and newly created accounts. Auth.js errors are logged without exception payloads.
- Redis-backed limits cover APIs, authentication mutations, RSVP, feedback, search/discovery, uploads, Server Actions, object creation, invitations, broadcasts, check-in, personal data exports (per user), public ticket status and event streams (per IP), and short-link lookups (per IP). Bucket sizes live in `lib/rateLimit.ts`.
- Machine API traffic has an additional per-client limit so credential rotation cannot multiply request capacity.
- Security-sensitive production traffic fails closed when Redis is unavailable.
- Process-local fallback exists for development and an explicit CI-only production-build test mode.
- Client IP attribution trusts only the configured header; the edge must overwrite that header and prevent direct-origin access.

## Data privacy

- Certificate-disabled feedback stores answers without email or RSVP identity and allows repeat anonymous submissions.
- Certificate-enabled feedback requires an email matching a confirmed RSVP, links the response for certificate generation, and allows repeat submissions.
- Feedback mode, eligibility, typed answers, and response creation are one locked transaction. PostgreSQL forbids partial identity/certificate linkage, while immutable question snapshots keep historical answers meaningful after form maintenance.
- Registration counts are omitted from public payloads when the organiser disables count display.
- The personal data export (`GET /api/exports/account`) resolves the user only from the session, returns allow-listed fields of the user's own profile, memberships, registrations, feedback, and co-organiser roles, excludes passwords, hashes, MFA material, and every bearer token, is sent `private, no-store`, and is audited as `ACCOUNT_DATA_EXPORTED`.
- Super-admin insight pages never load tokens, credential hashes, registration answers, or message bodies; lists are capped and queries are parameterised.
- Broadcast designs escape organiser values and accept only absolute http(s) image and link URLs. The ticket venue link is shown only for an `http(s)` map URL (`lib/safeHttpUrl.ts` rejects `javascript:`, `data:`, and other schemes).
- Audit metadata is designed to exclude email addresses, answers, passwords, and bearer tokens.
- Public and dashboard browser event DTOs use explicit selects that exclude
  check-in station secrets and unused relations. Production exception logging
  is category-only. Attendee answers and ticket capabilities require the exact
  registration-management permission; the check-in surface requires the
  separate exact check-in permission.
- Machine participant responses intentionally exclude contact data, registration answers, user IDs, and ticket/check-in/certificate capabilities. Attendance filtering does not reveal check-in data; the nullable check-in timestamp requires the separate `participants:attendance:read` scope and an explicit `include=attendance` request.
- Asset buckets are private; only generated organisation-bound WebP derivatives
  are delivered through the application key allowlist. Uploads are signature-
  checked, decoded under a hard pixel limit, single-frame enforced, resized,
  metadata-stripped, and re-encoded before storage.
- Capability-bearing outbox rows are deleted after delivery, expiry, or terminal
  failure. Queue/heartbeat failures persist only normalized error class/code,
  and retries use a stable non-sensitive Message-ID under lease-owned state
  transitions. Protected scheduler/readiness routes require one exact bearer.
- Retention cleanup covers expired sessions, invitations, verification tokens,
  undo snapshots, and old sent/failed non-capability outbox records. Deployment
  operators must define broader legal retention and deletion procedures.

## Audit trail

Application code creates descriptive business/security audit events. PostgreSQL triggers add a minimal PII-free fallback record for important organisation, membership, event, invitation, RSVP, and series mutations, including mutations that bypass ordinary application paths. Check-in and undo actions also have an immutable event history.

## Transport and secrets

Production startup validates:

- matching HTTPS `AUTH_URL` and `NEXT_PUBLIC_BASE_URL`;
- PostgreSQL TLS through an accepted `sslmode`;
- `rediss://` for Redis;
- HTTPS for a custom S3 endpoint;
- authenticated SMTP unless an unauthenticated private relay is explicitly declared;
- required secret lengths and base64 AES key sizes.

Store secrets in a deployment secrets manager. Use a least-privileged database role and IAM/workload identity for object storage where possible.

## Known boundaries and follow-up work

- Certificate eligibility currently proves knowledge of the confirmed attendee email, not control of that inbox. Add a one-time emailed verification link if certificates carry material value or personal information.
- Google OAuth accounts do not use the application's normal sign-in TOTP challenge, but an account must enroll application TOTP before it can enter the super-admin panel.
- Current automated coverage is broad in scope but low in percentage; expand authorization and mutation-path tests before making a high-assurance claim.
- Application controls cannot replace CDN/WAF configuration, patch management, database backups, restore drills, alerting, access reviews, and incident response.
- Conduct an independent security review before processing sensitive or regulated data.

## Reporting a vulnerability

The repository does not yet define a public security contact or `SECURITY.md` policy at its root. Add a monitored private reporting channel before public deployment or open-source distribution.

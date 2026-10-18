# Routes and HTTP endpoints

[Documentation index](README.md)

Dynamic segments are shown as `:name` for readability.

## Public pages

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/about`, `/features` | Product story and feature overview |
| `/privacy`, `/terms` | Privacy policy and terms of use |
| `/discover` | Paginated public event discovery |
| `/search` | Public event search UI |
| `/:orgSlug` | Public organisation page |
| `/:orgSlug/:eventSlug` | Public event details and RSVP |
| `/embed/:orgSlug/:eventSlug` | Framable public event details and RSVP for a host website |
| `/:orgSlug/:eventSlug/feedback` | Event feedback form when open |
| `/:orgSlug/:eventSlug/check-in` | PIN-protected venue check-in station; usable by trusted on-site staff without an account |
| `/:orgSlug/i/:instanceId` | Recurring-series instance and RSVP |
| `/:shortCode` | Event short link: a 7-character code (letters and digits, always at least one uppercase letter, so it never matches a lowercase organisation slug) that temporarily redirects to the event's current public page. Unknown or unpublished codes return the same not-found page as an unknown organisation; lookups are rate-limited |
| `/ticket/:token` | Attendee ticket status and QR page; tears off the QR stub live when the attendee is checked in |
| `/join/org/:token` | Accept an organisation invitation |
| `/login` | Password and Google sign-in/signup |
| `/verify-email` | Consume a one-time email-verification link and activate a password account |
| `/reset-password` | Password-reset request and completion |
| `/account` | Authenticated account profile settings |
| `/account/security` | Authenticated password, MFA, recovery-code, and session controls |
| `/account/registrations` | Authenticated list of the signed-in user's own registrations, tickets, certificates, and personal data download |
| `/account/organisations` | Authenticated list of the user's memberships and roles, event co-organiser roles, pending co-organiser invites, and leave-organisation control (blocked for the sole owner) |

## User and organisation dashboard

| Route | Purpose |
| --- | --- |
| `/dashboard` | User's organisations |
| `/dashboard/security` | Legacy redirect to `/account/security` |
| `/dashboard/org/new` | Create an organisation |
| `/dashboard/:orgSlug` | Organisation events and series |
| `/dashboard/:orgSlug/settings` | Organisation settings |
| `/dashboard/:orgSlug/members` | Members, roles, and invitations |
| `/dashboard/:orgSlug/event/:eventId` | Event overview, attendees, forms, invites, and feedback |
| `/dashboard/:orgSlug/event/:eventId/schedule` | Standalone-event programme planning and live delay management |
| `/dashboard/:orgSlug/event/:eventId/check-in` | Online/offline check-in station; organisation admin or exact event `CHECK_IN` grant |
| `/dashboard/:orgSlug/series/:seriesId` | Recurring-series management |

Dashboard pages require authentication and enforce membership/role permissions on the server.

## Super-admin pages

The `/super-admin` area includes overview, activity, audit log, auth, email, events, invites, monitoring, operations, organisations (with a detail page per organisation), security, settings, storage, and users (with a detail page per user at `/super-admin/users/:userId`). The Auth page includes the instance-wide new-account creation control. `/super-admin/settings` manages SMTP, Google SSO, and displayed backup posture; secrets entered there are write-only. Access requires the authenticated email configured in `SUPER_ADMIN_EMAIL`; other users receive a not-found response.

Every super-admin page additionally requires a current TOTP verification, and each `page.tsx` calls `requireSuperAdminMfa()` itself because layout checks do not re-run on client navigation (`tests/unit/super-admin-page-guards.test.ts` enforces this). Users without a valid 10-minute step-up proof are sent to `/super-admin-mfa`; authenticator MFA must be enrolled first from `/account/security`.

## Public and application APIs

| Method and route | Authentication | Purpose |
| --- | --- | --- |
| `POST /api/rsvp` | Optional session | Submit an event or instance RSVP |
| `POST /api/feedback` | Public, rate-limited | Submit feedback; email is used only for certificate-enabled forms |
| `POST /api/check-in/station` | PIN-scoped station session, rate-limited | Open and operate a venue check-in station |
| `GET /api/search?q=...` | Public, rate-limited | Return matching public events |
| `GET /api/ticket/:token/download` | Opaque token | Download the attendee ticket |
| `GET /api/ticket/:token/status` | Opaque token, rate-limited per IP (`ticketStatus`, 120/min) | Return only `{ checkedIn, checkedInAt }` for the ticket (`no-store`, `no-referrer`; empty 404 for unknown tokens) |
| `GET /api/ticket/:token/events` | Opaque token, rate-limited per IP (`ticketEvents`, 60/min) | Server-Sent Events: initial `state`, then one `checked-in` event when the attendee is admitted; `: ping` every 25 s, closes after at most 10 minutes |
| `GET /api/feedback/certificate/:token` | Opaque token | Download an eligible JPEG certificate |
| `GET /api/exports/events/:eventId/attendees` | Authenticated organisation admin or event collaborator with `MANAGE_REGISTRATIONS` | Audited full attendee CSV download |
| `GET /api/exports/account` | Authenticated user (own data only), rate limited per user (`dataExport`, 5/hour) | Audited (`ACCOUNT_DATA_EXPORTED`) personal JSON export; excludes secrets, hashes, and all bearer tokens |
| `GET /api/uploads/:key` | Public application route | Stream an allowlisted organisation WebP derivative with immutable/nosniff response controls |
| `/api/auth/*` | Auth.js | Session, provider, callback, and credential endpoints |
| `GET /api/v1/events` | Machine bearer credential + `events:read` | Paginated tenant event metadata |
| `GET /api/v1/events/:eventId` | Machine bearer credential + `events:read` | Tenant-scoped event metadata |
| `GET /api/v1/events/:eventId/participants` | Machine bearer credential + `participants:read` | Paginated minimal confirmed-participant roster, with attendance filtering; `include=attendance` also requires `participants:attendance:read` |

Opaque ticket and certificate URLs are bearer capabilities. Do not log them or place them in analytics payloads.

## Health and scheduler APIs

| Method and route | Protection | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | Process liveness without database or Redis dependency |
| `GET /api/health/db` | `Authorization: Bearer $HEALTHCHECK_SECRET` | Database readiness check |
| `POST /api/internal/outbox` | `Authorization: Bearer $CRON_SECRET` | Deliver queued email and purge expired operational data |

Self-hosted Node.js instances run the outbox worker every minute. The endpoint remains available for an independent scheduler or manual recovery. Protected operational endpoints return a generic not-found response when authorization fails.

## Mutation endpoints

Most authenticated dashboard mutations are Next.js Server Actions under `app/actions/`, not conventional REST routes. They still require server-side authentication, role checks, validation, rate limiting, and audit behavior.

Organisation owners manage machine clients at `/dashboard/:orgSlug/settings/api`. This page requires a fresh human authentication before credential, scope, or client-state mutations.

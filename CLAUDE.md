# Claude guidance for Space Works Events

Read and follow [`AGENTS.md`](AGENTS.md) in full before making changes. It is
the canonical repository guidance and covers the current Next.js 16 rules,
product boundaries, security model, data/worker behaviour, testing, and
deployment constraints.

## Fast orientation

Space Works Events is a production-oriented, self-hosted multi-tenant event
platform by Space Works, following the Space Works brand (see "Design system"
in `AGENTS.md` and `docs/DESIGN.md`). The
most sensitive current scenarios are organisation isolation and role checks;
event privacy and RSVP capacity; opaque ticket, certificate, invitation, and
password-reset links; event short links that never reveal hidden events; the
realtime ticket check-in endpoints (`/api/ticket/:token/{status,events}`,
check-in state only, channels keyed by RSVP id); the personal data export and
leave-organisation actions (own data and membership only); MFA and the
separate super-admin step-up, checked in every super-admin page; write-only,
encrypted instance SMTP/Google settings; tenant-bound machine API credentials;
image safety; outbox email delivery with an absolute `NEXT_PUBLIC_BASE_URL`;
server-generated ID cards (`lib/badge/`, org-isolated, storage-key-only
images); and Docker/Render/Helm deployment with PostgreSQL (Supabase), Redis
(Upstash), S3 (Cloudflare R2), and SMTP (Brevo on port 2525).

Before changing framework behaviour, consult the relevant Next.js 16 guide in
`node_modules/next/dist/docs/`. Before changing an unfamiliar domain, consult
the matching document in `docs/` and the Prisma schema. Never expose or copy
values from `.env`; use `.env.example` for configuration names.

For instance settings, preserve this ordering: database values override legacy
environment fallbacks; secrets are encrypted at rest and never returned to the
browser; backup fields only record posture and do not control provider backups.
For the machine API, resolve the organisation from the bearer credential, check
an explicit scope, and return a deliberately minimal DTO.

At minimum, validate targeted changes with lint, TypeScript, and the relevant
test suite. For authorization, mutation, public-route, operational, API, or
deployment changes, follow the stronger checks listed in `AGENTS.md` and
`docs/TESTING.md`. Other sessions may edit the tree in parallel: commit with
explicit paths only, and commit the user manual only when asked.

Every new feature goes on its own branch (`feat/<short-name>`, or
`fix/<short-name>` for a bug fix) created from `dev`, and lands in `dev`
through a pull request once checks pass. Only @Shaan-Shoukath merges to `main`
(branch protection); never push to `main`. Don't push or delete branches
unless asked. See "Branching" in `AGENTS.md`.

For local review data, `DEMO_PASSWORD=... node --env-file=.env
scripts/seed-demo.mjs` seeds a demo organiser, organisation and event.

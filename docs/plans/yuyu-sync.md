# Yuyu sync: what upstream `main` has that `dev` doesn't

Compared 2026-10-21. Upstream: `yuyu/main` at `fd2c94f` (https://github.com/twilighty-abhi/yuyu).
Ours: `origin/dev` at `bdb847c` (PR #35 merged).

## How the comparison was made

- The two repositories share history. `dev` last took Yuyu at the `v1-design-overhaul`
  merge `9eda46c` (16 Oct). `main`'s own merge base is `0b525bd`.
- `git log --no-merges origin/dev..yuyu/main` lists **22 commits** (18–21 Oct) that are
  not in `dev`. Upstream's other branches have nothing new: `v1-design-overhaul` is merged
  into `main`, and `staging` and `feat/short-links` are already in `dev`.
- The rest of the file difference between the two trees is deliberate: the Space Works
  brand and copy, `charts/spaceworks-events` in place of `charts/yuyu`, `release.yml` in
  place of `publish-images.yml`, the paid events work, per-organisation email, the split
  frontend/backend, the VPS installer, and so on.
- To track upstream: the remote is `yuyu` (`git fetch yuyu`). The weekly workflow
  `.github/workflows/yuyu-upstream.yml` opens an issue when upstream has commits `dev`
  doesn't, and CONTRIBUTING.md ("Syncing from Yuyu") describes how to port them.

## 1. Security

| Upstream | What | In `dev`? |
| --- | --- | --- |
| `d48358f` | Next.js 16.3.8 (GHSA-vcvr-r3jv-pc5j, an RCE in `next/og`, plus three more), sanitize-html 2.18.1, sharp 0.35.5, source-map-js 1.2.2; `next typegen` before `tsc` in CI | **Already covered.** `30bd246` and `3785167` did this; `dev` locks next 16.4.2, sanitize-html 2.18.1, sharp 0.35.5 and source-map-js 1.2.2, and CI runs `next typegen`. Nothing to port. |
| `c005b96` | Mobile Google sign-in must name a mobile `azp`; app-link scoping | Only applies to the mobile API (section 4). |

## 2. Bug fixes

| Upstream | What | In `dev`? | Proposal |
| --- | --- | --- | --- |
| `9829c15` | **Publishing from the dashboard didn't release the event's page**, so the event stayed 404 publicly: no sign-ups, and its short link didn't resolve. Status and page release now change in one transaction. | **Bug present** (`publishEvent` in `app/actions/event.ts` only sets `status`). | Port. |
| `214e3ab` | Follow-up: `saveEventPage` creates a missing page released when the event is published, and the data migration `realign_event_publication` repairs events already stuck. | **Bug present** (`isPublished: false` on create). | Port, with the migration renamed to follow `dev`'s latest (`20261031000100_…`). |
| `d377284` | **Instance settings across deployments.** Saved SMTP replaces `SMTP_*` as a whole, so an env service or credentials no longer override a saved host. Blank env values count as unset (so `SMTP_HOST=""` from `.env.example` no longer breaks startup validation). Fields can be cleared. The sender is validated against header injection. Adds **Send test email**. A saved Google ID pairs only with a saved secret. An **unreadable secret** (the key differs or was rotated) disables Google instead of returning 500 on every page, with a named `InstanceSecretUnreadableError`, `scripts/check-instance-secrets.mjs` and an optional Helm migration check. Also: a CI-only TLS bypass for Mailpit, `production:check` no longer needs env SMTP, the super-admin overview uses UTC-safe date windows and gives real top-organisation counts, search and page params are validated, the pager knows when there's a next page, maintenance actions return safe errors, retry resets `attempts`, and the API stats panel is labelled per process. | **Bugs present.** `getEmailSettings`/`getGoogleSsoSettings` still mix the two sources field by field and throw on an unreadable secret. Invite tokens are already not loaded on `dev`. | Port, adapted: keep `dev`'s per-organisation transports (`lib/email/transporter.ts`) and change only the platform transport. To stay clear of `feat/login-security`, make the Google settings loader itself fail safe (log and return `null`) instead of editing `lib/auth.ts` and the login page. |
| `6c3c4b7` | **Retry failed email** requeues only failures from the last 7 days, so an outage doesn't resend week-old broadcasts. | Present. | Port. |
| `ac64909` | Ops alerts: ignore client-disconnect stream noise. | n/a (needs section 3). | Port with section 3. |
| `a16fba1` | Validator tests used a fixed date that is now in the past. | **Already fine.** `dev`'s fixtures don't use the fixed date. | Nothing. |
| `7918e38` | Mobile: sign-ups can be closed and reopened, a refresh retry gets a grace period, restore is scoped. | Mobile only. | Section 4. |

## 3. Features

| Upstream | What | Fit with Space Works | Proposal |
| --- | --- | --- | --- |
| `db9524d`, `216a88d`, `ac64909` | **Operator alert webhook.** Posts redacted, de-duplicated, rate-capped alerts to a Mattermost/Slack-compatible incoming webhook. The URL is set write-only and encrypted in Super admin → Settings. Covers `onRequestError`, server console errors, Auth.js failures, outbox delivery failures, browser crashes (through a new `/api/client-errors`), and an "instance started" note. One column migration. | Fits. It's instance-level (super-admin only), sends no attendee data, and has nothing to do with organisations or payments. With the split layout, alerts come from the backend; the frontend's error boundaries post to `/api/client-errors`. | Port, except the Auth.js logger hook in `lib/auth.ts` (`feat/login-security` is editing that file). Add the hook in a small follow-up once that branch merges. |
| `945c05b`, `077bf71`, `75d227f`, `15e142a`, `64117fc`, `7918e38`, `c005b96` | **Mobile API** (`/api/mobile/v1`, about 9,000 lines): mobile sessions with rotating refresh tokens, an OpenAPI 3.1 contract with a drift test, attendee registrations and tickets, and organiser day-of work (check-in, guest approval, broadcasts, programme delays, feedback and sign-up state). Universal and app-link files. It first refactors the Server Actions into shared `lib/core/*` functions (check-in, RSVP lifecycle/admin/cancel, broadcasts, account) and moves credential and Google sign-in logic out of `lib/auth.ts`. | **Conflicts on three fronts.** (1) The refactor rewrites the files `dev` has changed most for paid events (`rsvp-lifecycle`, `rsvp-admin`, `rsvp-cancel`, `checkin`). (2) It edits `lib/auth.ts` and the login page, which `feat/login-security` is changing. (3) Its RSVP, cancel, approve and promote routes know nothing about orders, holds or refunds: ported as they are, the app could register someone for a paid event without paying, or cancel a paid ticket without a refund. It also needs a Space Works mobile app to exist (bundle IDs, app-link files). | **Don't port now.** Do it as its own project (`feat/mobile-api`) after `feat/login-security` merges, rebuilding the cores on top of `dev`'s paid-event flows: paid events go through checkout, and cancelling uses the refund path. |

## 4. Tests, CI and docs

| Upstream | What | Proposal |
| --- | --- | --- |
| `b4db91c` | The production e2e step trusts `cf-connecting-ip`, the header the specs send, so browser contexts don't share one sign-in rate limit. | Port. `dev` has the same mismatch: the Quality gate trusts `x-forwarded-for` while the specs send `cf-connecting-ip`. |
| `a2ac77b` | Smoke test: retry refused connections, print container logs on failure, and check that sharp loads in the image. | Port the logs-on-failure and sharp check. `dev` already retries with `--retry-all-errors`. |
| `8a45d80` | Production SMTP tests clear the CI TLS bypass. | Port with `d377284`. |
| `3811915` | A Playwright journey suite for the Yuyu V1 redesign. | **Skip.** It asserts Yuyu's copy and layout, and Space Works has its own design. |
| `b4d2e15` | V1 release documentation refresh. | **Skip as written.** It's Yuyu's release notes. The doc changes for the ported items are made in the same PR. |
| `294ccfa` | Security reports go to a private Mattermost channel, and outside contributions are closed. | **Skip.** That's Yuyu's project policy, not ours. |

## Deliberately different (not ported)

- Yuyu branding, copy, logos (`idlistack-*`), `charts/yuyu`, `publish-images.yml` and the Docker Hub image names.
- Yuyu's "free events only" boundary. `dev` now has paid events.
- Yuyu's `yuyu_v1_` API tokens, `yuyu.` cookies and storage keys, and Redis channels (see `docs/PRODUCTION_RELEASE.md`, "Breaking changes from Yuyu").

## Proposed `feat/yuyu-sync` scope

1. Event publication fixes and the repair migration (`9829c15`, `214e3ab`).
2. Instance settings reliability, the test email, retrying only recent failures, and the super-admin hardening (`d377284`, `6c3c4b7`, `8a45d80`), adapted to per-organisation email and without changes to `lib/auth.ts` or the login page.
3. The operator alert webhook (`db9524d`, `216a88d`, `ac64909`), without the Auth.js logger hook.
4. The CI fixes (`b4db91c`, part of `a2ac77b`).

Left out: the mobile API (its own project), the redesign e2e suite, and Yuyu's docs and policy commits.

# Space Works Events

<p align="center">
  <a href="https://github.com/SpaceWorks-HQ/SpaceWorks-Events">
    <img src="public/brand/logo/lockup-horizontal.svg" width="300" alt="Space Works" />
  </a>
</p>

<p align="center">
  The event platform from Space Works: create, run and follow up on free maker and community events.
</p>

<p align="center">
  <a href="https://github.com/SpaceWorks-HQ/SpaceWorks-Events">View on GitHub</a>
  ·
  <a href="docs/README.md">Documentation</a>
  ·
  <a href="docs/DEVELOPMENT.md">Local development</a>
  ·
  <a href="docs/DEPLOYMENT_DOCKER.md">Production deployment</a>
  ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

Space Works Events is a self-hosted, multi-tenant event platform for makerspaces,
workshops, meetups and community groups. It is built with Next.js, PostgreSQL,
Prisma, Auth.js, Tailwind CSS and Radix UI, and is designed for organisers who
want to keep control of their data and run free events without payments, ticket
sales or advertising trackers.

## What it includes

- Event pages in your colours: cover photo editor, programme tracks, speakers, venues, sponsors, FAQs and resources
- Public, hidden-link, invite-only and approval-required events, with an option to list events on Discover
- **Short links** (`/aB3x9Kq`) for every event, easy to share and to say out loud
- Custom registration forms, capacity limits, waitlists and approvals
- **Live tickets**: private QR tickets that update on the guest's phone the moment they are checked in
- Offline-capable door check-in and PIN-locked door stations for volunteers
- **ID cards and badges**: print a name badge or ID card with a QR code at check-in, with stock-sized templates
- Event emails with five designs, a review step and a five-second undo before a broadcast sends
- Feedback forms, response reporting and **certificates** built from text and image layers on your own artwork
- An account area with registrations and certificates, organisations, security settings and a personal data export
- Recurring event series, organisation roles, event collaborators and tenant-bound API clients
- A separate super-admin area with MFA step-up, instance settings and read-only insights
- Security-conscious operations: private object storage, CSP nonces, rate limiting, audit events, outbox email and readiness checks
- Light and dark modes, accessible defaults, and organiser colours on every event page

## Quick start (local development)

```bash
npm install
docker compose up -d
cp .env.example .env
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`.

Set `NEXT_PUBLIC_BASE_URL` to an address recipients can reach if you want links
and images in sent emails to work; previews in the dashboard work without it.

For local services and development notes, see [Local development](docs/DEVELOPMENT.md).

## Production deployment

Space Works Events ships a standalone Docker build and a Helm chart. Production
requires TLS-backed PostgreSQL, Redis, private S3-compatible storage,
authenticated SMTP and a reverse proxy. Apply migrations as a separate release
step before rolling out the application image.

`NEXT_PUBLIC_BASE_URL` must be the public HTTPS address (it is build-visible, so
changing it needs a rebuild); emails use it for every link and image. Redis also
carries live ticket check-in updates between replicas, so run more than one
replica only with a shared `REDIS_URL`.

- [Docker deployment guide](docs/DEPLOYMENT_DOCKER.md)
- [Helm chart](charts/)
- [Production release checklist](docs/PRODUCTION_RELEASE.md)

## Documentation

The project handbook lives in [`docs/`](docs/README.md):

- [Features](docs/FEATURES.md)
- [Design system and brand](docs/DESIGN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Local development](docs/DEVELOPMENT.md)
- [Configuration](docs/CONFIGURATION.md)
- [Routes and HTTP endpoints](docs/ROUTES.md)
- [Machine API v1](docs/API.md)
- [Security model](docs/SECURITY.md)
- [Testing and quality gates](docs/TESTING.md)
- [Production release checklist](docs/PRODUCTION_RELEASE.md)
- [Production operations](docs/production-operations.md)

## Common commands

```bash
npm run dev                  # development server
npm run lint                 # ESLint
npx tsc --noEmit             # TypeScript validation
npm run test:unit            # unit tests
npm run test:integration     # PostgreSQL-backed tests
npm run test:e2e             # browser tests against development
npm run test:e2e:production  # browser tests against standalone output
npm run test:coverage        # repository-wide coverage report
npm run build                # production build
npm run brand:generate       # rebuild favicon, app icons, social card and email lockup from public/brand SVGs
```

## Contributing

Bug reports, ideas and pull requests are welcome:

- [Report a bug](https://github.com/SpaceWorks-HQ/SpaceWorks-Events/issues/new)
- [Suggest an idea or ask a question](https://github.com/SpaceWorks-HQ/SpaceWorks-Events/discussions)
- [Contributing guide](CONTRIBUTING.md)

Please report security issues privately rather than in a public issue (see the contributing guide).

## Credits

Space Works Events is based on [Yuyu](https://github.com/twilighty-abhi/yuyu) by
Abhiram N J. See [NOTICE](NOTICE).

## Licence

Copyright © 2026 Space Works. Space Works Events is free software, licensed under
the [GNU Affero General Public License v3.0 or later](LICENSE). If you run a
modified version for other people over a network, the licence requires you to
offer them its source code.

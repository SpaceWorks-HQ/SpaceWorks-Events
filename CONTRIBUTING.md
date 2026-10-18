# Contributing to Yuyu

Thanks for helping make free community events easier to run. Yuyu is built in
the open at [github.com/twilighty-abhi/yuyu](https://github.com/twilighty-abhi/yuyu).

## Ways to help

- **Report a bug.** [Open an issue](https://github.com/twilighty-abhi/yuyu/issues/new)
  with what you expected, what happened, and the steps to repeat it. Include your
  browser or device and, for self-hosted installs, the Yuyu version.
- **Suggest an idea.** Start a thread in
  [Discussions](https://github.com/twilighty-abhi/yuyu/discussions). Describe the
  problem your community has before the solution you have in mind.
- **Send a pull request.** For anything larger than a small fix, open an issue or
  discussion first so we can agree on the approach.

## Security issues

Please **don't** report vulnerabilities in a public issue. Contact the maintainer
privately through GitHub (the repository owner's profile) and allow time for a fix
before disclosing. The security model is described in
[docs/SECURITY.md](docs/SECURITY.md).

## Local setup

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). In short:

```bash
npm install
docker compose up -d
cp .env.example .env
npm run db:migrate
npm run dev
```

Never commit `.env` or real secrets.

## Before opening a pull request

1. Read [AGENTS.md](AGENTS.md). It covers the Next.js 16 rules, product boundaries
   and the security model every change must keep.
2. Keep each change focused, and match the surrounding code's style.
3. Run at least:

   ```bash
   npm run lint
   npx tsc --noEmit
   npm run test:unit
   ```

   Changes to authorization, mutations, public routes, the API or deployment need
   the stronger checks in [docs/TESTING.md](docs/TESTING.md).
4. UI changes follow [docs/DESIGN.md](docs/DESIGN.md). Check light and dark mode
   and a 360px-wide screen. Don't restyle organiser logos, covers or colours with
   Yuyu's brand.
5. Database changes need a reviewed Prisma migration.
6. Describe what changed and how you tested it in the pull request.

## Product boundaries

Yuyu is for **free** events. Contributions that add payments, ticket sales, ads or
third-party trackers won't be accepted.

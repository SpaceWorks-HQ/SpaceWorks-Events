# Contributing to Space Works Events

Thanks for helping make free maker and community events easier to run. Space Works
Events is built in the open at
[github.com/SpaceWorks-HQ/SpaceWorks-Events](https://github.com/SpaceWorks-HQ/SpaceWorks-Events).

## Ways to help

- **Report a bug.** [Open an issue](https://github.com/SpaceWorks-HQ/SpaceWorks-Events/issues/new)
  with what you expected, what happened, and the steps to repeat it. Include your
  browser or device and, for self-hosted installs, the version you run.
- **Suggest an idea.** Start a thread in
  [Discussions](https://github.com/SpaceWorks-HQ/SpaceWorks-Events/discussions). Describe the
  problem your community has before the solution you have in mind.
- **Send a pull request.** For anything larger than a small fix, open an issue or
  discussion first so we can agree on the approach.

## Security issues

Please **don't** report vulnerabilities in a public issue. Use GitHub's private
vulnerability reporting on the repository (Security → Report a vulnerability) and
allow time for a fix before disclosing. The security model is described in
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
4. UI changes follow [docs/DESIGN.md](docs/DESIGN.md) and the Space Works brand:
   sentence case, clear and warm copy, teal for actions, and no "Oops" or
   "Something went wrong". Check light and dark mode and a 360px-wide screen.
   Don't restyle organiser logos, covers or colours with the Space Works brand.
5. Database changes need a reviewed Prisma migration.
6. Describe what changed and how you tested it in the pull request.

## Licence

By contributing, you agree that your contributions are licensed under the
[GNU AGPL-3.0-or-later](LICENSE), the same licence as the project.

## Product boundaries

Space Works Events is for **free** events. Contributions that add payments,
ticket sales, ads or third-party trackers won't be accepted.

# Contributing to ControlLayer

Thanks for helping! Bug reports, new checks, framework catalogs and documentation fixes are all welcome.

## Getting set up

See "Running locally for development" in the [README](./README.md). In short:

```bash
npm install
docker compose up -d db
cp .env.example .env
npm run db:migrate && npm run db:seed
npm run dev
```

Click **Load sample data** to get a realistic workspace without cloud credentials.

## Before opening a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs the same steps.

## Guidelines

- **Checks stay read-only.** Collectors in `src/connectors/` may only call read/list/describe APIs. Anything that changes a cloud account must be opt-in behind an environment variable and admin-only, like `ENABLE_AWS_REMEDIATION`.
- **Never pass on missing data.** If a check can't evaluate (the inventory section is missing), return `null` so it is reported as not evaluated.
- **Every check needs tests** in `src/checks/checks.test.ts`, covering at least one passing and one failing resource.
- **Map checks to controls** in every framework they genuinely support. Each mapping should hold up if an auditor asks why.
- **Framework text** should be plain-language summaries in your own words. Don't paste copyrighted standard text (AICPA, PCI SSC).
- **Schema changes** need a migration: `npx prisma migrate dev --name describe-change`.
- **Evidence integrity:** don't add code paths that update or delete non-sample evidence records; the hash chain treats that as tampering.

## Reporting bugs

Open an issue with steps to reproduce, what you expected and what happened. Remove account IDs, resource names and anything else sensitive from logs first.

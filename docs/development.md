# Development

Running ControlLayer from source, how it is built, and how to extend it. Back to the [README](../README.md).

## Running locally for development

Requirements: Node.js 22+, PostgreSQL 15+ (or `docker compose up -d db`).

```bash
npm install
cp .env.example .env              # DATABASE_URL points at the compose database on port 5433
npm run db:migrate                # create tables
npm run db:seed                   # load the framework catalog (SEED_SAMPLE_DATA=true to add sample data)
npm run dev                       # http://localhost:3000
```

| Command | What it does |
| :--- | :--- |
| `npm test` | Unit tests (checks, evidence chain, audit package, scoring, auth helpers) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build` | Production build |
| `npm run scan [aws gcp azure gworkspace m365 github ad devices]` | Scan configured integrations from the command line |
| `DATABASE_URL=… node scripts/screenshots.mjs URL` | Regenerate the README screenshots from a running instance on an empty database (needs Playwright) |

## How it works

```
cloud APIs ──► connectors (read-only)  ──► normalized inventory
                                               │
                                               ▼
                                      checks (pure functions)
                                               │
              ┌────────────────────────────────┼─────────────────────────────┐
              ▼                                ▼                             ▼
     findings (open / resolve)       evidence (hash-chained)      control status per framework
                                               │
                                               ▼
                                   audit package (ZIP + manifest)
```

- `src/frameworks/`: control catalogs (SOC 2, ISO 27001, HIPAA, GDPR, CMMC, PCI DSS, ISO 42001, NIST AI RMF) with expected evidence.
- `src/connectors/`: AWS, Google Cloud, Azure, Google Workspace, Microsoft 365, GitHub and Active Directory collectors, browser sign-in, plus the sample company.
- `src/devices/` and `assets/agent/`: the device agent scripts, the report format and the report endpoint.
- `src/policies/`: policy templates, publishing, sign-off links and the safe Markdown renderer.
- `src/questionnaires/`: the answer bank (written from live data), question matching and spreadsheet import/export.
- `src/vendors/`, `src/access/`, `src/risks/`: vendor risk, access reviews and the risk register; each saves its records as evidence.
- `src/frameworks/crosswalk.ts`: how SOC 2 evidence also counts toward ISO 27001, HIPAA and GDPR.
- `src/trust/`: Trust Center settings, verified practices and access links.
- `src/checks/`: checks over the normalized inventory, each mapped to framework controls. They don't call cloud APIs, so they are unit-tested directly.
- `src/scan/`: runs a scan, records results, opens and closes findings, stores evidence.
- `src/assessment/`: deterministic control status (Met, Partially Met, Not Met, Needs Evidence, Not Applicable).
- `src/evidence/`: hash chain, RFC 3161 timestamps, evidence image rendering, integrity verification and the audit package builder.

### Adding a check

Add an entry to the provider's file in `src/checks/` (`aws.ts`, `gcp.ts`, `azure.ts`, `identity.ts`, `github.ts` or `devices.ts`) with the controls it maps to. If it needs data that isn't collected yet, extend the inventory type and its collector in `src/connectors/`. Add a test in `src/checks/checks.test.ts`. The test suite fails if a check maps to a control that doesn't exist.

### Adding a framework

Create `src/frameworks/<name>.ts` following `soc2.ts`, register it in `src/frameworks/index.ts` and in `FRAMEWORK_GROUPS` (`src/components/ui.tsx`), and either add its control IDs to the relevant checks or extend the crosswalk in `src/frameworks/crosswalk.ts`. The control table syncs on startup, and existing evidence is linked to crosswalked controls automatically.

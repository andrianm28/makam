# Launch-data importer runs on the staging and production hosts

Status: in-progress
Blocked by: 06
Spec: spec.md, Operator facts and reference data (ticket 06); runbook "First Admin Platform", "seed-contoh-publik"

## What to build

Ticket 06's launch-data importer (`src/cli/import-data-peluncuran.ts`) only runs from a source checkout (`npm run import:data-peluncuran`), but the staging and production hosts have no Node toolchain: they run CLIs as `$S exec web node dist/<name>.mjs`. `scripts/build-worker.mjs` does not bundle the importer, and the runtime image carries no `docs/ops/data-peluncuran/` CSVs. The operator must be able to copy the owner's CSV folder into the running `web` container and import it with a dry run first, then `--tulis` with the stack's allowance.

## Acceptance criteria

- [ ] `npm run build:worker` produces `dist/import-data-peluncuran.mjs`, self-contained like the other bundled CLIs.
- [ ] A test builds the bundle and runs it as the host does (`node dist/import-data-peluncuran.mjs`): usage without `--sumber`, a directory with no template file refused, and the staging and production allowances still refused by default before any database is touched.
- [ ] `--sumber` takes a directory copied into the container (it already takes a directory; the bundle reads nothing relative to its own location, so no `import.meta.url` path needs copying into `dist/`).
- [ ] The runbook documents the host steps: `docker compose … cp docs/ops/data-peluncuran web:/tmp/data-peluncuran`, the dry run, then `--tulis --izinkan-staging` (production: `--izinkan-production`), with the expected output.

## Comments

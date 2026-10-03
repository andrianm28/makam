# Launch-data importer runs on the staging and production hosts

Status: in-progress
Blocked by: 06
Spec: spec.md, Operator facts and reference data (ticket 06); runbook "First Admin Platform", "seed-contoh-publik"

## What to build

Ticket 06's launch-data importer (`src/cli/import-data-peluncuran.ts`) only runs from a source checkout (`npm run import:data-peluncuran`), but the staging and production hosts have no Node toolchain: they run CLIs as `$S exec web node dist/<name>.mjs`. `scripts/build-worker.mjs` does not bundle the importer, and the runtime image carries no `docs/ops/data-peluncuran/` CSVs. The operator must be able to copy the owner's CSV folder into the running `web` container and import it with a dry run first, then `--tulis` with the stack's allowance.

## Acceptance criteria

- [x] `npm run build:worker` produces `dist/import-data-peluncuran.mjs`, self-contained like the other bundled CLIs.
- [x] A test builds the bundle and runs it as the host does (`node dist/import-data-peluncuran.mjs`): usage without `--sumber`, a directory with no template file refused, and the staging and production allowances still refused by default before any database is touched.
- [x] `--sumber` takes a directory copied into the container (it already takes a directory; the bundle reads nothing relative to its own location, so no `import.meta.url` path needs copying into `dist/`).
- [x] The runbook documents the host steps: `docker compose … cp docs/ops/data-peluncuran web:/tmp/data-peluncuran`, the dry run, then `--tulis --izinkan-staging` (production: `--izinkan-production`), with the expected output.

## Comments

- 2026-10-03 — Builder. Added the `import-data-peluncuran` entry to `scripts/build-worker.mjs`; test `tests/tooling/import-data-peluncuran-bundle.test.ts` (red first: bundle missing). `--sumber` already took a directory and the importer's imports use no `import.meta.url`/`__dirname`, so no files are copied into `dist/`. Runbook section "Import the launch data on the host". Spec note for the owner: the allowance flag is `--izinkan-production` (ticket 06's contract), not `--izinkan-produksi` as in `import-katalog-lama`; kept, and the runbook says so.
- 2026-10-03 — First review (opus, Standards + Spec): 0 critical, 4 major (test left `dist/` behind; test did not prove self-contained; runbook `cp` source path absent on host; cleanup needs `-u root`), 4 minor. Fixed: the test copies the bundle alone to a temp dir and removes `dist/` if it created it; exact refusal strings asserted; runbook gives scp + absolute path, `exec -u root` cleanup, "fresh stack" note. Ticket 102 does not exist (numbering gap kept at the owner's request).

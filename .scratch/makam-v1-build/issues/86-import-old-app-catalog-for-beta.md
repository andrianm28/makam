# Import the old app's cemetery catalog as beta data

Status: ready-for-agent
Blocked by: 12
Spec: Release plan (beta UAT push); ADR 0002 (beta UAT amendment); decided with the user 2026-09-26

## What to build

The v1 beta for UAT is seeded with the frozen Laravel app's cemetery catalog (read-only from its database at /home/ubuntu/makam-app's stack), so testers see real-looking Lokasi. Only non-personal catalog data comes across.

## Acceptance criteria

- [ ] An ops command (like `seed:admin`) reads, read-only, the old app's cemetery directory: name, address, city, coordinates / Google Maps URL, photos, facilities, and prices where they map to v1 Jenis Makam and tariffs; it creates Lokasi Mitra (and tariffs) in v1 marked as beta/dummy.
- [ ] It never reads or copies users, orders, payments, phone numbers, emails, documents or any personal data; a test proves the import only touches the whitelisted fields.
- [ ] Idempotent (running it twice doesn't duplicate); refuses on a database that isn't the beta/staging one unless explicitly allowed; every write audited as an ops action.
- [ ] Imported Jenis Makam whose all-in total exceeds the Rp 10 juta cap are kept but not listed (spec, Billing).
- [ ] Runbook section; the old app's stack and data are never modified.

## Comments

- 2026-09-27 — Orchestrator: Spec axis on `cd07f7e`. To fix in the next pass. **The first one is the one that matters:**
  1. **The runbook query invents facilities.** It selects `'fasilitas', '["parkir","musala"]'::jsonb` — a constant for every row, so the export would state that every cemetery has parking and a prayer room when the source says nothing of the kind. This is exactly the kind of invented fact a family reads on a cemetery's page. Either export the real column or leave it null; never fill a fact-shaped field with a constant.
  2. **The only price that does exist is not exported.** `cemeteries.price_min` / `price_max` is the one real price in the old app (an indicative range), so the report says "no price" where a range exists. Export it as an indicative range, clearly labelled — still never as a Tarif.
  3. **No test binds the runbook's SQL to the export contract**, which is why both of the above got through. Add one, so the documented query and the contract cannot drift apart.
  4. **The runbook tells the owner to pass "the reason" to `lokasi.buat` / `lokasi.ubah_profil`,** and that signature has no such parameter. Fix the runbook to match the real call.
  5. **AC 1's escape hatch is missing.** The tool refuses staging too, with no "unless explicitly allowed", so "the v1 beta … is seeded with the old app's catalog" cannot hold on the environment the beta actually runs on, and the runbook quietly substitutes a dump from a dev stack. Either add the explicit allowance (named, audited, refused by default) or rewrite the AC to say what the tool really does.
  6. **Two AC lines were not rewritten even though the research says they cannot hold:** "photos" (not imported) and "marked as beta/dummy" (no marker exists on `lokasi_mitra`; only the ledger and the report know). Rewrite both lines or implement the marker — a `Comments` note is not an accurate acceptance criterion.
  7. A decision for the owner, recorded rather than fixed: the module is named for its source, and the research says that source is 100 % fictional. On the 78 TPU DKI path the CSV has no old `kode`, so the ledger loses its key and its two tables go dead. The reusable part (map, export contract, CLI) is source-agnostic; the ledger is not.
  - Verified good: the PII guard, the refusal to touch the old database, and the tests — they run against a real Postgres and read results back through the public Lokasi and Tariffs queries, the cap through the public `lokasiPricing` rather than the staff one. The fictional data, the scope collision with ticket 43, the publish gate and the indicative prices are recorded as an owner decision rather than papered over.

- 2026-09-27 — Orchestrator: Standards axis on `cd07f7e` — **3 HARD**, to fix in the same pass as the Spec findings above.
  1. **Invented facts in the runbook query** (`docs/ops/runbook.md`, around line 190) — the same defect the Spec axis found, seen from the other side: `'fasilitas', '["parkir","musala"]'::jsonb, -- c.facilities, mapped by hand` maps nothing, so every imported Lokasi would be stored with parking and a prayer room that the source never claimed. It also selects `'pengelola', coalesce(nullif(c.operator_name,''), '-')`, writing a placeholder as a real `pengelolaName` (which is `notNull`) — a default that invents a fact.
  2. **Sample data gets through as real data.** `peta.ts` `penandaDataContoh` reaches `rencana.dataContoh` and becomes nothing but a report line ("Data contoh di aplikasi lama"). There is no flag, no note and no audit trail, so the row becomes an ordinary Lokasi Mitra. Nothing is fail-closed. If the source is fictional, the row must say so in a way the rest of the system cannot ignore — a flag on the record, and a refusal to list it — or the import must not create it.
  3. **The audit is outside the same transaction.** `katalog-lama/index.ts` `catatLokasi` / `catatJenisMakam` call `deps.db.update(...)` first and only then open `staffWrite` for `catatImport`, which breaks the repo's own rule that a staff write must record its Entri Audit to commit (`lokasi-mitra.ts:392`, `publish.ts:48`). If the process dies between the two, a code is bound with no audit and the next run skips it silently. Both writes go in one transaction, with the audit, or not at all.
  - One residual gap worth closing while there: the PII guard checks column *names* before reading any value (that part is right, and `.strict()` closes the new-column, alias, TLD and JSON-key vectors), but free-text fields — `catatanFasilitas`, `deskripsi`, `pengelola` — are never inspected, so a nested JSON string inside one of them walks straight past the guard. Decide and implement one position on free-text fields.
  - Judgement calls: `RencanaLokasi` repeats `name`/`pengelolaName`/`address`/`city` across `lokasi: NewLokasiMitra` and `profil: LokasiProfileInput` (one change, two places); and `peta.ts` relies on `jenis.hargaHakPakai!` plus a non-null assertion on `masaHak` that only `superRefine` in `ekspor.ts` guarantees — `susunRencana` trusts a contract that is not its own. Make the invariant its own.
  - Migration `0020` is additive (two CREATE TABLE) and does **not** collide — `main` is at `0019`. Note that ticket 36 will also want the next number after its own collision, so the merge order decides who takes `0020`.



# DKI TPU catalog, prices and pages

Status: ready-for-agent
Blocked by: 16, 17
Spec: Domain modules > 3. Lokasi (TPU); 4. Tariffs (DKI Biaya Pengurusan, Retribusi Pemda); 14. Work Queues (Tier 4 TPU flag stale); Public site > Content pages (Pengurusan di TPU DKI); stories 7 (TPU cards), 13, 14, 148

## What to build

The TPU side of the Lokasi module: every DKI TPU with name, address, pin, data source and the "menerima makam baru" flag with its last-updated date, maintained by Admin Platform; a Tier 4 reminder row when the flag hasn't been updated for 14 days. Add the DKI price book entries to Tariffs: the two Biaya Pengurusan amounts (burial, filing-only) and Retribusi Pemda lines (Rp 0 today). Build the DKI TPU page ("TPU resmi Pemprov DKI Jakarta", new-plot status with its date, a price box with retribusi IPTM Rp 0 and the two Biaya Pengurusan amounts as service fees), add TPU cards to Daftar Lokasi Makam, and write the Pengurusan di TPU DKI page.

## Acceptance criteria

- [ ] Admin Platform adds and edits DKI TPUs (name, address, pin, data source, initial flag) in the dashboard, audited; there is no seed (test fixtures only); every DKI TPU is listed. Admin Platform also enters the two Biaya Pengurusan amounts here (values: ticket 06).
- [ ] Admin Platform edits the flag; each update stamps the date and is audited; the Tier 4 row appears 14 days after the last update and closes on update.
- [ ] Biaya Pengurusan (two amounts) and Retribusi Pemda lines are versioned like other tariffs; no Biaya Layanan Platform on TPU quotes.
- [ ] The TPU page never uses "Terverifikasi"; it shows "TPU resmi Pemprov DKI Jakarta" and the flag with "diperbarui <tanggal>".
- [ ] Daftar Lokasi includes DKI TPU cards and the type filter covers them; a TPU card's "mulai Rp X" is the burial Biaya Pengurusan + Retribusi Pemda (Rp 0 today).
- [ ] Pengurusan di TPU DKI page: the free DIY guide (TPU on the day → surat pengantar → JakEVO / PTSP, free), the two Biaya Pengurusan amounts, the DKI Layanan price list (from ticket 49 when present), and entries to Saat Duka TPU, Perpanjang IPTM and "Sudah dimakamkan? Kami urus IPTM-nya".
- [ ] Tests: stale-flag row timing; TPU quote has no platform fee; TPU card "mulai Rp X" = burial Biaya Pengurusan + Retribusi Pemda; Retribusi Rp 0 line shown as its own line.

## Comments

- 2026-09-27 — Orchestrator: both axes reviewed this branch, and **the two reviewers found the same indexing bug independently**, which is the strongest signal there is. `src/app/lokasi/page.tsx` builds `hargaLokasiMitra` from `cards.filter(card => card.kind === "lokasi_mitra")` — an array as long as the Lokasi Mitra cards — and then renders `hargaLokasiMitra[index]` where `index` comes from the *combined* `cards.map((card, index) => …)`. `publicLokasiMakamList` re-sorts the combined list by name, so a subset index never matches a combined index: any Lokasi Mitra sorting after a TPU reads the wrong price or `undefined` and shows "Harga belum tersedia". Ticket 16's page and story 7 are broken by this ticket, and the "mulai Rp X" rule was only ever tested in the domain. Fix by attaching the price to the card instead of indexing two parallel arrays, and add a page-level test with a TPU sorting first.
  - **Standards, 1 HARD:** `drizzle/0019_demonic_impossible_man.sql` and its journal entry (idx 19, tag `0019_demonic_impossible_man`) collide with `0019_pemesanan_makam` already on `main` at the same index; two `0019` tags leave the journal broken. Per AGENTS.md this is regenerated from a current base with `npm run db:generate` after merging `main`, never hand-edited. Reported, not touched.
  - **Spec, 2 items.** AC 6's entries to Saat Duka TPU / Perpanjang IPTM / "Sudah dimakamkan? Kami urus IPTM-nya" exist only as a "Segera hadir" string — correct, those are tickets 44/47's wizards, and the "Segera" text carries no ticket number and no date promise — but the ticket file was never touched: no AC ticked, no record here. A decision that lives only in a report to the orchestrator is a decision that gets lost. Tick what is genuinely done and write the rest down in this file. Minor: the TPU page header shows month/year while the full date appears in the "Data TPU ini" card, while AC 4 asks for "diperbarui <tanggal>"; decide which the header means and make the page consistent.
  - **Standards, judgement calls:** the magic numbers `address: 300, city: 120, dataSource: 200` in `staf/admin-platform/tpu/schema.ts` repeat literals from `lokasi/tpu.ts` while the comment claims they are "written once" (only `TPU_NAME_MAX` is imported); `jenis` stays a `string` in `searchParamsSchema` and is re-checked with `isKind` twice, where the repo's `fasilitas` precedent puts the refine inside the schema; `updateTpuDkiFlag` reads the clock three times per write (`values`, `after`, and `updatedAt` in `writeTpuDki`), so the audit snapshot can differ from the stored row; `tier4-tpu-row.ts` duplicates the overdue filter that `tier4-shared.ts` exists to stop the row types repeating, so the fourth type should not have its own shape; and `lokasi/index.ts` exports `tpuFlagSchema` (no consumer) and the internal `InvalidTpu`, while `tpuProfileSchema` is used only by its own test.
  - **Verified good:** no Petak, Hak Pakai or publish gate exists for a TPU (only `tpu_dki` in `lokasi/schema.ts`, owned by Lokasi, matching CONTEXT.md — the platform holds no inventory at a TPU); no `new Date()` in the domain; every domain import goes through a barrel; the Tier 4 row registers in `registry.ts` without touching the aggregator or the UI; "mulai Rp X" and Biaya Pengurusan + Retribusi are computed in `tariffs/tpu-pricing.ts` through `quote()`; one shared city filter serves both kinds (`city` is now required on a TPU, which is what story 7 asked for); no ticket numbers in copy; the 14-day rule comes from the spec, is recorded in the row's doc-comment, and its test drives `antrean()` with a fake Clock across the 07:59/08:00 boundary.

## Notes

A non-zero Retribusi Pemda is paid on to the Pemda from a Tier 3 "Setor Retribusi" row (ticket 45).

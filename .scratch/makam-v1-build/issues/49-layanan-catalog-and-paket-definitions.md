# Layanan catalog, prices and Paket Layanan definitions

Status: ready-for-agent
Blocked by: 16
Spec: Domain modules > 9. Layanan (Catalog, Paket Layanan); 4. Tariffs (Layanan variant prices, DKI Layanan, Mitra Jasa rate); stories 9 (Layanan prices), 154

## What to build

Admin Platform keeps the one global Layanan catalog: fixed-price variants, text fields (e.g. nisan inscription), minimum lead time, "bisa hari-H" flag, "makes sense on an empty plot" flag and required proof (after photo always; before photo for Pembersihan and Perawatan Rumput & Taman; video for the Laporan Foto/Video). Each Lokasi switches on Layanan from the list with its Lokasi price per variant; DKI Layanan prices and the Mitra Jasa rate per variant are versioned in Tariffs. Admin Platform defines Paket Layanan (items + frequency sekali / bulanan / 3-bulanan / tahunan); a Paket is priced as the sum of the place's item prices and offered only where every item is offered. Layanan prices appear on the Lokasi page and the Pengurusan di TPU DKI page.

## Acceptance criteria

- [ ] Catalog CRUD by Admin Platform only, audited; variants have fixed prices per place (no free pricing).
- [ ] Required proof is derived per Layanan as listed above.
- [ ] Admin Platform marks each Batu Nisan variant "boleh di TPU DKI" by hand (audited); only marked variants are offered at a TPU (DKI price list, TPU orders). No Pemda rules are encoded.
- [ ] A Lokasi offers only the Layanan it switched on; the Lokasi page lists them with all-in prices.
- [ ] Mitra Jasa rate per variant is versioned; never shown to the Pemesan.
- [ ] Paket price = sum of item prices at that place from `quote()`; a Paket is hidden where any item is not offered.
- [ ] Tests: Paket availability rule; price sum; proof requirements per Layanan; versioned DKI prices; unmarked Batu Nisan variants not offered at a TPU.

## Comments

- 2026-09-27 — Orchestrator: both axes reviewed this branch. **4 HARD** (Standards) and 4 items (Spec), to fix in the next pass.
  - **HARD 1 — the Audit Log's "before" can belong to a different Lokasi.** `src/domain/tariffs/layanan-harga.ts:129` computes `versions` with `versionsOfLayanan(tx, buku, layananVariantId)`, and `versionsOfLayanan` (`:79-83`) filters on `layananVariantId` **only, without `lokasiId`**. For the `harga_layanan` book (whose table has a `lokasi_id`), the version being replaced may belong to another Lokasi. That breaks the invariant the repo states about itself in `locks.ts:5-7` ("each Entri Audit's 'before' is exactly the version it replaces") and differs from `biaya-pemakaman.ts:65`. Root cause: append-only tariffs (before/after), so the fix has to keep "before" exact.
  - **HARD 2 — a business rule in a Server Action.** `actions.ts:288-295` `tawarkanLayanan` performs two domain writes across two modules (`layanan` then `tariffs`) in two separate transactions, justifying the order in the action. AGENTS.md: no business rule lives in a Server Action. Its comment ("a failed price leaves nothing half-offered") is also false — the offer row has already committed. The real bug this hides: if the price is rejected, the offer survives as not-listed while the screen says "gagal".
  - **HARD 3 — destructive actions without a ConfirmDialog.** `HapusVarianForm`, `HapusPaketForm` and `StopLayananForm` are plain `<Button variant="destructive">` inside a `<form>`, no dialog, and the reason is optional. `docs/design-system.md:205,224` requires a ConfirmDialog for an action that cannot be undone.
  - **HARD 4 — migration collides with `main`.** `drizzle/0019_mature_amphibian.sql` and its journal entry (`idx: 19`) collide with `0019_pemesanan_makam` on `main`. The DDL itself is clean expand-only (CREATE TABLE plus the `tariff_append_only` trigger, no DROP/ALTER/SET NOT NULL). Regenerate from a current base with `npm run db:generate`; never hand-edit the journal.
  - **Spec 1 — this ticket's file was not touched at all.** No AC ticked, no rewrite, no `## Comments`. AC "Layanan prices appear on the Lokasi page and the Pengurusan di TPU DKI page" can only be half met here, since the TPU page belongs to 43 — whose AC 6 already says "the DKI Layanan price list (from ticket 49 when present)". Amend the AC in **this** file; the precedent is the Spec finding on ticket 43.
  - **Spec 2 — "Catalog CRUD by Admin Platform only, audited" has no delete-Layanan at all.** `Layanan`'s interface has `createLayanan`, `ubahLayanan`, `tambahVarian`/`hapusVarian` and `hapusPaket`, but nothing to remove a Layanan itself. Either implement it (with the audit and the dialog) or rewrite the AC to say what is deletable.
  - **Spec 3 — "Required proof is derived per Layanan" derives nothing.** `bukti` (`foto_sebelum_dan_sesudah`, `foto_dan_video`) is Admin Platform's free choice; nothing binds Pembersihan Makam or Perawatan Rumput & Taman to before-photos and Laporan to video. Worse, the test named "is derived per Layanan" sets the value per name and reads it back — it asserts its own input, so it stays green even when Pembersihan is given `foto_dan_video`. Either derive it or delete the claim from the AC.
  - **Spec 4 — minor:** `frekuensiLabel` (producing "setiap 3-bulanan", "setiap tahunan") is unused.
  - Judgement calls: `Tariffs.hargaLayananHistory`, `hargaLayananLokasiHistory`, `Layanan.penawaranTpu` and `hargaPaket` have no production caller (tests only) — either wire them to something real or stop exporting them; `{lokasiId, layananVariantId, namaLayanan, namaVarian}` travels together in four places, and the two free-text names are not bound to the variant id, so a wrong name can silently reach a Tagihan or a PDF; `nameKeyOf` is duplicated in `paket.ts:60` and `varian.ts:29`, and `reasonOf` in three files; `priced()`/`layananDiLokasi` in `harga.ts` is an N+1 (two queries per variant); and two typos are visible to staff — "Berah di petak kosong" and "Mitra Jpa".
  - **Verified good:** table ownership is clean (`layanan` writes only its five tables; `tariffs` only adds a *line kind* to its own quote union and never reads a `layanan` table — the names arrive from the caller); no price is stored twice; append-only holds (no UPDATE or DELETE, the trigger, `effectiveDateRefusal` through the Clock and WIB); `hapusPaket` is **not** speculative generality — the subscription refusal is only deferred, with a comment; no ticket numbers and no "Segera" date promises in copy; nothing from 50/54/55 or the TPU page leaked in.

## Notes

TPU nisan variants: resolved as a hand-set "boleh di TPU DKI" mark per Batu Nisan variant (see 00-index).

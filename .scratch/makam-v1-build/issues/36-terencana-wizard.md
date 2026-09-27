# Pemesanan Terencana wizard with Denah picker and plot hold

Status: ready-for-agent
Blocked by: 16, 82
Spec: Domain modules > 6. Pemesanan (Terencana); 5. Inventory (hold); Public site > Booking wizards (Terencana: Lokasi → Petak → Data & kirim); stories 39, 40, 41, 42, 43, 44, 45

## What to build

The Terencana wizard: Lokasi (filter by city, all-in price range and facilities; only Lokasi with Terencana switched on) → Petak (the Denah, picking one or more Tersedia Petak or a Kavling Keluarga; occupied, reserved and blocked plots not pickable; a tumpang-only plot tells the Pemesan to contact the Admin Lokasi) → Data & kirim (Calon Penghuni default "untuk saya sendiri", Pemegang Hak, required email and phone, email Kode Masuk at Kirim as in ticket 22). The headline price covers Harga Hak Pakai + Biaya Layanan Platform, with a separate "Nanti" line for Biaya Pemakaman + Biaya Layanan Platform "sesuai tarif saat pemakaman (saat ini Rp X)". The Syarat Pemesanan Terencana (Masa Pembatalan, later refund %, the right being against the Lokasi Mitra) is shown before Kirim and snapshotted on the order. Submission places a hold on the chosen plots.

## Acceptance criteria

- [ ] Only Terverifikasi Lokasi with "Pemesanan Terencana aktif" appear.
- [ ] The Denah picker allows only cleared Tersedia Petak / Tersedia Kavling Keluarga; Dipesan, Terisi, Tidak Tersedia and Perlu Verifikasi cells are disabled with a legend.
- [ ] A tumpang-only (released, still Terisi) plot shows "hubungi Admin Lokasi" instead of being pickable.
- [ ] Prices come from `quote()`; the Nanti line shows the current Biaya Pemakaman + Biaya Layanan Platform.
- [ ] The Syarat snapshot is stored on the order and later reads use the snapshot, not the Lokasi's current policy.
- [ ] Submission: status Diajukan, Nomor Pemesanan, hold on every chosen Petak / kavling so no one else can take it; a concurrent second submission for the same plot fails.
- [ ] Tests: hold placement and race; picker eligibility; Syarat snapshot immutability after a policy change.

## Notes

Empty-plot Layanan at this checkout is ticket 53.

## Comments

- 2026-09-27 — Orchestrator: Standards axis on `6f52577`, 3 HARD:
  1. **The hold is never released.** `src/domain/inventory/index.ts:130` `lepasTahan()` has no production caller (only `hold.test.ts:144`), the `sampai` column (`src/domain/inventory/schema.ts:232`) is never written, and there is no scheduler tick. Spec, Inventory > Denah: "released on decline, withdrawal or lapse" — so an order that is never confirmed holds its plots forever. **This is not a scope violation** (a Terencana order's decline is ticket 37's confirmation, ticket 38's cancellation), but a mechanism that nothing can reach is speculative generality in the other direction. Keep `lepasTahan` and the column (37 needs them and the column is already pushed), and make the ownership explicit: a comment on `lepasTahan` naming ticket 37, the same note in the ticket, and an integration test that `placeTerencana` then `lepasTahan` inside a transaction really frees the Petak for someone else. Then the risk is locked by a test instead of left as dead code.
  2. **Deep imports past the public interface.** `src/app/pesan-makam/terencana/denah-picker.tsx:6` imports `@/domain/pemesanan/harga-terencana` (already re-exported by `pemesanan/index.ts:38`), and `terencana.ts:11` + `harga-terencana.ts:12` import `@/domain/billing/batas` (already re-exported by `billing/index.ts:61`). AGENTS.md: a module is a deep module with a small interface in `index.ts`; neighbours call public functions.
  3. **Business rules in a client component.** `denah-picker.tsx:66,75` re-implements the mixed Petak/Kavling rule that lives in the domain (`hold.ts:64` `unit_campur`), and `hitungTersedia` (`:232`) recomputes `inventory.tersediaUntukTerencana`. AGENTS.md: no business rule lives in a page or component. Move both into the domain read and have the picker render what it is told.
  - Judgement calls: Zod in two places (`draft.ts:11-27` vs `placeSchema` — `units` `.min(1)`/`.max(50)` vs `hold.ts` `.max(100)`, and `pemegangHak: "pemesan"` without `name` in the draft but required in the domain) — one source of truth; `hargaBands` (`terencana.ts:39-43`) and `page.tsx:27` hardcode `10_000_000`/`25_000_000` instead of `QRIS_PAYMENT_CAP`; `harga-terencana.ts` sums the total itself while the domain has `quote()`; the migration must be regenerated on rebase (see the merge note below).
  - Merge note recorded by the builder and confirmed here: this branch and ticket 22 both claim drizzle `0017`, and `pemesanan/index.ts`, `identity/authorize.ts` (`pemesanan.buat`/`pemesanan.lihat`, resource `pemesanan_makam`), `src/lib/terencana-pesan.ts` and `draft.ts` are written twice — once here, once in ticket 22. **Ticket 22 merges first**; this branch is then rebased onto it, the migration regenerated as a fresh `0019`, and the duplicated surface folded into the surviving copy. Do not try to reconcile the two in one merge.
- 2026-09-26 — ADR 0004: Data & kirim follows ticket 22: required email proven by the Kode Masuk, phone as contact, "Tidak punya email? Minta bantuan CS". Now blocked by 82.
- 2026-09-26 — Decided with the user from the public prototype v2 (https://claude.ai/artifact/SYuh5fzc8TjkWQ5aoecYiF, branch worktree-agent-ab5e1eadecba063e3, commit 23d2d17): the Terencana Lokasi step has no total bar and a card opens the Denah; the Denah picker shows Tersedia / Pilihan Anda / Dipesan / Terisi / Tidak Tersedia / Kavling Keluarga / Jalan / Bukan Petak, with a small corner dot on a Terisi Petak that can still take a tumpang (legend "Terisi, bisa untuk tumpang (hubungi Admin Lokasi)"); several Petak across Bloks or Jenis Makam may be picked in one order (one Hak Pakai each, same Pemegang Hak) or one whole Kavling Keluarga; a Petak taken meanwhile is caught both at Lanjut and at Kirim with the same friendly message, returning to the Denah with the other picks kept; the Syarat Pemesanan Terencana are shown and snapshotted with the order, with no "Saya setuju" checkbox; one Biaya Layanan Platform per Tagihan.
- 2026-09-26 — User decision (supersedes the same-day manual-transfer note): v1 takes no order whose Tagihan would exceed Rp 10.000.000 (QRIS cap); see spec, Billing. The Denah picker refuses a selection whose total would exceed it, with a clear message.

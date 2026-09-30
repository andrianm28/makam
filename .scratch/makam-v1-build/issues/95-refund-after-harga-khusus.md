# Refunds of a Keluhan and a Layanan cancellation after a Harga Khusus are refused

Status: ready-for-agent
Blocked by: —
Spec: spec.md, Billing (Harga Khusus, refunds) and Layanan (Keluhan outcome, cancellation)

## What to build

After a Harga Khusus, the Tagihan's total is reduced by one negative Penyesuaian line but the tariff lines are not, so a refund of a whole line (`layanan/keluhan.ts` `mintaPengembalian`, `layanan/batal.ts`) is sent to Refunds' `ajukanBaris` and refused as `melebihi_tagihan` (`sudah + jumlah > tagihan.total`); a Keluhan then reads `pengembalian_tidak_bisa_diajukan`. Ticket 38's Pembatalan Terencana avoids it by apportioning the Penyesuaian per line before computing the refund (`floor(line × (jumlahHarga + penyesuaian) / jumlahHarga)`, `pemesanan/pembatalan-terencana.ts`). Owner decision 2026-09-30: use the same per-line proportional rule for every refund of a Harga Khusus Tagihan, in one place (Refunds or Billing), not copied per caller. The Biaya Layanan Platform line is handled by the same rule.

## Acceptance criteria

- [ ] A Keluhan whose outcome is a refund, and a Layanan cancellation refund, after a Harga Khusus refund the line's proportional share of the reduced total; the sum of all refunds of a Tagihan never exceeds what was paid.
- [ ] Ticket 38's Pembatalan uses the same shared rule (its own apportionment code is removed, its tests still pass).
- [ ] Tests in glossary terms through public functions: a Harga Khusus then a Keluhan refund, a Layanan cancellation refund, two refunds on one Tagihan, and rounding down never over-refunds.

## Comments

- 2026-09-30 — Filed at ticket 93's merge (owner decision 2026-09-30).
- 2026-09-30 — Builder, PHASE A. The per-line proportional rule now lives in Refunds (`bagianDibayar` in `refunds/aturan.ts`, exported from the barrel) and `ajukanBaris` applies it to every line it is given and to the fee line, so `layanan/keluhan.ts` and `layanan/batal.ts` (which pass whole tariff lines) are refunded their share with no change of their own. Tests: Keluhan refund, Layanan cancellation of two jobs, rounding, and the pure rule. Tests run on a local Postgres (layanan + refunds: 182 passed); typecheck and lint clean; build not run.

HANDOFF
- Files: `src/domain/refunds/{aturan.ts,index.ts,request.ts,aturan.test.ts}`, `src/domain/layanan/{keluhan,harga-khusus}.test.ts`.
- `bagianDibayar(lines: {kind, amount}[], jumlah: number): number` = `floor(jumlah × (jumlahHarga + penyesuaian) / jumlahHarga)`; `jumlahHarga` = all lines except `penyesuaian_harga_khusus` (fee line included, so the fee is scaled by the same ratio); no Penyesuaian returns `jumlah`.
- Decision: ratio is uniform across all lines; ticket 38 scales only Harga Hak Pakai lines and leaves the fee whole. Rounding also means a "penuh" request after a Harga Khusus is never `lengkap`.
- Phase B: make `pemesanan/pembatalan-terencana.ts` `hitungSekarang` (~138-146) call `bagianDibayar(tagihan.lines, barisUnit.amount)` and delete its own copy; decide the fee (scaled or whole); keep its tests green. Unverified: Pembatalan path, full suite, build. Status not flipped.

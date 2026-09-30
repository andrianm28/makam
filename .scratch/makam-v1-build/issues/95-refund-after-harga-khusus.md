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

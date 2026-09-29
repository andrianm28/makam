# Readers of an order's stored Tagihan id after a Harga Khusus reissue

Status: ready-for-agent
Blocked by: —
Spec: spec.md, Billing (Harga Khusus) and Pemesanan

## What to build

A Harga Khusus reissues a Tagihan under a new id (ticket 30), but orders keep the id they stored. Ticket 38 made the Pembatalan ask Billing for the Tagihan in force (`tagihanBerlaku`). Other readers still use the stored id: `tarikTerencana` and `lewatBatasBayarTerencana` cancel `order.tagihanId`, which after a reissue is already Dibatalkan, so a withdrawn or lapsed Terencana order leaves the live replacement payable; Saat Duka `catat-pemakaman.ts` and Billing `chasing.ts` read the stored id the same way. Found by ticket 38's builder, 2026-09-29.

## Acceptance criteria

- [ ] Every reader of an order's Tagihan for money or status uses the Tagihan in force (`tagihanBerlaku`), never a replaced one.
- [ ] A Terencana withdrawal or lapse after a Harga Khusus cancels the live replacement Tagihan.
- [ ] Tests for each path after a Harga Khusus reissue.

## Comments

- 2026-09-29 — Filed at ticket 38's merge.

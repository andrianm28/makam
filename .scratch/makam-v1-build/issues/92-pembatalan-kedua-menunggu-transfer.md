# A second Pembatalan on one Tagihan waits for the earlier refund's transfer

Status: ready-for-agent
Blocked by: —
Spec: spec.md, Pemesanan (Pembatalan) and Billing (refunds)

## What to build

Since Pembatalan is per Hak Pakai (ticket 38, owner decision 2026-09-29), two plots of one Terencana order can be cancelled on different days. Refunds joins a new refund line to an open request only while it is still Diajukan; once the earlier refund is approved and awaiting transfer, the Admin Lokasi's approval of the second Pembatalan is refused with `pengembalian_sebelumnya_menunggu_transfer` ("tunggu sampai pengembalian itu ditransfer"). Money stays right and the block clears at transfer, but the Admin Lokasi has to come back. Let the second Pembatalan be approved at once, its refund becoming its own request (or joining the next batch) without double-paying a line.

## Acceptance criteria

- [ ] A second Pembatalan on the same Tagihan can be approved while the first refund is approved and awaiting transfer.
- [ ] Each refunded line is paid exactly once; the Potongan and Pencairan effects follow each refund.
- [ ] Tests through Pemesanan and Refunds public functions.

## Comments

- 2026-09-29 — Filed at ticket 38's merge (owner decision 2026-09-29: the limit accepted for now, with its own message, and a follow-up).

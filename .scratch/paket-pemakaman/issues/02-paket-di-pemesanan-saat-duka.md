# Paket Pemakaman di Pemesanan Saat Duka

Type: task
Status: ready-for-agent
Blocked by: 01
Spec: ../spec.md (stories 1–2, 5–8; Rules 3–5)

## What to build

The Saat Duka wizard offers the Lokasi's Paket Pemakaman for a chosen Tradisi (or none); `placeSaatDuka` takes the paket, keeps its price on the order and includes it in the total and QRIS cap; the Tagihan issued at confirmation has its line; the Antrean Lokasi order shows it; Pencairan pays it with the Petak Makam; cancellation cancels it with the order.

## Acceptance criteria

- [ ] A Saat Duka order with a Paket Pemakaman gets a Tagihan with a Paket line and one Biaya Layanan Platform.
- [ ] A Paket not offered at that Lokasi (other Lokasi, withdrawn, unpriced) is refused at Kirim.
- [ ] A Tarif change after Kirim does not change the order's Paket price.
- [ ] The Lokasi's Pencairan after the Pemakaman is recorded includes the Paket amount.
- [ ] Pemesanan Terencana and TPU flows offer no Paket.

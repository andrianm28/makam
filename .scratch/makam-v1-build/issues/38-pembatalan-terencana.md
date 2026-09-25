# Pembatalan of a paid Pemesanan Terencana

Status: ready-for-agent
Blocked by: 31, 37
Spec: Domain modules > 6. Pemesanan (Requests from the Pemegang Hak: Pembatalan); 14. Work Queues (Tier 3 Pembatalan refund approval); stories 102, 107, 125 (Pembatalan)

## What to build

In Akun Saya's Makam tab, the Pemegang Hak of a Terencana Hak Pakai can "Ajukan Pembatalan", seeing the refund under the Lokasi's snapshot policy. The request becomes an Antrean Lokasi row due in 2 working days; the Admin Lokasi confirms there is no Pemakaman; the refund is computed (100% of the tariff within the Masa Pembatalan, else the set %; the Biaya Layanan Platform is never refunded) and a Tier 3 "Pembatalan refund approval" row is created for Admin Platform. The refund goes to the Pemesan who paid, to a bank account that Pemesan enters. The Hak Pakai becomes Dibatalkan and the plots become Tersedia.

## Acceptance criteria

- [ ] "Ajukan Pembatalan" is shown only for a Terencana Hak Pakai with no Pemakaman and no earlier Ganti Pemegang Hak; it shows the computed refund before submitting.
- [ ] The refund uses the Syarat snapshot on the order, not the Lokasi's current policy.
- [ ] Antrean Lokasi row due in 2 working days; the Admin Lokasi confirms no Pemakaman (or declines with a reason).
- [ ] The Pemesan who paid (who may differ from the Pemegang Hak) is asked by WhatsApp to enter a bank account; the refund request goes into ticket 31's flow; Tier 3 approval row due in 2 working days.
- [ ] If the Terencana Pencairan was already paid out, the refunded tariff becomes a Potongan.
- [ ] On completion: Hak Pakai Dibatalkan, Petak Tersedia, order Dibatalkan (Pembatalan).
- [ ] Tests: 100% inside the Masa Pembatalan, set % after; Biaya Layanan Platform never refunded; blocked after a Ganti Pemegang Hak or a Pemakaman; refund to the paying Pemesan; Potongan when already paid out.

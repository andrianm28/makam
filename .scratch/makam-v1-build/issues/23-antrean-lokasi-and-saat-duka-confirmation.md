# Antrean Lokasi and Saat Duka confirmation

Status: ready-for-agent
Blocked by: 18, 20, 21, 22
Spec: Domain modules > 6. Pemesanan (Saat Duka confirm); 14. Work Queues (Antrean Lokasi; Tier 1 Konfirmasi Lokasi terlambat); 15. Notifications (new Saat Duka alert); Data and privacy; stories 29, 30, 115, 116, 117, 120, 136, 139, 149

## What to build

The Antrean Lokasi projection (Mendesak and Lainnya groups sorted by deadline, rows that close themselves, no claims, tiers or Bertugas) with its first rows: Konfirmasi Saat Duka (Mendesak), Petak Perlu Verifikasi and failed Lokasi-message calls (Lainnya). A new Saat Duka order alerts every Admin Lokasi of the Lokasi and the Kontak Siaga by name via web push + email at any hour, and again after 1 h of Jam Operasional if still unconfirmed. The Admin Lokasi confirms by assigning a cleared Tersedia Petak of the chosen Jenis Makam, which creates the Hak Pakai (Aktif) and issues the pay-after Tagihan. The Pemesan sees the confirmation page and can upload documents later; the Admin Lokasi ticks off each document on the checklist. When the 2-service-hour deadline passes, a Tier 1 "Konfirmasi Lokasi terlambat" row appears for Admin Platform to phone the Lokasi and log the call, without being able to confirm.

## Acceptance criteria

- [ ] Confirm offers only cleared Tersedia Petak of the order's Jenis Makam at that Lokasi; on confirm the order is Dikonfirmasi, a Hak Pakai Aktif exists for the Pemegang Hak, and a pay-after Tagihan (Harga Hak Pakai + Biaya Pemakaman + Biaya Layanan Platform) is issued with its printed due date = planned burial date + the Lokasi's Saat Duka payment window (default 3×24 h).
- [ ] Konfirmasi Saat Duka row deadline = 2 hours of Jam Operasional after submission; it closes on confirm, Tolak or cancellation.
- [ ] Alerts go to every Admin Lokasi of the Lokasi plus the Kontak Siaga (named) by web push + email at any hour; a re-alert fires once when 1 h of Jam Operasional has passed unconfirmed.
- [ ] The confirmation page shows the assigned Petak Makam, the Admin Lokasi's contact, the document checklist and the payment deadline with "pemakaman tetap berjalan".
- [ ] The Pemesan can upload documents to the order at any time (FileStore); the Admin Lokasi ticks each checklist item; documents never block confirmation or burial.
- [ ] Late confirmations are counted on the Lokasi.
- [ ] Tier 1 "Konfirmasi Lokasi terlambat" row appears at the deadline and closes when the order is confirmed or declined; Admin Platform can log calls but the confirm action is denied to Admin Platform.
- [ ] Admin Lokasi see the family's name, phone number, email, Almarhum and documents only for their own Lokasi's orders.
- [ ] Failed Lokasi-work messages (confirmation, Bukti Pemesanan, Perpanjangan, Hak Pakai expiry, Lokasi Layanan) create a phone-call row in the Antrean Lokasi; the row closes when the call is logged.
- [ ] Tests: confirm effects (Hak Pakai, Tagihan due date, Petak Dipesan); deadline and re-alert timing with the fake Clock across closed hours; alert recipients; Tier 1 row lifecycle; Admin Lokasi data scoping; Petak Perlu Verifikasi row.

## Comments

- 2026-09-26 — ADR 0004: new-order alerts are Peringatan Staf by web push + email, not WhatsApp; Admin Lokasi see the family's phone and email (criteria updated). The failed Lokasi-message call row stays: a family message about Lokasi work that fails, or an order with no email, reaches the Admin Lokasi as a call row.

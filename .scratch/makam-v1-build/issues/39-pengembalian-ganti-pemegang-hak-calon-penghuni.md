# Pengembalian Hak Pakai, Ganti Pemegang Hak and Calon Penghuni

Status: ready-for-agent
Blocked by: 27, 29, 38
Spec: Domain modules > 5. Inventory (Ganti Pemegang Hak, change number, Pengembalian, Calon Penghuni); 6. Pemesanan (Requests from the Pemegang Hak); stories 103, 104, 105, 125, 126

## What to build

The other Pemegang Hak requests and holder changes. From the Makam tab: "Kembalikan Hak Pakai" for an unused plot (warned that compensation is agreed directly with the Lokasi), and "Ajukan Ganti Pemegang Hak" (new holder name + WhatsApp, jual / waris, optional documents). Both become Antrean Lokasi rows due in 2 working days. The Admin Lokasi performs Ganti Pemegang Hak with documents, keeping the holder history, and can change the Pemegang Hak's number after a KTP check. The Pemegang Hak changes the Calon Penghuni label freely; the Lokasi is notified, with no review.

## Acceptance criteria

- [ ] Both requests have statuses Diajukan → (Perlu Perbaikan ↺ Diajukan) → Disetujui | Ditolak | Dibatalkan (by the requester before a decision); Perlu Perbaikan shows in Perlu tindakan. The Antrean Lokasi row exists while Diajukan, due 2 working days on the Lokasi's Jam Operasional calendar (ticket 11).
- [ ] Pengembalian: allowed only with no Pemakaman; on completion the Hak Pakai is Berakhir (reason Pengembalian) and the Petak Tersedia; no money moves through the Operator.
- [ ] Ganti Pemegang Hak: blocked while a Pembatalan is open or a Saat Duka Tagihan on the Hak Pakai is overdue (`isBlockedByOverdueTagihan`); a sale (jual) is rejected when the Lokasi forbids sale transfers; inheritance is always allowed; the transfer fee is noted as collected offline.
- [ ] The holder history keeps every earlier Pemegang Hak with dates; the Hak Pakai moves to the new holder's Makam tab by number.
- [ ] Heirs of a deceased Pemegang Hak are pointed to the hub lookup instead of this request.
- [ ] Admin Lokasi changes the Pemegang Hak number after uploading a KTP check; audited.
- [ ] Calon Penghuni label change: immediate, no review; the Admin Lokasi gets a notification.
- [ ] Every Admin Lokasi action here is audited.
- [ ] Tests: request status transitions (Perlu Perbaikan round trip, Dibatalkan only before a decision, row only while Diajukan); blocks on Ganti Pemegang Hak; sale vs inheritance; history kept; Pengembalian ends the Hak Pakai; label change notifies without a row.

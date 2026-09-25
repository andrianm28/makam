# TPU Saat Duka confirmation and Ambil surat pengantar

Status: ready-for-agent
Blocked by: 28, 44
Spec: Domain modules > 8. Pengurusan (payment rule); 13. Field Work (Ambil surat pengantar); 14. Work Queues (Tier 1 Konfirmasi TPU Saat Duka, Tier 2 surat pengantar); 15. Notifications (night TPU alerts); stories 73, 145, 146

## What to build

Admin Platform confirms a Saat Duka TPU order from a Tier 1 "Konfirmasi TPU Saat Duka" row (2 service hours on the 06:00–18:00 clock, escalating at 30 and 90 min) after arranging the burial with the TPU, or offers another TPU. Once an Admin Platform takes the row, their name and contact show to the family. Confirming issues the pay-after Tagihan (Biaya Pengurusan burial amount + Retribusi lines), due 3×24 h after the burial, and auto-creates an "Ambil surat pengantar" Tugas Lapangan. The confirmation shows the agreed burial time, TPU address, Admin Platform and TPU staff contacts, both document lists and the price lines.

## Acceptance criteria

- [ ] The Tier 1 row alerts per ticket 28 (Bertugas, 30 min, 90 min, night rows at 06:00) and closes on confirm or cancellation.
- [ ] Ambil by an Admin Platform shows that person's name and contact on the family's order page.
- [ ] Offer another TPU: the family accepts or declines as with a Lokasi alternative.
- [ ] Confirm: status Dikonfirmasi; pay-after Tagihan issued; the Operator bears the loss if unpaid (chased per ticket 29 with no Pencairan involved).
- [ ] An "Ambil surat pengantar" Tugas Lapangan is created on confirmation; a Tier 2 row appears when it is unassigned or overdue.
- [ ] Confirmation page and message list: agreed burial time, TPU address, Admin Platform and TPU staff contacts, burial and filing document lists, price lines.
- [ ] Tests: deadline and escalation timing; Tugas auto-created once (idempotent); Tagihan kind and due; staff contact visible after Ambil.

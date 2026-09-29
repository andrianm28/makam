# Lokasi Mitra Ditangguhkan and Berhenti

Status: ready-for-agent
Blocked by: 32, 38, 54
Spec: Domain modules > 3. Lokasi (Ditangguhkan, Berhenti); 9. Layanan (Berhenti cycles); 11. Payouts (On Berhenti); 16. Scheduler (Berhenti effective dates); stories 15, 106, 152

## What to build

Admin Platform sets a Lokasi Mitra Ditangguhkan or Berhenti (with an effective date, default 30 days after the decision), audited. Ditangguhkan blocks only a new Hak Pakai (Saat Duka new plot and Terencana); burials under an existing Hak Pakai, Perpanjangan, Layanan and Paket cycles, Pembatalan, Ganti Pemegang Hak, Pengembalian Hak Pakai and orders in progress carry on. Berhenti: from the decision no further Paket cycles are issued and families are told; until the effective date the Lokasi behaves as Ditangguhkan; open Pekerjaan Layanan not finished by that date are cancelled with a full refund including the Biaya Layanan Platform; from that date no order of any kind, and Hak Pakai stay read-only in Akun Saya with the pengelola's contact and downloadable documents. Pencairan and Potongan settle as the spec says.

## Acceptance criteria

- [ ] The Lokasi page stays up with "sementara tidak menerima pesanan"; the Lokasi disappears from Pilih makam and Terencana lists.
- [ ] Every order entry point checks the status: new Hak Pakai blocked while Ditangguhkan; everything blocked from the Berhenti effective date.
- [ ] Berhenti decision: Paket cycles stop at once and Pemegang Hak / Paket subscribers are notified.
- [ ] Effective-date tick (idempotent): unfinished Pekerjaan Layanan cancelled with full refunds incl. the Biaya Layanan Platform; Hak Pakai read-only in the Makam tab with the pengelola contact and documents.
- [ ] Payouts on Berhenti: pending Pencairan for finished work paid net; Potongan become an offline request; held Terencana Pencairan released except for Pemesan inside their Masa Pembatalan who cancel, who are refunded.
- [ ] Tests: each carry-on vs blocked action under Ditangguhkan; the Berhenti timeline; refunds of leftovers; payout settlement.

## Comments

- 2026-09-29 — From ticket 40's fix pass, a defect to settle before or with this ticket: `tariffs.quote()` prices only a Lokasi Mitra that is Terverifikasi (its public visibility), but the spec says Perpanjangan (and burials under an existing Hak Pakai, Layanan, Pembatalan) carry on at a Ditangguhkan Lokasi. Today a Perpanjangan at a Lokasi that stops being listed cannot be priced, so `tawaran` and `ajukan` refuse it (`harga_tidak_tersedia`). The fix belongs with the status work here (a quote that a Lokasi's own carry-on actions may ask for regardless of the listing), and this ticket's "carry-on vs blocked" tests should include Perpanjangan.

# Mitra Jasa photo proof, approval and pay rules

Status: ready-for-agent
Blocked by: 51, 56
Spec: Domain modules > 9. Layanan (TPU Menunggu Verifikasi, Mitra Jasa pay rules); 11. Payouts (Mitra Jasa Pencairan); 14. Work Queues (Tier 2 foto bukti approval); stories 91 (Menunggu Verifikasi), 92 (TPU), 157, 179, 181

## What to build

The Mitra Jasa takes before/after photos (video for the Laporan) in the app with the browser camera; the job becomes Menunggu Verifikasi. Admin Platform approves or rejects the proof within 24 h (Tier 2 row); approval makes it Selesai, shows the proof to the Pemesan by link and opens the Keluhan window. Apply the Mitra Jasa pay rules to Pencairan items, and give the Mitra Jasa a view of their Pencairan and each Bukti Pencairan (job, Layanan, date, rate only).

## Acceptance criteria

- [ ] Proof capture is in-app camera only, timestamped; required shots per the catalog.
- [ ] Tier 2 foto bukti row, 24 h deadline; reject returns the job to Sedang Dikerjakan with a reason.
- [ ] Only approved proof is shown to the Pemesan.
- [ ] Pay rules: a redo by the same Mitra Jasa after an upheld Keluhan is unpaid and the original Pencairan is released when the redo proof is approved; a redo by another Mitra Jasa is paid at the normal rate and the original Pencairan is cancelled; Terlambat but done → full rate; cancelled for lateness → no Pencairan; reassigned → only the one who does the job is paid.
- [ ] No Potongan is ever applied to a Mitra Jasa.
- [ ] A hari-H Layanan on a TPU Saat Duka Tagihan: the Mitra Jasa's Pencairan becomes due under the normal Mitra Jasa rule (Keluhan window closed) without waiting for the family's payment; if the Tagihan is Tidak Tertagih the Mitra Jasa is still paid and the Operator bears the loss.
- [ ] Mitra Jasa Pencairan view shows only job, Layanan, date and rate.
- [ ] Tests: each pay rule; TPU hari-H Pencairan due while the Tagihan is still unpaid; approval starts the Keluhan window; Mitra Jasa view fields.

## Comments

- 2026-09-29 — **Dari tiket 51 (Keluhan).** 57 harus mengisi `pekerjaan_layanan.bukti_ditunjukkan_at` saat Admin Platform menyetujui bukti pekerjaan TPU (di transaksi persetujuannya), supaya jendela Keluhan 3×24 h milik 51 mulai; tanpa itu Keluhan dan Pencairan Layanan TPU tidak pernah bergerak. Kerja ulang oleh pelaksana lain (spek baris 442, cerita 158: Mitra Jasa lain dibayar tarif normal dan Pencairan asli dibatalkan) adalah milik 57; 51 hanya membangun jalur Lokasi, di mana pelaksananya selalu Admin Lokasi.
- 2026-10-02 — Scope added by ticket 52's review (orchestrator): (1) the TPU Pekerjaan Layanan thread closes when the TPU Keluhan window closes (the window opens at Admin Platform approval of the proof, built here); (2) the Mitra Jasa job page includes the message thread, using ticket 52's domain (`src/domain/layanan/thread.ts`), so story 180 ("message the family through the job thread") is met.

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

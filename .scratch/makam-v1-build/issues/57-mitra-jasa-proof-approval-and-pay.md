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

- 2026-10-02 — **Builder (domain slice).** Built in `src/domain/layanan/bukti-tpu.ts` (+ `bukti-tpu-baca.ts`), tested in `bukti-tpu.test.ts`: `simpanBuktiTpu` / `kirimBuktiTpu` / `buktiTpuSaya` (Mitra Jasa), `buktiTpuUntukStaf` / `setujuiBuktiTpu` / `tolakBuktiTpu` / `kerjaUlangTpu` (Admin Platform), `tutupJendelaTpu` (called by `tutupJendelaKeluhan`, so the existing 5-minute job covers TPU), Tier 2 row `bukti_tpu_verifikasi` (24 h), `pesananTpuOf` shows `bukti` only once approved. Payouts gained `batalkanItem` (reason `diganti_pelaksana`). Migration 0050 adds the TPU job's proof/approval columns and `pekerjaan_layanan_tpu_bukti`. The pay rules run at approval; the Pencairan item is written then (not by the Tagihan trigger), so a hari-H Layanan on a Saat Duka Tagihan never waits for the family's payment. The Mitra Jasa Pencairan view already existed (ticket 35) and is tested for its fields here.
  - Process note: the implementation was written before its tests (the tdd skill's red-before-green was not followed for the first pass); one mutation was run afterwards to confirm the pay-rule test goes red.
  - **Spec gaps and decisions for the owner.**
    1. The redo of a TPU job after an upheld Keluhan has no home: ticket 51 built Keluhan for Lokasi jobs only. `kerjaUlangTpu` is the minimum needed to express the pay rules (a linked redo job, handed through the normal picker; the original goes to `keluhan`). A TPU Keluhan (filing, decision, which calls `kerjaUlangTpu`) is not built.
    2. "Terlambat but done: full rate" is implemented by construction (pay does not depend on lateness) but cannot be tested: no tick yet marks a TPU job `terlambat` (spec: target + 2 days, no proof).
    3. "Cancelled for lateness: no Pencairan" holds because the item is only written at approval; tested as "a job not done pays nothing".
    4. A missing Mitra Jasa rate refuses the approval (`tarif_belum_ada`) rather than approving an unpaid job.
    5. Tidak Tertagih is not driven in a test (it needs H+30 and a logged call); the test proves the Pencairan never reads the Tagihan, 30+ days after it fell due unpaid.

- HANDOFF (ticket 57). Done: domain, migration 0050, Antrean row, tests (see above). Left: (a) Server Actions (guarded) for kirim/setujui/tolak/kerjaUlang and the Mitra Jasa pages under `src/app/staf/mitra-jasa/pekerjaan` (browser camera capture, in-app only, `takenAt` from the camera; shows `buktiTpuSaya`) and the Admin Platform approval screen at `/staf/admin-platform/pekerjaan-tpu/[id]` (`buktiTpuUntukStaf`); (b) a Pemesan notification when the proof is approved (no `notifikasi` method added); (c) TPU Keluhan and the TPU Terlambat tick (gaps 1 and 2); (d) Mitra Jasa Pencairan page if ticket 35 did not add one. Unverified: lint and the whole-tree build.

- 2026-10-02 — **Builder (slice 2).** Red then green, per behaviour, in `bukti-tpu.test.ts` (26+1 tests in the file). Built: (1) `tandaiTerlambatTpu(db, now)` in `bukti-tpu.ts`, called by the existing `terlambatTick` beside `tandaiTerlambat` (a TPU job two days past target with no proof sent becomes `terlambat`; idempotent; tests: Terlambat but done is paid the full rate, a Terlambat job never done pays nothing); (2) the Pemesan is told on approval through `deps.notifikasi.pekerjaanSelesai` (reused, with the TPU as "lokasi" and the grave's block/number as "petak"; skipped when the order has no email); (3) TPU Keluhan, `keluhan-tpu.ts` + table `keluhan_layanan_tpu` (migration 0051): `ajukanKeluhanTpu` (Pemesan, inside the 3×24 h window, job becomes `keluhan` and its Pencairan is held), `putuskanKeluhanTpu` (Admin Platform: `tolak`, or `kerjakan_ulang` with a named Mitra Jasa, which calls `kerjaUlangTpu`), `keluhanTpuTerbuka`; (4) guarded Server Actions and pages: Mitra Jasa camera and Kirim on `/staf/mitra-jasa/pekerjaan`, Admin Platform approval on `/staf/admin-platform/pekerjaan-tpu/[id]`; (5) `jendelaKeluhanTpu(pekerjaanId)` = `{ dibukaAt, berakhirAt, ditutup }`, the hook ticket 52's thread reads to go read-only.
  - **Spec gaps for the owner.** A. A refund (`dana_kembali`) is not offered for a TPU Keluhan: Refunds is built around Lokasi lines. B. "Cancelled for lateness" for a TPU job has no cancel path (no TPU cancel exists); it holds only because no item is written without an approval. C. TPU Keluhan has no Tier 1 Antrean row yet; Admin Platform finds them through `keluhanTpuTerbuka`.
  - HANDOFF (slice 2). Left, in order: (a) ticket 52's thread (not on main when built): on the TPU job, read-only when `jendelaKeluhanTpu(id).ditutup` or now > `berakhirAt`, and add the thread to the Mitra Jasa job page (story 180); (b) UI for TPU Keluhan: a Pemesan filing form on `/layanan/[nomor]` TPU items (`ajukanKeluhanTpu`) and an Admin Platform decision screen (`putuskanKeluhanTpu`, `keluhanTpuTerbuka`), plus a Tier 1 row; (c) a Playwright or manual look at the camera screens (not run here). Migration numbers 0050 and 0051 may need renumbering at merge.

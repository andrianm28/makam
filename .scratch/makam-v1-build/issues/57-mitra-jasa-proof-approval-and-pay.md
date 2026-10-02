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
- 2026-10-02 — **Two-axis review of slice 2 (branch head 58d38be), recorded before the fix pass.** Fixed point origin/main.
  - **Standards: 1 hard, 7 judgement.** HARD: `simpanBuktiTpu` (`src/app/staf/mitra-jasa/pekerjaan/bukti-actions.ts`) runs `unggahSchema.safeParse` before `guarded()`; the Zod check (file included) must sit inside `guarded()`. Judgement: `pesan()` and `buktiRefused()` duplicate the guard-reason mapping (one helper beside `guardMessage`); `bukti-tpu.ts` (556 lines) mixes upload, approve, redo, window close, projection and the Terlambat tick (split; define `tandaiTerlambatTpu` where it is exported); `kerjaUlangTpu(…, dariKeluhan = false)` flag parameter; `putuskanKeluhanTpu` claims, redoes, and reverts by hand: make it one transaction; new `AuditAction` members lack doc comments and displaced the `lepas_penugasan_tpu` comment; dense locals `asal`/`samaDenganAsal`/`dibayar`; index.ts pass-throughs (existing pattern, leave).
  - **Spec: 0 hard against the ACs.** Under-recorded: `ajukanKeluhanTpu` has no caller (no Pemesan filing form, no Admin Platform decision screen), so the Keluhan window opens but no one can file and the redo pay rule cannot be reached; no Tier 1 Antrean row for a TPU Keluhan (spec line 524, first response within 4 daytime hours); the override of the fulfiller's Pencairan amount (story 158, spec line 442) is not recorded anywhere. Recorded gaps A (no `dana_kembali` outcome for a TPU Keluhan) and B (no TPU cancel-for-lateness path) confirmed real; they are the owner's.
  - **Slice 3 (with the fix pass)**: the hard Standards item, the atomic `putuskanKeluhanTpu`, the judgement items worth taking, the TPU Keluhan filing UI + Admin Platform decision screen + Tier 1 row, ticket 52's thread on the Mitra Jasa job page once 52 is on main; record the Pencairan override under "Spec gaps and decisions for the owner".
- 2026-10-02 — **Two-axis review of the fix pass + slice 3 (head 5e623b4).** Fixed point 58d38be for Standards (delta), origin/main for Spec (whole branch).
  - **Standards: 0 hard, 8 judgement.** Slice-2 fix list 8/8 OK (Zod inside `guarded()`, `refusalMessage`, the split, `kerjaUlangDariKeluhanTpu`, one transaction for `putuskanKeluhanTpu` with a rollback test, AuditAction comments, locals, pass-throughs left). Judgement, carried to the follow-up: `JAM_MS` defined in four files and the window-end sum written three times (extract `jendelaKeluhanBerakhirAt`); `keluhanTpuMessages` re-spells the guard wording and `ajukanKeluhanPekerjaanTpu` skips `refusalMessage`; `bukti-tpu-baca.ts` gathered more reads than the split asked and its header is stale; the job-to-row mapping repeats in three reads; `keluhanOf.get(...) as KeluhanTpuPemesan` cast; `kerjaUlang`'s hand revert is now redundant inside the transaction; the test imports `tandaiTerlambatTpu` from its file rather than the module surface; `refusalMessage` hard-codes the guard reasons.
  - **Spec: 0 hard.** Filing only inside the 3×24 h window and only once; the Admin Platform decision; the Tier 1 row due 4 daytime hours after filing; the Pencairan override recorded for the owner; ticket 52's thread recorded as pending 52's merge. Judgement: gap C ("no Tier 1 row") is stale and must be withdrawn; ACs to be ticked.
  - **Decision (orchestrator):** merge with no hard findings on either axis. The ticket stays open for one follow-up slice: ticket 52's thread on the Mitra Jasa job page (story 180) once 52 is on main, together with the Standards judgement items above.

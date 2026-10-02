# Perpanjangan TPU (IPTM renewal)

Status: ready-for-agent
Blocked by: 47
Spec: Domain modules > 8. Pengurusan (Perpanjangan TPU statuses, expiry date, past-grace check, PTSP rejection); 15. Notifications (IPTM expiry reminders); 14. Work Queues (Tier 3 past-grace TPU check, filing-only check and filing); stories 79, 80, 81, 82, 83

## What to build

IPTM renewal for a Makam TPU. Reminders go to the Pemegang Hak 3 months and 1 month before the IPTM expires, offering Perpanjangan. From 3 months before expiry the Pemegang Hak requests one 3-year term, giving the IPTM expiry date (read off the IPTM photo and corrected by Admin Platform). The order runs Diajukan → (Perlu Perbaikan ↺) → Menunggu Pembayaran → Diproses → IPTM Diajukan → IPTM Terbit, plus Ditolak and Dibatalkan, pay-first after the document check. Past the masa tenggang (DKI 3 months), the Operator checks with the TPU first without charge (Tier 3 past-grace row) and closes the request as Ditolak if it won't renew. Show "IPTM baru biasanya terbit dalam 5 hari kerja setelah pembayaran".

## Acceptance criteria

- [ ] Reminders at 3 months and 1 month before the Makam TPU's IPTM expiry, 08:00–20:00, stopping once a Perpanjangan TPU is ordered.
- [ ] Request allowed from 3 months before expiry; the form captures the expiry date; Admin Platform can correct it (audited).
- [ ] Perlu Perbaikan loop before payment; pay-first Tagihan (filing-only Biaya Pengurusan) issued only after the check, due 3×24 h, lapsing to Dibatalkan.
- [ ] Past-grace request: no Tagihan until the TPU check row is resolved; "won't renew" → Ditolak with no charge.
- [ ] PTSP rejections follow ticket 47's rules (fixable → Perlu Perbaikan, no charge; final → full refund).
- [ ] IPTM Terbit updates the Makam TPU's current IPTM and history.
- [ ] Tests: reminder timing; the request window; past-grace path; pay-after-check; history update.

## Added (2026-09-25)

- [ ] ~~Optional email field on the order screen (copies of Tagihan / Bukti by email through SumoPod SMTP; SES dropped 2026-09-25), as in spec "Booking wizards".~~ (superseded: ADR 0004, as ticket 47)

### 2026-10-02 builder (ticket 48, sonnet, claude.ai/code thread)

- **Pilot thread facts** (2026-10-02): `nproc` = 4; `free -g` = 15 GB total, 11 GB free, no swap; the Skill tool loaded `tdd` (yes); Docker was up after the SessionStart hook (`docker info` OK).

- 2026-10-02 builder entry (ticket 48, sonnet, claude.ai/code thread). Built test-first (red commit, then code), one behaviour at a time. In `src/domain/pengurusan`: `placePerpanjanganTpu` (window from 3 months before the expiry the form gives; past-grace flag), the shared filing steps now serve the kind (uploads and `periksaDokumen` from Diajukan, pay-first Tagihan 3×24 h, `pembayaranBerkasTick` for both kinds), `mintaPerbaikan` (Perlu Perbaikan before payment, no Tagihan), `putuskanCekTpu` + Tier 3 row `cek_tpu_lewat_masa_tenggang` (Ditolak with no charge), `koreksiIptmBerakhir` (audited), `tolakPtsp` for the kind (fixable no charge; final full refund), IPTM Terbit updates the Makam TPU (pinned by a test), Surat Kuasa from Diajukan, `pengingatIptmTick` + Notifications `pengingatIptmBerakhir` (template `iptm_berakhir_pengingat`), tick `pengurusan.pengingat_iptm` (Rilis 3, `tpu`). Screens: `/pesan-makam/perpanjang-iptm/[makamTpuId]` (+ action), Pemesan order page, staff forms, Perpanjang IPTM link on the Makam tab. Migration 0060 is expand-only (two nullable columns, one boolean with default).
- Gate list (all `tpu`, Rilis 3): page `/pesan-makam/perpanjang-iptm/**`; action `pesanPerpanjanganTpuAction`; staff actions `putuskanCekTpuAction`, `mintaPerbaikanAction`, `koreksiIptmBerakhirAction`; tick `pengurusan.pengingat_iptm`; Antrean row `cek_tpu_lewat_masa_tenggang`.
- Verification: `npm run lint` 0 errors (5 old warnings), `npm run typecheck` clean, full `npm test` read off a whole log: Test Files 332 passed (332), Tests 2977 passed | 1 skipped (2978), exit 0. Not exercised in a browser; no e2e.

### Spec gaps and decisions for the owner

- **Optional email field** (Added 2026-09-25) not built: the order uses the signed-in Akun's email (ADR 0004), as ticket 47 decided.
- **Filing document list** for a renewal is not in the spec; I used the Pemegang Hak's half of the filing set (scan of the IPTM, Surat Kuasa bermaterai, KTP, KK). Confirm.
- **Past-grace check row** has no deadline in the spec; I used 1 working day from the request. Admin Platform may also correct the expiry only until a Tagihan exists; the correction re-reads past-grace as of the order day.
- **No Ambil surat pengantar Tugas** for a renewal (story 146 names only Saat Duka TPU and Pengurusan IPTM).
- **Order record**: a renewal is stored as a `tumpang`-type row on the grave's blok with the first Almarhum, since the table's columns are NOT NULL; "Diproses" added to the status words (not in CONTEXT.md).
- Reminders go to the Pemegang Hak's email, else the Akun's; none known → nothing sent (no Telepon Pemesan row). A new order after a Ditolak/Dibatalkan one resumes reminders; no guard against two open renewals of one Makam TPU.

HANDOFF: domain complete and green; remaining: owner confirmation of the items above, optional e2e smoke, browser check of the new screens.

### 2026-10-02 Fix pass (builder, sonnet, claude.ai/code thread)

Test-first; `test(red)` commits before code. Items → commit: 1 double charge (`sudah_dipesan`, partial unique index in migration 0061, race test, Bahasa Indonesia refusal on the order screen) → red e7b172c, code e75a38d, screen text 8827b19; 2 past-grace bypass (earlier of typed and recorded expiry, snapshot column `iptm_tercatat_berakhir_pada`, both dates on the Admin Platform page and its TPU check row and on the Pemesan order page; `koreksiIptmBerakhir` uses the same rule) → e75a38d, 8827b19; 3 glossary (Perpanjangan TPU, Diproses, Cek TPU lewat masa tenggang) → 8827b19; 4 "PTSP meminta perbaikan" kept for Pengurusan IPTM, new wording only for Perpanjangan TPU → red 32e9178, 8827b19; 5 same-`now` reminder tick sends one message: Notifications' dedup on `kunci` already did it, test added, no fix needed → e7b172c; 6 burial-type line hidden for the kind on the Admin Platform page; the Pemesan page already returns early for the kind and no screen renders `kelayakan`, so nothing more to hide → 8827b19; 7 `tanggalWafat` fallback commented, email item struck, tick returns `dilewati` → e75a38d, 8827b19. Owner questions untouched. One existing test (expiry correction) now records the Makam TPU's expiry as 2027-05-30, since the earlier date rules.

Verification: `npm run lint` 0 errors, `npm run typecheck` clean, full `npm test` read off a whole log: Test Files 332 passed (332), Tests 2983 passed | 1 skipped (2984), exit 0.

HANDOFF: fix pass complete; remaining: owner answers (tumpang row, filing document list, 1-working-day check, Telepon Pemesan for reminders), browser check of the new screens.

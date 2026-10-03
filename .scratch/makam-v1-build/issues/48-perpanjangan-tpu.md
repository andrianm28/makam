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

## Added (2026-10-03, owner decisions after the merge)

- [ ] **Q1, fix now:** a Perpanjangan TPU no longer stores burial data it does not own. In an expand-only migration the burial columns of the Pengurusan order (`almarhum_name`, `tanggal_wafat`, `jenis_penguburan`, `kelayakan`) become nullable; a Perpanjangan TPU stores none of them (no copied Almarhum, no faked `kelayakan`, no `tumpang`), the other two kinds still require them (domain rule, tested), and every reader and screen handles their absence. Run the migration checker; a DROP NOT NULL needs no contract line, anything else destructive does.
- [ ] **Q4, Telepon Pemesan:** when an IPTM reminder (3 months or 1 month before expiry) finds no email for the Pemegang Hak nor the Akun, it opens a Telepon Pemesan row for that Makam TPU (one open row per subject, as CONTEXT.md defines it) instead of only counting it as skipped; the row is not opened twice for the same reminder, and none once a Perpanjangan TPU is ordered.
- Q2 confirmed: the filing documents are the IPTM scan, Surat Kuasa bermaterai, KTP and KK. Q3 confirmed: the past-grace TPU check row is due 1 working day after the request.
- Tests: a Perpanjangan TPU stores no Almarhum or burial type and the other kinds still refuse without them; the no-email reminder opens one Telepon Pemesan row.

## Comments

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

### Two-axis review (2026-10-02, reviewer thread)

Fixed point `f96b6f2c` (merge-base with `origin/main`), head `6670c10`; diff 47 files, 28 commits. Two sonnet sub-agents (Standards, Spec); the reviewer thread checked the TDD order and the spec gaps itself. Nothing was run. The Standards agent skimmed `perpanjangan-tpu.ts` and `pengurusan-berkas.ts` and did not read the 367-line domain test, so that axis is lightly covered.

#### TDD order (git)

Each domain behaviour has its `test(red)` commit before its code: window (9322cae→60fe445), pay-first Tagihan (e964051→f0cd54b), Perlu Perbaikan (2b168c4→ea6ece8), lapse and Diproses (01816b0→b5e1a49), past-grace (6da2c3e→7a2d72b), PTSP rejections (de866ad→ffa7d2a), expiry correction (c74d6b5→8006b2a), reminders (d89a88a→7170039), tick gate (d0b7005→bfbea61), Antrean row (4750794→f4d5296), Surat Kuasa (602e5c0→1246d28). Commits without a red test:
- nit: `ffa7d2a` pins "IPTM Terbit updates the Makam TPU" with a test that was already green (the red `de866ad` covered it; the builder says so in the message). Fine.
- should-fix: the three UI commits (`6f3e004` Admin Platform screens, `ba9759e` order screen/action/Pemesan page/status words, `2dd0013` Makam tab link) have no test, and the builder entry says "no e2e", "not exercised in a browser". The two new Admin Platform actions and `pesanPerpanjanganTpuAction` have no action-level test. AGENTS.md puts the rule in the domain, so this is acceptable, but a browser check or a short e2e is owed before release (the builder's own HANDOFF lists it).
- `a65b7f7`, `6670c10` are ticket-text commits.

#### Standards

No hard violation found.
- Migration 0060 is expand-only (two nullable columns, one boolean NOT NULL with DEFAULT), so no `-- contract:` line is needed.
- Pengurusan reads/writes only `pengurusan_tpu` and `makam_tpu`; the Akun comes through `identity`, the message through Notifications, payment through billing.
- The three Admin Platform actions and `pesanPerpanjanganTpuAction` are thin: `guarded()` with `fitur: "tpu"`, Zod from the domain schemas.
- No `new Date()` / `Date.now()` added under `src/domain`; `pengingatIptmTick` takes `now`.
- Client import rule met: `perpanjangan-forms.tsx` ("use client") imports no domain barrel; the barrel imports in the Pemesan pages are type-only in server components.
- The route, the tick `pengurusan.pengingat_iptm` and the Antrean row are in `rilis-peta.ts` / `petaTick` as `tpu`, Rilis 3.

Findings (0 blocking, 2 should-fix, 3 nit):
1. **should-fix**, `CONTEXT.md`: "Diproses" (a paid filing order waiting to be filed), "Perpanjangan TPU" and the TPU check are not defined there. The status words come from the spec (line ~418), so only the glossary is missing. Fix: add the entries with `_Avoid_` lines.
2. **should-fix (verify)**, `src/lib/perlu-tindakan.ts:142`: the Perbaikan message now reads "Perbaikan diminta: …" where it used to read "PTSP meminta perbaikan …" for the ticket-47 kind too. A grep of `src`, `tests` and `e2e` finds no remaining use of the old text, so nothing breaks today. `dueAt` widened to `Date | null` at line 129 encodes "no deadline" as null. Fix: keep the old wording for the IPTM-filing kind, or state the change in the ticket.
3. **nit**, `perpanjangan-actions.ts:21-72`: the `guarded` + `guardMessage` + revalidate shape is repeated in three actions. Extract a helper only if a fourth appears.
4. **nit**, `pengingat-iptm.ts:48-56`: one "already ordered" query and one account lookup per candidate (N+1). Fine at pilot scale; a `NOT EXISTS` subquery is cleaner.
5. **nit**, `pengingat-iptm.ts`: idempotency rests on Notifications deduping by `kunci` (`${berlakuSampai}:${sisaBulan}`). The Standards agent could not confirm that dedup. Fix: read Notifications' dedup, and if absent add a test that two ticks send once.

#### Spec

No ticket AC is missing. Checked: reminders at 3 and 1 month inside 08:00–20:00, stopping while a renewal is open; the window refusal `terlalu_awal` (`perpanjangan-tpu.ts:49`); the audited expiry correction; Perlu Perbaikan before any Tagihan; the pay-first Tagihan (filing-only Biaya Pengurusan, 3×24 h, lapsing to Dibatalkan); the past-grace path with no Tagihan until the TPU check and Ditolak with no charge; PTSP rejection per ticket 47; IPTM Terbit updating the Makam TPU and its history; the "5 hari kerja" text. All five test areas the ticket names exist. No scope creep.

Findings (0 blocking, 2 should-fix, 1 nit):
1. **should-fix**, `perpanjangan-tpu.ts:49-50`: `lewatMasaTenggang` is computed from the date the Pemesan types (`input.berlakuSampai`) and never compared with the Makam TPU's recorded `iptmBerlakuSampai`. Spec 8: past the masa tenggang the TPU is asked first. A Pemesan can type a later date and skip the check; the correction is Admin Platform's, only before a Tagihan exists, and nothing prompts it. Fix: derive the flag from the earlier of the typed and recorded dates, or show both dates on the check row and screens, with a test.
2. **should-fix**, `perpanjangan-tpu.ts:~48` (insert at :64): nothing stops two open renewals of one Makam TPU. Reminders stop on any open order, but a second order can be placed and paid, so the Pemegang Hak can be charged twice. Fix: refuse in `placePerpanjanganTpu` (new reason `sudah_dipesan`) while a `perpanjangan_tpu` row for that `makamTpuId` is not Ditolak, Dibatalkan or IPTM Terbit; back it with a partial unique index in an expand-only migration 0061, with a test.
3. **nit**, `perpanjangan-tpu.ts:~74`: `tanggalWafat: almarhum.tanggalWafat || hariIni` invents a date. Comment it, or make the column nullable later.

Builder spec gaps, judged:
- **Optional email field (Added 2026-09-25): accept.** Spec removed it on 2026-09-26 (ADR 0004); ticket 47 decided the same. Fix: strike the Added item in this ticket with that reference.
- **Renewal stored as a `tumpang` row with the first Almarhum: needs owner decision, leaning accept for v1.** It works and the tests show no extra Almarhum is added (Terbit dedupes by name and blok). But it misreports the order: `pengurusan/[nomor]/page.tsx:237` and the Admin Platform page `:103` render "Tumpang, di makam yang sudah ada isinya", and `kelayakan` is faked as true. Fix now: hide the burial-type line for `kind = perpanjangan_tpu`. Fix later: make the columns nullable in a contract release.
- **"Diproses" outside CONTEXT.md: accept.** The word is in the spec's status list (line ~418) and ticket 47's review accepted it. Only the glossary entry is missing (Standards 1).
- **No guard against two open renewals: reject** as a gap (Spec 2). It is a double charge, not an edge case.
- **Filing document list (IPTM scan, Surat Kuasa bermaterai, KTP, KK): needs owner decision.** Not in the spec; confirm against the PTSP's real list.
- **Past-grace row deadline of 1 working day: accept, owner to confirm.** It matches the other Tier 3 check rows.
- **No Ambil surat pengantar Tugas: accept** (story 146 names only Saat Duka TPU and Pengurusan IPTM).
- **Reminder recipient (Pemegang Hak email, else Akun's, else nothing): accept.** nit: return a `dilewati` count from the tick; whether a Telepon Pemesan row should exist for them is the owner's call.

#### Summary

- Standards: 5 findings (0 blocking, 2 should-fix, 3 nit). Worst: the Diproses, Perpanjangan TPU and TPU check terms are missing from CONTEXT.md.
- Spec: 3 findings (0 blocking, 2 should-fix, 1 nit). Worst: two open renewals of one Makam TPU can both be paid, and the typed expiry date can bypass the past-grace TPU check.
- TDD: every domain behaviour has its red commit first; only the UI commits and the pin commit have none.
- Not blocking merge, but both Spec should-fix items need a fix pass before release.

### Re-review (2026-10-02, reviewer thread, haiku)

`npx vitest run src/domain/pengurusan`: Test Files 10 passed (10), Tests 80 passed (80), exit 0.

Per-item verdict: (1) BLOCKING double charge — NOT FIXED. No check for `sudah_dipesan` refusal; no partial unique index in migration 0061. (2) BLOCKING past-grace bypass — NOT FIXED. No column `iptm_tercatat_berakhir_pada`; past-grace from typed expiry only. (3) CONTEXT.md glossary — NOT FIXED. No entries added. (4) PTSP meminta perbaikan — FIXED. Wording kept via `perbaikan` field. (5) Reminder dedup test — PARTLY FIXED. Logic exists, explicit test missing. (6) Burial type hidden — PARTLY FIXED. Pemesan yes, Admin Platform no (line 103 shows unconditionally). (7) tanggalWafat comment/email/dilewati — PARTLY FIXED. Only email struck (ADR 0004); no comment on tanggalWafat; returns diumumkan not dilewati.

Head: 6670c10 (before fix pass). Review entry: both Spec should-fix items from the review (double charge, past-grace bypass) remain unfixed.

- 2026-10-02 — **Correction to the haiku re-review above (orchestrator).** It reviewed head 6670c10 (before the fix pass), not 192bc25, so its "NOT FIXED" verdicts are void. Checked at 192bc25: (1) `sudah_dipesan` refusal (`perpanjangan-tpu.ts:115`, unique-violation fallback `:166`), partial unique index `pengurusan_tpu_perpanjangan_terbuka_idx` on open statuses in migration 0061 (expand-only), tests "is refused while one is open…" and "lets only one of two simultaneous orders through"; (2) `iptm_tercatat_berakhir_pada` (nullable) and the earlier-date rule, test "cannot skip the TPU check by typing a later expiry date…"; (3) CONTEXT.md entries Perpanjangan TPU, Diproses, Cek TPU lewat masa tenggang; (4) "PTSP meminta perbaikan" kept for Pengurusan IPTM (`perlu-tindakan.test.ts:105`); (5) test "send one message when the tick runs twice at the same moment"; (6) burial-type line hidden for `perpanjangan_tpu`; (7) nits done. All fixed; red commits precede code. Pilot finding: a reviewer thread must refuse to work when `git rev-parse HEAD` differs from the head named in its brief.
- 2026-10-02 — Merged to main by the orchestrator. Two-axis review: 2 should-fix (spec) raised to blocking (double charge, past-grace bypass) and fixed, 2 should-fix (standards) fixed, re-reviewed item by item (hard remaining no). Merge gate on the merged tree (migrations 0060–0061, no renumbering needed, clean db:generate): typecheck, lint (0 errors), build, full suite 332 files / 2983 tests passed (1 skipped), exit 0.
- Open for the owner (not blocking): Q1 renewal stored as a `tumpang`-type order row (accept for v1; nullable columns in a later contract release?); Q2 the filing document list (IPTM scan, Surat Kuasa bermaterai, KTP, KK) against the PTSP's real list; Q3 the past-grace TPU check deadline of 1 working day; Q4 no Telepon Pemesan row when a reminder has no email. Also: the glossary entry "Perpanjangan Makam" still says "or a TPU permit", overlapping "Perpanjangan TPU". Browser check of the new screens owed.
- 2026-10-02 — Main CI 359 red on the destructive-DDL check only (the partial UNIQUE index in 0061 lacked a `-- contract:` line); fixed in d3135c0 with the reason (no release before 48 writes a `perpanjangan_tpu` order, as 0023); main CI 360 green including E2E and signing.
- 2026-10-03 — Owner decisions (grilling, options tool): Q1 fix now (burial columns nullable, not stored for a Perpanjangan TPU); Q2 document list confirmed; Q3 1 working day confirmed; Q4 Telepon Pemesan row when a reminder has no email; glossary: Perpanjangan Makam is the Lokasi Mitra Hak Pakai only (CONTEXT.md updated). Ticket reopened as ready-for-agent for the two Added items.

### 2026-10-03 builder (ticket 48 Added, sonnet, claude.ai/code thread)

Test-first (`test(red)` commit, then code). **Q1:** migration 0062 (expand-only: four `DROP NOT NULL` on `almarhum_name`, `tanggal_wafat`, `jenis_penguburan`, `kelayakan`, plus a nullable `kunci` column on the Telepon Pemesan table; checker: no unmarked destructive DDL). `placePerpanjanganTpu` stores none of the burial data and no `kuburan` either. `placeSaatDukaTpu`/`placePengurusanIptm` now refuse with `input_tidak_valid` when the date of death, burial type or eligibility is missing (Almarhum name was already `almarhum_kosong`), tested for both kinds. Readers: order read model returns `almarhum`/`jenisPenguburan`/`kelayakan` as null and a new `makamBlokNomor` for the kind; Surat Kuasa and IPTM Terbit take the Blok from the Makam TPU and add no Almarhum to it; the four Tier 3 Antrean rows and the IPTM Terbit email work without an Almarhum; the Pemesan order page, Akun Pesanan list, Admin Platform page and Surat Kuasa document hide the Almarhum and burial lines (Blok field no longer asked at IPTM Terbit for a renewal). **Q4:** `pengingatIptmBerakhir` with no email opens a Telepon Pemesan row (subject kind `makam_tpu`, reason `tanpa_email`, no Lokasi, so it shows in Admin Platform's Antrean Tier 2 row, which now lists that subject kind); the row carries the reminder key, so a closed row is not reopened for the same reminder, while the 1-month reminder is a reminder of its own; none once a Perpanjangan TPU is ordered; outside 08:00-20:00 nothing. Tick stays idempotent.

Verification: lint 0 errors (old warnings only), typecheck clean, migration checker clean, full `npm test` read off a whole log: Test Files 332 passed (332), Tests 2994 passed | 1 skipped (2995), exit 0. Not exercised in a browser.

### Spec gaps and decisions for the owner (2026-10-03)

- The existing Perpanjangan TPU rows keep their old copied Almarhum/`tumpang`/`kelayakan` values (no data migration, expand-only); only new orders store none.
- IPTM Terbit email for a renewal has no Almarhum, so its subject reads "IPTM terbit: makam di <TPU>".
- The Telepon Pemesan row for a Makam TPU has no page of its own to open (it links to the Antrean), like other non-Tagihan subjects.

HANDOFF: both items done and green; remaining: browser check of the renewal pages without Almarhum, owner to tick the two Added items.

# Wakaf Tanah: Pengajuan Wakaf, review and tracking

Status: ready-for-agent
Blocked by: 17, 27
Spec: Domain modules > 12. Wakaf; 13. Field Work (Survei Wakaf); 14. Work Queues (Tier 3 Pengajuan Wakaf); Public site > Content pages (Wakaf Tanah); Data and privacy; stories 108, 109, 110, 111, 112, 113, 114, 166

## What to build

The Wakaf module end to end. The Wakaf Tanah page explains the process in plain words, says the land goes directly to a Nazhir and the platform takes no land or money, and holds the one-page Pengajuan Wakaf form (Tujuan sosial / keluarga + family name, Wakif name / phone number / relationship to the land, land kab/kota, address, pin, approx. m², proof-of-ownership type, Nazhir from the list or free text), with optional documents addable later, and the email Kode Masuk at submission (as ticket 22). Outside Jabodetabek it is flagged Dirujuk with a pointer to the local KUA/BWI. Admin Platform reviews from a Tier 3 row (first contact in 3 working days; no alert), matches a Nazhir from the list, schedules a Survei Wakaf Tugas Lapangan, moves the manual statuses and writes notes to the Wakif separately from internal notes and the survey report. The Wakif follows it in an Akun Saya Wakaf tab.

## Acceptance criteria

- [ ] Statuses: Diajukan → Ditinjau → Survei Dijadwalkan (date) → Menunggu Ikrar (KUA date) → Proses Sertipikat → Selesai (AIW / certificate scan), plus Ditolak (reason), Dirujuk and Dibatalkan.
- [ ] Automatic Dirujuk when the kab/kota is outside Jabodetabek, with the KUA/BWI pointer shown.
- [ ] The Wakif can cancel until Menunggu Ikrar.
- [ ] Each status change is sent to the Wakif by email; a new Pengajuan sends no staff alert and appears as a Tier 3 row.
- [ ] Wakaf tab: status timeline, dates, notes to the Wakif, the Wakif's uploads and the final AIW / certificate scan.
- [ ] Internal notes and the Survei Wakaf report are hidden from the Wakif; Admin Lokasi never see Pengajuan Wakaf.
- [ ] Nazhir list CRUD by Admin Platform in the dashboard (name, type, kab/kota, contact, BWI number), not seeded; Nazhir have no login.
- [ ] No money of any kind: no Tagihan can be attached to a Pengajuan Wakaf.
- [ ] Tests: status transitions and the cancel limit; Dirujuk rule; visibility of notes and reports by role.

## Comments

- 2026-09-26 — ADR 0004: the Wakif gives a phone number (contact), submits with the email Kode Masuk and gets status changes by email (updated above).
- 2026-10-02 — Two-axis review (code-review skill, fixed point origin/main c621b71, branch at b9ba688). Standards: 0 hard; process — the history shows no test before its code (tests and code in the same commits), as the builder said; judgement — `pesanDomain` map declared in three action files, the upload shape `{ kunci: "lainnya", … }` repeated with a magic literal, `draftSchema` and `DraftWakaf` mirrored by hand, `keInput`/`angka` mapping in the action (move to `skema.ts`), the detail path built three times. Spec: status machine, Dirujuk, cancel window, one email per change and visibility correct; **scope creep — the Wakaf Tanah tile and menu now link to `/wakaf-tanah`, against spec line 656 ("Until their release … show 'Segera hadir'"); this came from the orchestrator's brief, not the builder**; pin is optional typed lat/lng (spec says "pin"); a Wakif's cancel reason is stored as a `wakif` note and shows as a note to the Wakif; no staff detail route for the survey Tugas (follow-up for Field Work). Owner questions: is the pin required; does Kepulauan Seribu count as Jabodetabek; may Wakaf Tanah open before Rilis 3. Fix pass: restore "Segera hadir" on tile and menu (keep the page unlinked), one shared `pesanDomain` map, a `Berkas` helper, one detail-path helper, a separate note kind for the Wakif's cancel reason.
- 2026-10-02 — Owner decision 2026-10-02 ("ya setuju semua" to the orchestrator's list of open questions; small concrete choices put to the owner directly, recorded here as settled): **keep the current behaviour** — the pin stays optional (typed lat/lng), and Kepulauan Seribu counts as Jabodetabek. Wakaf Tanah stays "Segera hadir" until its release (spec line 656).

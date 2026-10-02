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

- 2026-10-02 — builder (slice 1: domain, Notifications, Antrean, composition; no UI yet).
  Built: `src/domain/wakaf/` (schema, skema, ajukan, tinjau, wakif, catatan, nazhir, berkas, riwayat), migration 0050 (wakaf_nazhir, wakaf_pengajuan, wakaf_riwayat, wakaf_catatan), action `wakaf.kelola` (Admin Platform only), six audit actions, Notifications `wakafStatusBerubah` (template `wakaf_status`, transactional, one email per status change), Tier 3 row `pengajuan_wakaf` (no alert), runtime and test-runtime wiring. Tests: nazhir, pengajuan (Dirujuk rule), tinjau (transitions, roles), wakif (cancel limit, hidden notes, uploads), tier3-wakaf-row. Status Dirujuk is also a manual move from Diajukan, Ditinjau, Survei Dijadwalkan.
  Decisions: the Wakif is `{accountId, email}` from the session (Kirim's Kode Masuk step makes the Akun, as in Perpanjangan); `QueuesModuleDeps.wakaf` is optional so fixtures without Wakaf have no row; the Survei Wakaf report stays in Field Work's Tugas (`tugasSurveiId`), never read by a Wakif function; "no Tagihan" holds structurally (the module takes no Billing).
  Spec gaps for the owner: the Jabodetabek list (DKI, Bogor, Depok, Tangerang, Tangerang Selatan, Bekasi, Kota and Kabupaten) is my reading of "Jabodetabek"; the ticket does not say if Kepulauan Seribu counts (I included it).

  HANDOFF: left for the next agent: (1) UI. Staff: `/staf/admin-platform/wakaf` list + `/[id]` detail (status moves, notes to Wakif vs internal, Nazhir match, survey Tugas link, document links) + Nazhir CRUD page, nav item in `src/lib/staff-navigation.ts`, `guarded()` actions calling `wakaf.*`. Public: Wakaf Tanah page (process, "no land or money" line, one-page form with `ajukanWakaf`, Kode Masuk step as in ticket 22, Dirujuk pointer `PETUNJUK_DIRUJUK`), replace "Segera hadir" in `public-navigation.ts`/homepage only if the owner lifts the Rilis 3 gate. Akun Saya Wakaf tab (`akun/layout.tsx`) from `pengajuanSaya`, cancel, `tambahBerkasWakaf`, `berkasUrl`. (2) Migration number may collide at merge. Unverified: no build run, no UI.
- 2026-10-02 builder (slice 2, UI): built the staff pages (`/staf/admin-platform/wakaf` list, `/[id]` detail with status move, Nazhir match, notes to Wakif vs internal, document links, `/nazhir` CRUD, nav item), the public `/wakaf-tanah` page with the one-page form and Kode Masuk step (nav and homepage tile now link to it; their tests updated), and Akun Saya `/akun/wakaf` (timeline, notes to Wakif, documents, add document, cancel, signed-URL routes). Thin `guarded()` actions with action-level tests. Decisions: no file upload on the public form (documents are optional at filing; the Wakif adds them in the Wakaf tab); client files take no domain imports at all, the actions validate. Gaps for the owner: the survey Tugas has no staff detail route, so the detail page links to the Tugas Lapangan list; the Rilis 3 gate on "Segera hadir" was lifted as the brief asked.
  HANDOFF: all slice-2 UI built and green (own tests, lint, typecheck, build). Left: no Playwright smoke; no pin picker on the form (lat/lng typed); Kepulauan Seribu question still open; migration 0050 number may collide at merge.

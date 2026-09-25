# Wakaf Tanah: Pengajuan Wakaf, review and tracking

Status: ready-for-agent
Blocked by: 17, 27
Spec: Domain modules > 12. Wakaf; 13. Field Work (Survei Wakaf); 14. Work Queues (Tier 3 Pengajuan Wakaf); Public site > Content pages (Wakaf Tanah); Data and privacy; stories 108, 109, 110, 111, 112, 113, 114, 166

## What to build

The Wakaf module end to end. The Wakaf Tanah page explains the process in plain words, says the land goes directly to a Nazhir and the platform takes no land or money, and holds the one-page Pengajuan Wakaf form (Tujuan sosial / keluarga + family name, Wakif name / WhatsApp / relationship to the land, land kab/kota, address, pin, approx. m², proof-of-ownership type, Nazhir from the list or free text), with optional documents addable later, and OTP at submission. Outside Jabodetabek it is flagged Dirujuk with a pointer to the local KUA/BWI. Admin Platform reviews from a Tier 3 row (first contact in 3 working days; no alert), matches a Nazhir from the list, schedules a Survei Wakaf Tugas Lapangan, moves the manual statuses and writes notes to the Wakif separately from internal notes and the survey report. The Wakif follows it in an Akun Saya Wakaf tab.

## Acceptance criteria

- [ ] Statuses: Diajukan → Ditinjau → Survei Dijadwalkan (date) → Menunggu Ikrar (KUA date) → Proses Sertipikat → Selesai (AIW / certificate scan), plus Ditolak (reason), Dirujuk and Dibatalkan.
- [ ] Automatic Dirujuk when the kab/kota is outside Jabodetabek, with the KUA/BWI pointer shown.
- [ ] The Wakif can cancel until Menunggu Ikrar.
- [ ] Each status change is sent to the Wakif by WhatsApp; a new Pengajuan sends no staff alert and appears as a Tier 3 row.
- [ ] Wakaf tab: status timeline, dates, notes to the Wakif, the Wakif's uploads and the final AIW / certificate scan.
- [ ] Internal notes and the Survei Wakaf report are hidden from the Wakif; Admin Lokasi never see Pengajuan Wakaf.
- [ ] Nazhir list CRUD by Admin Platform in the dashboard (name, type, kab/kota, contact, BWI number), not seeded; Nazhir have no login.
- [ ] No money of any kind: no Tagihan can be attached to a Pengajuan Wakaf.
- [ ] Tests: status transitions and the cancel limit; Dirujuk rule; visibility of notes and reports by role.

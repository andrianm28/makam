# Tugas Lapangan, Kunjungan Verifikasi and Cek Denah

Status: ready-for-agent
Blocked by: 13
Spec: Domain modules > 13. Field Work; Data and privacy; stories 12 (visit photos), 153, 173, 174, 175

## What to build

The Field Work module: Admin Platform creates and assigns a Tugas Lapangan (subject, address + pin, planned date, one Petugas Lapangan, a type-specific form with required uploads). Petugas Lapangan get a mobile "Tugas saya" list and can mark a task Selesai only once its required uploads are in. Implement the types Kunjungan Verifikasi (confirms address, pin, facilities, photos) and Cek Denah (spot-check of the Denah); leave hooks for Ambil surat pengantar, Berkas IPTM and Survei Wakaf (tickets 45, 46, 58).

## Acceptance criteria

- [ ] Admin Platform can create any Tugas Lapangan type and assign it to one Petugas Lapangan; the Petugas gets a Peringatan Staf by web push and email (through the WebPush and EmailSender fakes) for each assignment.
- [ ] "Tugas saya" shows address, pin (Leaflet), planned date and the type-specific form, and works on a phone.
- [ ] Selesai is rejected while any required upload is missing.
- [ ] A completed Kunjungan Verifikasi updates the Lokasi's pin, visit photos, facilities checklist and "dikunjungi" date.
- [ ] A completed Cek Denah is recorded on the Lokasi as the input to the Terencana switch (ticket 16).
- [ ] A Petugas Lapangan sees only the documents of cases assigned to them; no audit log.
- [ ] Admin Platform can order a Lokasi revisit ad hoc with a "Minta kunjungan ulang" button on the Lokasi Mitra, which creates a Kunjungan Verifikasi Tugas Lapangan (and the Tier 4 rows of ticket 17); there is no automatic revisit schedule in v1.
- [ ] Tests: Selesai gated on uploads per type; Kunjungan Verifikasi updates the Lokasi; Petugas visibility limited to assigned cases.

## Comments

- 2026-09-26 — ADR 0004: assignment alerts are Peringatan Staf by web push + email, not WhatsApp (criterion updated).
- 2026-09-26 — User decision: at a Kunjungan Verifikasi the Petugas Lapangan confirms the Lokasi's pin at its gate (it feeds the public map and "Petunjuk arah").
- 2026-09-26 — Builder (branch `ticket-15-tugas-lapangan`, head `aef5e9f`): built the fieldwork domain module (owns `fieldwork_tugas`), typed Kunjungan Verifikasi and Cek Denah fully with typed hooks (schema enum, generic form/upload) for Ambil surat pengantar, Berkas IPTM and Survei Wakaf; wired `lokasi.recordKunjunganVerifikasi` / `recordCekDenah` (new `lokasi_mitra` columns `visit_photos`, `dikunjungi_on`, `cek_denah_at`, `cek_denah_note`) and the publish gate's `kunjungan_verifikasi` item; Admin Platform "Tugas Lapangan" page (create + list) and "Minta kunjungan ulang" on the Lokasi Mitra Ringkasan page; Petugas Lapangan "Tugas saya" (list + detail with Leaflet pin, type-specific form, uploads, Selesai). Hand-written migration `drizzle/0014_fieldwork_tugas_lapangan.sql` (expand-only: 4 nullable `lokasi_mitra` columns + new `fieldwork_tugas` table) — ticket 14 may also claim 0014 in parallel; orchestrator renumbers at merge. New domain tests in `src/domain/fieldwork/fieldwork.test.ts` cover every acceptance criterion's test line. CI as of this push: lint, typecheck, the destructive-DDL check and the migration-upgrade step are green; the Vitest run itself did not report back within this session's wait (repeated polls of the GitHub Actions API returned the same in-progress/404-logs snapshot for a long stretch) — the immediately prior push's full suite (same tests, pre-nav-fix) passed with only the two now-fixed staff-navigation/staff-shell assertions failing, so the fieldwork tests themselves were green there. **Please re-check CI on `aef5e9f` (or re-run it) before marking this ready-for-human/merging** — I could not get a confirmed green Vitest run in this session to tick the boxes below myself.

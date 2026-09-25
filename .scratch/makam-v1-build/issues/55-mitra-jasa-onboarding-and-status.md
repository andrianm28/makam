# Mitra Jasa onboarding, availability, status and scorecard

Status: ready-for-agent
Blocked by: 43, 49
Spec: Domain modules > 9. Layanan (Mitra Jasa profile, suspension/ending); 14. Work Queues (Tier 4 Mitra Jasa onboarding, monthly scorecard review); stories 155, 159, 177, 182

## What to build

Admin Platform onboards a Mitra Jasa: KTP, NIK, photo, home area, bank account (name must match the KTP or carry an override note), signed arrangement scan, optional emergency contact (no NPWP), and coverage lists (DKI TPUs, Layanan). The Mitra Jasa is invited by WhatsApp number and required email (ticket 09), logs in with OTP, sets Tidak tersedia date ranges and sees their history and payments. Status Aktif / Ditangguhkan / Berhenti with a reason; on suspension or ending, Dijadwalkan jobs are unassigned and in-progress jobs are listed for Admin Platform, notifying the Pemesan only if the target date moves. A "Baru" badge shows until 5 Selesai. A 90-day scorecard (Selesai, Terlambat, Keluhan upheld, declines / Tidak direspons, average Penilaian) supports a monthly Tier 4 review row.

## Acceptance criteria

- [ ] Onboarding validates the bank-name rule (match or override note); no NPWP field; emergency contact optional; Tier 4 onboarding row until complete.
- [ ] Tidak tersedia ranges are self-managed and respected by the assignment picker (ticket 56).
- [ ] Ditangguhkan: no new jobs until reinstated; Berhenti: ended for good; both still log in and see history and Pencairan.
- [ ] Unassign Dijadwalkan jobs on suspension/ending; list in-progress jobs for Admin Platform.
- [ ] Scorecard over the last 90 days from the Clock; monthly review row (tick).
- [ ] Mitra Jasa never see any family document or the audit log.
- [ ] Tests: bank-name rule; status effects on jobs; scorecard numbers for seeded jobs; Baru badge until 5 Selesai.

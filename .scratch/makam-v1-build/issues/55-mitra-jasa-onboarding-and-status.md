# Mitra Jasa onboarding, availability, status and scorecard

Status: ready-for-agent
Blocked by: 43, 49
Spec: Domain modules > 9. Layanan (Mitra Jasa profile, suspension/ending); 14. Work Queues (Tier 4 Mitra Jasa onboarding, monthly scorecard review); stories 155, 159, 177, 182

## What to build

Admin Platform onboards a Mitra Jasa: KTP, NIK, photo, home area, bank account (name must match the KTP or carry an override note), signed arrangement scan, optional emergency contact (no NPWP), and coverage lists (DKI TPUs, Layanan). The Mitra Jasa is invited by an Undangan Staf to an email, with a phone number as contact (tickets 09, 82), logs in with the email Kode Masuk, sets Tidak tersedia date ranges and sees their history and payments. Status Aktif / Ditangguhkan / Berhenti with a reason; on suspension or ending, Dijadwalkan jobs are unassigned and in-progress jobs are listed for Admin Platform, notifying the Pemesan only if the target date moves. A "Baru" badge shows until 5 Selesai. A 90-day scorecard (Selesai, Terlambat, Keluhan upheld, declines / Tidak direspons, average Penilaian) supports a monthly Tier 4 review row.

## Acceptance criteria

- [x] Onboarding validates the bank-name rule (match or override note); no NPWP field; emergency contact optional; Tier 4 onboarding row until complete.
- [x] Tidak tersedia ranges are self-managed and respected by the assignment picker (ticket 56).
- [ ] Ditangguhkan: no new jobs until reinstated; Berhenti: ended for good; both still log in and see history and Pencairan.
- [x] Unassign Dijadwalkan jobs on suspension/ending; list in-progress jobs for Admin Platform.
- [x] Scorecard over the last 90 days from the Clock; monthly review row (tick).
- [x] Mitra Jasa never see any family document or the audit log.
- [x] Tests: bank-name rule; status effects on jobs; scorecard numbers for seeded jobs; Baru badge until 5 Selesai.

## Comments

- 2026-09-26 — ADR 0004: the Mitra Jasa invite is addressed to an email and accepted by the Akun with that Email Terverifikasi; login is by email Kode Masuk (updated above).

### 2026-09-28 — Two-axis review (fix pass), recorded before any fix

**Standards** (AGENTS.md, `CONTEXT.md`, the code as it stands; hard findings = 4)

- **HARD — one Akun, two Mitra Jasa profiles.** `src/domain/layanan/mitra-jasa.ts:525` `profileOfActor` returns `null` for `admin_platform`; `src/domain/layanan/skor.ts:266` `profileFor` does not check roles at all. Both answer "which Mitra Jasa is this signed-in Akun", and they disagree, so one Akun holding both roles reads one profile through the calendar and another through the scorecard. A deep module owes one answer to a question it owns; this is the rule AGENTS.md's "domain modules hold every business rule, each with a small public interface" exists to prevent. Not a cosmetic difference between two features: `tambahTidakTersedia` refuses with `tidak_ditemukan` while `skorSaya` answers.
- **HARD — scope creep.** `kirimUlangUndangan` (`src/app/staf/admin-platform/mitra-jasa/actions.ts:138`) is asked for by no AC, is called by no form and no page, and its only other caller of `identity.inviteStaff(… role: "mitra_jasa")` is the onboarding action, which is AC 1. Dead code plus a second door to a staff invite.
- **HARD — two invented SLAs.** `src/domain/queues/tier4-mitra-jasa-row.ts` hardcodes `MITRA_JASA_ONBOARDING_GRACE_DAYS = 7` and `SKOR_MITRA_JASA_REVIEW_GRACE_DAYS = 7`, and its own comment says so: "Spec gives the row no SLA of its own; a week is in line with this tier's other windows". A business rule written from a vibe, not from the spec.
- **MEDIUM — copy.** `src/app/staf/admin-platform/mitra-jasa/page.tsx:60` ships "belum lengkap onboardingly" to a person; that is not a word.
- **LOW — convention.** The list page links with a raw `<a href>`; every other staff page (`tpu`, `staf`, `lokasi`, `tugas`) uses `next/link`.
- Verified clean, not findings: no `new Date()` / `Date.now()` in the branch's files (the Clock and `@/lib/time/jakarta` only); Zod at every boundary, including the `kebutuhanPenugasanSchema` the picker filter parses; every Server Action is `guarded()` — action, resource, schema, one `run` — with no rule in the action; every test drives a module through its public functions; no ticket number in any copy (only in code comments, as the repo does); the branch's own `drizzle/0025_*.sql` is not to be renumbered here (merge worktree does that).

**Spec** (ticket 55, `spec.md`; hard findings = 3)

- **HARD — the two 7-day windows are not in the spec, and two tests lock them.** `spec.md:527` (Work Queues) writes the window for every other row it names — "TPU flag stale for 14 days", "IPTM filing (7 days)" — and for these two writes none: "Mitra Jasa onboarding; monthly scorecard review". The AC ask for "Tier 4 onboarding row until complete" and "monthly review row (tick)", both of which are about when the row opens and closes, never a deadline. `queues.test.ts` then asserts `deadline: wib("2026-10-08 08:00")` and names a test "due a week into the month", so a rule nobody asked for is pinned by a test that reads as evidence.
- **HARD — the Admin Platform carve-out contradicts spec:342.** `profileOfActor`'s comment states "an Akun that somehow holds both roles reads the Operator's list, not its own profile". `spec.md:342` says "One account can hold many roles", and `spec.md:344` explicitly contemplates a combined account ("An account holding Admin Platform uses the strictest rule … for the whole account, whatever other roles it holds"). Nothing in the spec or in an AC says an Admin Platform cannot also be a Mitra Jasa, and the invite path makes it ordinary: the Undangan Staf is addressed to an email, and an Operator's own email may be onboarded. The role belongs in `authorize`, where it already is (`mitra_jasa.lihat_saya` requires `holds("mitra_jasa")`), not in the profile lookup.
- **HARD — `kirimUlangUndangan` is outside the AC** (see Standards).
- Checked and sound: AC 1 (bank-name rule, no NPWP, optional emergency contact, the Tier 4 onboarding row), AC 2 (the picker filter is `mitraJasaTersedia`), AC 4 (a status change releases `dijadwalkan` jobs in the same transaction and returns the in-progress ones), AC 5 (90 days from the Clock; the tick is idempotent and registered in `scheduledTicks`), AC 6, AC 7 (the "Baru" badge ends at `BARU_SAMPAI_SELESAI = 5`, which the ticket states) each have a test through the public interface. AC 3 is left unticked, which is the honest state: story 182's "still log in and see history and Pencairan" is 57's own page and the Pencairan module's read.

**Claims in the builder's own report that do not survive re-checking.** The report is in the commit message, not in this file, so the record starts here.

- "AC 6 at the server seam: a Mitra Jasa reaches no family document, order, **Hak Pakai**, audit view or Antrean row". `akses.test.ts` proves the document, the order, the audit view, the Antrean and the Mitra Jasa list. The **Hak Pakai** half has no test anywhere in the branch — the word appears in that file's header comment and nowhere in an assertion. The claim as written is not proven.
- "a record written before that person ever signed in is found again, and no second identity exists to keep in step" — true, and covered by `mitra-jasa.test.ts`.
- The two 7-day windows were not a claim but a decision, made without a spec line. That is the record that matters here.

**What this fix pass changed.** One source of truth for the profile: `profileOfActor` keys on the Email Terverifikasi alone and `skor.ts` calls it, so both doors answer the same; the role gate stays in `authorize`. A test that one Akun holding both roles gets one profile, proved red on the code as it was. `kirimUlangUndangan` and its refusal string removed, leaving `inviteStaff` called from the onboarding action only. Both invented 7-day windows removed: both rows now carry `deadline: null` — which `RawAntreanRow` defines as "this occurrence of the row has no deadline" — and the two tests assert that instead. **Gap recorded, not filled:** `spec.md:527` gives these two rows no window, and no other ticket owns them (ticket 55 builds them; ticket 56 owns the picker, 57 the proof and the pay). Choosing the number is the owner's, through `grilling`, and it is not this branch's to invent. While it is unset the rows still open and close on state, sort last inside Tier 4 and never alert, which is what the spec already says of Tier 4.

- 2026-09-28 — Fix pass after the two-axis review above: one profile per Akun, `kirimUlangUndangan` gone, both unsourced 7-day windows gone (`deadline: null`) with the gap above recorded for the owner. Migration `0025` left untouched for the merge worktree.

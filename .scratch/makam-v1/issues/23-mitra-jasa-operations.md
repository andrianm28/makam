# Mitra Jasa onboarding, service areas and quality

Type: grilling
Status: resolved
Map: ../map.md

## Question

What does the platform record and enforce about Mitra Jasa? At onboarding (by Admin Platform, invite-only): which data and documents (KTP, bank account, photo, signed arrangement with the Operator), and is there a probation period? Service areas: which DKI TPUs each Mitra Jasa covers and which Layanan types they may do, so assignment only offers eligible people. Quality: is there a rating from the Pemesan per Pekerjaan Layanan, a count of Terlambat / Keluhan, and a rule for suspending or ending a Mitra Jasa (automatic threshold or Admin Platform's judgement)? What happens to their open jobs and unpaid Pencairan when suspended?

Context from "Layanan catalog and Paket Layanan model": Admin Platform assigns jobs by hand; Mitra Jasa accept or decline; Terlambat after target +2 days; Keluhan within 3×24 h decided by Admin Platform (redo or refund). From "Roles, accounts and access": Mitra Jasa never see family contacts and message through a per-job thread. From "Operator entity": PT Jaya Korpora Prima signs every Mitra Jasa arrangement.

## Answer

Resolved 2026-09-25 (grilling). `CONTEXT.md`: Mitra Jasa entry now names its coverage and statuses (Aktif / Ditangguhkan / Berhenti); new term **Penilaian**.

**Onboarding (Admin Platform, invite-only)**
- Required before the first assignment: full name as on KTP, NIK + KTP photo, profile photo, home area, bank account (bank, number, holder name), scan of the signed arrangement with PT Jaya Korpora Prima + its date. Emergency contact optional. No NPWP (tax is out of scope).
- The holder name must match the KTP name, or Admin Platform ticks an override with a note. Only Admin Platform changes the bank account (TOTP, audited).
- **No probation status.** Admin Platform's approval of every photo proof is the check. The Mitra Jasa list shows a "Baru" badge until 5 Pekerjaan Layanan are Selesai.

**Coverage and assignment**
- Each Mitra Jasa has a list of DKI TPUs and a list of Layanan (per Layanan, not per variant). The assignment picker is a **hard filter** on both; Admin Platform edits the lists when needed.
- **Accept deadline**: 12 h after assignment, or H-1 18:00 if sooner. No response → back to the queue as "Tidak direspons", which counts like a decline. Assignment is notified by web push + WhatsApp.
- **Tidak tersedia**: the Mitra Jasa sets date ranges themselves. The picker hides them for target dates in the range; jobs they already accepted in the range are flagged to Admin Platform for reassignment; no scorecard penalty.
- The Pemesan sees the Mitra Jasa's **first name and profile photo** on the Pekerjaan Layanan and in the message thread. No surname, no number.

**Quality**
- **Penilaian**: an optional 1–5 stars + comment, asked in the Selesai notification and seen only by Admin Platform. It applies to every Pekerjaan Layanan, including those done by an Admin Lokasi.
- **Scorecard** per Mitra Jasa over the last 90 days: Selesai, Terlambat, Keluhan upheld, declines / Tidak direspons, average Penilaian.
- **Statuses**: Aktif ⇄ Ditangguhkan, and → Berhenti (final). Changed only by Admin Platform's judgement, with a reason required and audited; **no automatic thresholds**. Ditangguhkan / Berhenti Mitra Jasa can still log in to see their history and Pencairan, but get no new jobs.
- **Open jobs on suspension or ending**: Dijadwalkan jobs are unassigned automatically and go back to the queue. Sedang Dikerjakan / Menunggu Verifikasi jobs are listed for Admin Platform to decide one by one (let them finish, or reassign). The Pemesan is notified only if the target date moves.

**Pay**
- **Pencairan due date (amends "Money flow and revenue model")**: a Mitra Jasa's Pencairan for a job becomes due when the Keluhan window (3×24 h after the approved proof) closes with no Keluhan, then goes into the next batched transfer. Nothing is ever clawed back.
- **Keluhan upheld → redo**: by the same Mitra Jasa by default, unpaid; the original job's Pencairan is released when the redo proof is approved. If they're Ditangguhkan / Berhenti, or Admin Platform picks someone else, the other Mitra Jasa does the redo at the normal rate and the original Pencairan is cancelled.
- **Keluhan upheld → refund**: the original Pencairan is cancelled. **Keluhan rejected**: the Pencairan is released as normal. Admin Platform may override the amount with a note (e.g. half).
- **Terlambat but done**: full rate, counted on the scorecard. Cancelled for lateness with a refund: no Pencairan. Reassigned: only the Mitra Jasa who does the job is paid.

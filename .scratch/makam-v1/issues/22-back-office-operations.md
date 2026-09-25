# Admin Platform back-office queue and on-call

Type: grilling
Status: resolved
Map: ../map.md

## Question

What does the Operator's back office need so a small team can run it every day? Admin Platform must confirm TPU Saat Duka orders 06:00–18:00 daily, keep each DKI TPU's "menerima makam baru" flag current, assign Mitra Jasa jobs, approve photo proofs, approve refunds, handle Keluhan and Terlambat, process Pengajuan Wakaf, and make Pencairan transfers. Is there one unified work queue (with SLA timers and priority, Saat Duka first) or a page per task type? How is a task claimed so two admins don't do the same one? How does on-call work outside hours (who is alerted, escalation if nobody picks up within N minutes, handover between shifts)? What dashboards or counters does Admin Platform need (Pencairan due, Tagihan overdue, jobs Terlambat)? The staffing rota itself is an operations matter, not product; this ticket is only about what the product must support.

Context from "Roles, accounts and access": one flat, audited Admin Platform role; staff are invite-only. From "Notification channels and WhatsApp provider": staff alerts go by WhatsApp plus web push.

## Comments

- From "Unpaid Saat Duka Tagihan at a Lokasi Mitra" (2026-09-25): the queue must include the **"Tagihan lewat jatuh tempo"** list for every Lokasi Mitra and TPU order (from H+1, call log with outcomes, at least two calls around H+1 and H+14, declare Tidak Tertagih from H+30).

Context from "Lokasi terverifikasi and published tariffs": Admin Platform also runs the Lokasi Mitra publish gate (agreement, Kunjungan Verifikasi, tariffs entered), switches on "Pemesanan Terencana aktif", enters versioned tariff changes with effective dates, orders revisits, and sets a Lokasi Mitra to Ditangguhkan / Berhenti; it also keeps each TPU's "diperbarui <tanggal>" flag date current.
- From "Mitra Jasa onboarding, service areas and quality" (2026-09-25): Admin Platform also onboards Mitra Jasa (KTP, bank account override, edits TPU / Layanan lists), works the "Tidak direspons" / declined jobs returning after the 12 h accept deadline, reassigns jobs flagged by a Mitra Jasa's Tidak tersedia range or by a suspension, reviews the 90-day scorecard and sets Aktif / Ditangguhkan / Berhenti, decides upheld Keluhan (redo or refund, amount override) and releases or cancels the matching Pencairan.

## Answer

Resolved 2026-09-25 (grilling). `CONTEXT.md`: new section Operations with **Antrean**, **Bertugas**, **Catatan Internal**.

**One Antrean**
- A single list of open work, one row per task, built from the state of its order, job, payment or Lokasi (never created by hand) and closing itself when that state moves on. Columns: type, subject, time left before the deadline, who has taken it. Filterable by type; the row links to the normal detail page (Pesanan, Lokasi, Mitra Jasa, Pencairan) where the work is done.
- Sorted by tier, then earliest deadline.

**Row types, tiers and deadlines**
- **Tier 1 (urgent, alerts):** Konfirmasi TPU Saat Duka (2 h, 06:00–18:00); Konfirmasi Lokasi terlambat (see below); Keluhan (first response within 4 h in the daytime, decided before the 3×24 h window closes); jobs due today with no Mitra Jasa.
- **Tier 2 (same day):** Foto bukti approval (24 h, since it starts the Keluhan window); Terlambat; jobs Tidak direspons / Ditolak / flagged for reassignment (Tidak tersedia, suspension); failed-notification phone calls.
- **Tier 3 (working days):** Pengembalian Dana (transfer within 2 working days of approval); Pencairan (2 working days after due); IPTM filing on JakEVO (7 days); Tagihan lewat jatuh tempo (from H+1; calls around H+1 and H+14; Tidak Tertagih from H+30); Pengajuan Wakaf (first contact within 3 working days, then status steps).
- **Tier 4 (upkeep):** TPU "menerima makam baru" flag not updated in 14 days; Lokasi revisits; Lokasi Mitra publish-gate checks; Mitra Jasa onboarding; monthly Mitra Jasa scorecard review.
- Tier 3–4 rows never alert; they wait in the Antrean.

**Taking a task (soft claim)**
- **Ambil** marks a row "Ditangani <nama>" for everyone. Anyone may take over with one click (logged). Claims never expire, and anyone may act on an unclaimed row.
- For Konfirmasi TPU Saat Duka, taking the task shows that admin's name and contact on the Pemesan's order page.

**Bertugas and alerts**
- An Admin Platform switches **Bertugas** on themselves. Tier 1 alerts (WhatsApp + web push) go to the admins who are Bertugas; if nobody is, to every Admin Platform. The rota stays offline.
- Bertugas switches off by itself at 18:00 or after 12 h, whichever comes first. The top of the Antrean shows who is Bertugas now.
- **Escalation** (amends "Notification channels and WhatsApp provider"): a Tier 1 row not taken after 30 min alerts every Admin Platform, Bertugas or not; a Konfirmasi TPU Saat Duka still unconfirmed at 90 min (30 min before the deadline) alerts everyone again and shows a red banner. Night TPU submissions fire their first alert at 06:00; there is no night on-call for TPU. Nothing escalates outside the product.

**Handover**
- Every row and order has a staff-only **Catatan Internal** thread. Switching Bertugas off while holding claimed rows asks the admin to release each one or leave a note; the next admin sees "Dilepas oleh <nama>" with the note. No separate handover report.

**Watching over Lokasi Mitra**
- A Lokasi Mitra Saat Duka order not confirmed by its Admin Lokasi within 2 h of the Lokasi's operating hours becomes a Tier 1 row **Konfirmasi Lokasi terlambat**. Admin Platform phones the Lokasi and logs the call, but cannot confirm or assign the Petak on the Lokasi's behalf. Late confirmations are recorded on the Lokasi and weigh on Ditangguhkan.

**Counters and Laporan**
- A counter strip on top of the Antrean: Pencairan due (count, Rp), Tagihan lewat jatuh tempo (count, Rp), jobs Terlambat, Keluhan open, rows past their deadline.
- One **Laporan** page with monthly totals: orders, Rp collected, Biaya Layanan Platform earned, Pencairan paid, refunds, Tidak Tertagih, exportable as CSV. It also holds a weekly review list of every outgoing transfer (who did it, link to the proof). No charts or BI in v1.

**Pencairan run**
- One Antrean row per recipient (Lokasi Mitra or Mitra Jasa) listing every due item, minus netted amounts (Dibayar langsung platform fees, later refunds), to the bank account on file. The admin transfers by hand, uploads the proof and enters the transfer date, which issues one Bukti Pencairan. Any item may be held out of the batch with a reason. Pencairan is due continuously (2 working days), not on a weekly run.
- **No two-person rule** for refunds or Pencairan in v1; the audit log plus the weekly transfer review stand in. A second approval may become a setting later.

**Device**
- Mobile first: the back office is a PWA installed to the home screen (needed for web push on iPhone). Every Tier 1–2 task can be done on a phone (confirmation, assignment, photo review, Keluhan). Pencairan and Laporan may be desktop-first.

**Amended by "Tagihan deadlines and refunds after Pencairan"** (2026-09-25): the netted amounts in the Pencairan run are **Potongan**, one general rule for every amount a Lokasi Mitra owes; an unrecovered balance after 60 days (or on Berhenti) becomes an offline request by Admin Platform.

**Amended by [Lokasi Mitra order lifecycle](27-lokasi-mitra-order-lifecycle.md)** (2026-09-25): two new Antrean rows. **Saat Duka ditolak** (Tier 1): phone the family within 2 h and help them rebook. **Konfirmasi Terencana terlambat** (Tier 3): a Terencana order not confirmed by the end of the Lokasi's next working day.

**Amended by "Admin Lokasi back office and Petugas Lapangan work"** (2026-09-25): new Antrean rows for Tugas Lapangan: unassigned or overdue Ambil surat pengantar in Tier 2, other Tugas Lapangan in Tier 4. Failed-send calls on Lokasi Mitra orders reach this Antrean only for money messages.

**Consistency review 2** (2026-09-25): new Tier 3 rows from "TPU order loose ends": TPU Perpanjangan / Pengurusan IPTM document check (1 working day from Diajukan) and filing (3 working days from Lunas), plus the lapsed-IPTM check with the TPU before billing. New approval row: a Pembatalan refund forwarded from the Antrean Lokasi ("Lokasi Mitra order lifecycle").

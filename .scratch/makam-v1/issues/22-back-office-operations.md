# Admin Platform back-office queue and on-call

Type: grilling
Status: open
Map: ../map.md

## Question

What does the Operator's back office need so a small team can run it every day? Admin Platform must confirm TPU Saat Duka orders 06:00–18:00 daily, keep each DKI TPU's "menerima makam baru" flag current, assign Mitra Jasa jobs, approve photo proofs, approve refunds, handle Keluhan and Terlambat, process Pengajuan Wakaf, and make Pencairan transfers. Is there one unified work queue (with SLA timers and priority, Saat Duka first) or a page per task type? How is a task claimed so two admins don't do the same one? How does on-call work outside hours (who is alerted, escalation if nobody picks up within N minutes, handover between shifts)? What dashboards or counters does Admin Platform need (Pencairan due, Tagihan overdue, jobs Terlambat)? The staffing rota itself is an operations matter, not product; this ticket is only about what the product must support.

Context from "Roles, accounts and access": one flat, audited Admin Platform role; staff are invite-only. From "Notification channels and WhatsApp provider": staff alerts go by WhatsApp plus web push.

## Comments

- From "Unpaid Saat Duka Tagihan at a Lokasi Mitra" (2026-09-25): the queue must include the **"Tagihan lewat jatuh tempo"** list for every Lokasi Mitra and TPU order (from H+1, call log with outcomes, at least two calls around H+1 and H+14, declare Tidak Tertagih from H+30).

Context from "Lokasi terverifikasi and published tariffs": Admin Platform also runs the Lokasi Mitra publish gate (agreement, Kunjungan Verifikasi, tariffs entered), switches on "Pemesanan Terencana aktif", enters versioned tariff changes with effective dates, orders revisits, and sets a Lokasi Mitra to Ditangguhkan / Berhenti; it also keeps each TPU's "diperbarui <tanggal>" flag date current.
- From "Mitra Jasa onboarding, service areas and quality" (2026-09-25): Admin Platform also onboards Mitra Jasa (KTP, bank account override, edits TPU / Layanan lists), works the "Tidak direspons" / declined jobs returning after the 12 h accept deadline, reassigns jobs flagged by a Mitra Jasa's Tidak tersedia range or by a suspension, reviews the 90-day scorecard and sets Aktif / Ditangguhkan / Berhenti, decides upheld Keluhan (redo or refund, amount override) and releases or cancels the matching Pencairan.

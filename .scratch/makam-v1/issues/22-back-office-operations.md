# Admin Platform back-office queue and on-call

Type: grilling
Status: open
Map: ../map.md

## Question

What does the Operator's back office need so a small team can run it every day? Admin Platform must confirm TPU Saat Duka orders 06:00–18:00 daily, keep each DKI TPU's "menerima makam baru" flag current, assign Mitra Jasa jobs, approve photo proofs, approve refunds, handle Keluhan and Terlambat, process Pengajuan Wakaf, and make Pencairan transfers. Is there one unified work queue (with SLA timers and priority, Saat Duka first) or a page per task type? How is a task claimed so two admins don't do the same one? How does on-call work outside hours (who is alerted, escalation if nobody picks up within N minutes, handover between shifts)? What dashboards or counters does Admin Platform need (Pencairan due, Tagihan overdue, jobs Terlambat)? The staffing rota itself is an operations matter, not product; this ticket is only about what the product must support.

Context from "Roles, accounts and access": one flat, audited Admin Platform role; staff are invite-only. From "Notification channels and WhatsApp provider": staff alerts go by WhatsApp plus web push.

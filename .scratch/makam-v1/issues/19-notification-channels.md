# Notification channels and WhatsApp provider

Type: grilling
Status: open
Map: ../map.md

## Question

Which channel carries each message the platform sends (WhatsApp, SMS, email, in-app), and through which provider? Messages include: login / Pemegang Hak OTP, Bukti Booking and invoices, payment links and reminders before the due date, Perpanjangan reminders before a Hak Pakai expires, Layanan photo reports, new-job alerts to Admin Lokasi (incl. after-hours Saat Duka), Petugas YIEM and Mitra Jasa, and Pencairan notices to partners. Official WhatsApp Business API (direct Meta Cloud API vs an Indonesian BSP) or an unofficial gateway, what happens when a WhatsApp message fails, and who pays per message.

Context from "Tech stack for a solo engineer with AI agents": Next.js + Postgres on the Jakarta VPS; outbound messages are sent from the pg-boss `worker`, so retries and scheduling (H-7, before-expiry reminders) are cheap; data leaving Indonesia is otherwise limited to scrubbed Sentry events, so a provider's hosting location matters.

Context from "How Perpanjangan verifies the Pemegang Hak": a WhatsApp OTP to the number recorded on the Hak Pakai is the proof of being the Pemegang Hak.

Context from "Scope of Wakaf Tanah in v1": every Pengajuan Wakaf status change (set by hand by Admin YIEM) notifies the Wakif, and new applications alert Admin YIEM.

Context from "Roles, accounts and access": WhatsApp OTP is the only login method for every role (Pemesan and all staff; Admin YIEM adds TOTP), so a WhatsApp outage blocks all logins unless a fallback exists. Mitra Jasa reach families through a per-Pekerjaan Layanan message thread, with each new message notified to the Pemesan by WhatsApp.

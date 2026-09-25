# Notification channels and WhatsApp provider

Type: grilling
Status: resolved
Map: ../map.md

## Question

Which channel carries each message the platform sends (WhatsApp, SMS, email, in-app), and through which provider? Messages include: login / Pemegang Hak OTP, Tagihan, Bukti Pembayaran and the other Bukti documents, payment links and reminders before the due date, Perpanjangan reminders before a Hak Pakai expires, Layanan photo reports, new-job alerts to Admin Lokasi (incl. after-hours Saat Duka), Petugas YIEM and Mitra Jasa, and Pencairan notices to partners. Official WhatsApp Business API (direct Meta Cloud API vs an Indonesian BSP) or an unofficial gateway, what happens when a WhatsApp message fails, and who pays per message.

Context from "Tech stack for a solo engineer with AI agents": Next.js + Postgres on the Jakarta VPS; outbound messages are sent from the pg-boss `worker`, so retries and scheduling (H-7, before-expiry reminders) are cheap; data leaving Indonesia is otherwise limited to scrubbed Sentry events, so a provider's hosting location matters.

Context from "How Perpanjangan verifies the Pemegang Hak": a WhatsApp OTP to the number recorded on the Hak Pakai is the proof of being the Pemegang Hak.

Context from "Scope of Wakaf Tanah in v1": every Pengajuan Wakaf status change (set by hand by Admin YIEM) notifies the Wakif, and new applications alert Admin YIEM.

Context from "Roles, accounts and access": WhatsApp OTP is the only login method for every role (Pemesan and all staff; Admin YIEM adds TOTP), so a WhatsApp outage blocks all logins unless a fallback exists. Mitra Jasa reach families through a per-Pekerjaan Layanan message thread, with each new message notified to the Pemesan by WhatsApp.

## Answer

Decided with the user on 2026-09-25 (grilling). Facts: [research/19-whatsapp-providers.md](../research/19-whatsapp-providers.md).

**Provider and cost**

- **Official WhatsApp Business API only**, sent through **kirim.dev**: a pass-through to Meta's Cloud API with a flat subscription (about US$3–8/month) and no per-message markup. Meta bills YIEM directly (Indonesia: Rp356.65 per delivered authentication / utility message; about Rp713k/month at 2,000 messages). Unofficial QR-paired gateways (Fonnte, Wablas, WAHA) are not allowed, not even as a backup: a ban would lock every role out, because WhatsApp OTP is the only login.
- Sending sits behind one interface in the pg-boss `worker`, so a direct Cloud API setup or another BSP can replace kirim.dev later.
- **YIEM pays every message** (WhatsApp, SMS, email) as platform overhead. Nothing is charged per message to Lokasi Mitra, Mitra Jasa or families.
- **Sending number**: a new number used only by the API. The existing YIEM CS number stays on the WhatsApp Business app.
- **Before launch** (spec requirements, not decisions): Meta Business verification for YIEM (raises the limit from 250 to 2,000 users per 24 h; also confirms the yayasan document list and whether PPN applies); checking whether kirim.dev's hosting location allows Meta's Indonesian local storage (`data_localization_region=ID`), which can only be set before the number is registered. If it doesn't, v1 accepts Meta's default international processing. Either way, WhatsApp joins Sentry on the list of data that leaves Indonesia.
- **Replies**: the API number is notify-only. Every inbound message gets an automatic reply pointing to the YIEM CS WhatsApp number, which Admin YIEM answers in the Business app. There's no inbox in the platform.

**Channels**

- **WhatsApp**: the primary channel for everyone and every message.
- **Email** through Amazon SES (Jakarta region): copies of every Bukti Pemesanan, Tagihan and Bukti Pembayaran, only when the order has the optional email. Also the fallback for failed messages about those documents.
- **SMS**, only as the **OTP fallback**, through Zenziva with a registered sender name (registration takes 3–4 weeks, so start at least a month before launch). A "Kirim lewat SMS" button appears about 60 s after the WhatsApp OTP is sent. Applies to every role. This settles the outage consequence in ADR 0003.
- **Web push** to staff (Admin Lokasi, Admin YIEM, Petugas YIEM, Mitra Jasa), **on top of** WhatsApp for every staff alert, never instead of it. On iPhone it only works once the back office is installed to the home screen.

**Content**

- Messages are short templates plus a link into the app. Photos, Mitra Jasa thread text and documents never go through WhatsApp. A Tagihan message shows the amount, the due date and the payment link. The OTP uses Meta's fixed authentication template with a copy-code button, and it only arrives on the phone (not WhatsApp Web or Desktop).
- No marketing messages in v1.

**Timing and recipients**

- Transactional messages (OTP, Bukti Pemesanan, order confirmations, new-order alerts) go out at any hour. Reminders to families go out only between 08:00 and 20:00 WIB.
- A new Saat Duka order at a Lokasi Mitra alerts every Admin Lokasi of that Lokasi plus its on-call contact, night included. A new TPU order alerts every Admin YIEM, 06:00–18:00. A new Pengajuan Wakaf alerts Admin YIEM, and each Wakaf status change notifies the Wakif.
- Mitra Jasa and Petugas YIEM get an alert for every job assigned to them. Each new message in a Pekerjaan Layanan thread notifies the Pemesan with a link. A photo report notifies the Pemesan with a link.
- Lokasi Mitra and Mitra Jasa get a notice for every Pencairan, with its Bukti Pencairan linked.

**Reminders** (stop as soon as the Tagihan is paid or the Perpanjangan ordered)

- Tagihan: when sent, 24 h before it's due, and on the due date if still unpaid.
- Paket Layanan: the cycle's Tagihan at H-7, plus a reminder at H-1.
- Hak Pakai at a Lokasi Mitra: 60, 30 and 7 days before it ends, then weekly during the masa tenggang, to both the Pemegang Hak and the Admin Lokasi.
- DKI TPU IPTM: 60 and 30 days before expiry, each offering the Perpanjangan service.

**Failures (other than OTP)**

- The worker retries 3 times with backoff. Tagihan, Bukti Pemesanan and Bukti Pembayaran messages then go by email if the order has one. Every final failure is flagged in the back office (Admin Lokasi for Lokasi Mitra orders, otherwise Admin YIEM), and the staff member phones the family.
- Every outbound message is logged with its status (terkirim / dibaca / gagal) and shown on its order.
- Failed staff alerts aren't escalated beyond web push and the back-office queue.

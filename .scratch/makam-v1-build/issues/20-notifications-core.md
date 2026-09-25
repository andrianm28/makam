# Notifications module core

Status: ready-for-agent
Blocked by: 17, 18
Spec: Domain modules > 15. Notifications; Adapter ports > WhatsAppSender, EmailSender; stories 38, 172

## What to build

One module decides recipient, channel, template and timing for every domain event and sends through the pg-boss worker. WhatsApp is primary (templates with parameters and a link into the app), email copies of Tagihan / Bukti go out when the order has an email, web push is added in ticket 21; there is no SMS (the email Kode Masuk and its fallback are ticket 67, sent outside this module). Log every message with its status on its order. Implement retries, the email fallback for document messages, and the phone-call row when a money message finally fails (Tier 2 row in the Antrean). Wire the first events: Tagihan issued and its reminders, and Bukti Pembayaran issued. Handle inbound WhatsApp with an auto-reply pointing to the CS number.

## Acceptance criteria

- [ ] An event → (recipient, channel, template, timing) table in code; templates are listed in one place so they can be submitted to Meta (ticket 05).
- [ ] Reminders to families go out only 08:00–20:00 WIB (deferred to 08:00 otherwise); transactional messages and new-order alerts go at any hour.
- [ ] Tagihan reminders follow exactly one rule per Tagihan kind, never stacked, all within 08:00–20:00: pay-first Perpanjangan, filing-only Pengurusan and standalone Layanan / non–Saat Duka Layanan at issue, H-1 and on the due day; Pemesanan Terencana one reminder about 4 h before the hold expires (ticket 37); Paket cycle H-7 (issue) and H-1 (ticket 54); pay-after (Saat Duka, burial under an existing Hak Pakai) H+3, H+7, H+14, H+30 (ticket 29). This ticket builds the rule table and the pay-first rule; each stops once the Tagihan is Lunas, Dibatalkan or Tidak Tertagih.
- [ ] Every outbound message is logged with status terkirim / dibaca / gagal (fed by the sender's status reports) and shown on its order page.
- [ ] Retries: 3 with backoff; then a document message (Tagihan, Bukti) goes by email if an email is on the order; then a phone-call row. Money subjects (Tagihan, reminders, Bukti Pembayaran, refunds) → a Tier 2 "failed money-message call" row in the Antrean. OTP failures create no row. Failed staff alerts are not escalated beyond web push and the queue.
- [ ] Email copies of Tagihan and Bukti Pembayaran (and later Bukti Pemesanan) go through EmailSender (SumoPod SMTP, ticket 68) to the Pemesan's optional email when given (entered on "Data & kirim" or in the Akun Saya profile, tickets 22, 27); the email is used for nothing else here (once verified it also receives the email Kode Masuk, ticket 67).
- [ ] Inbound WhatsApp gets an auto-reply with the CS number (from Pengaturan Operator, ticket 63); there is no inbox.
- [ ] No marketing messages; the Operator pays every message (no per-message charge anywhere).
- [ ] Tests: recipients per event; the 08:00–20:00 window with the fake Clock; retry → email → call-row routing by subject; the failed-money-message row closes once a staff member logs the call.

## Notes

Lokasi-work subjects (confirmation, Bukti Pemesanan, Perpanjangan, Hak Pakai expiry, Lokasi Layanan) route to the Antrean Lokasi; that row type is added in ticket 23. Tagihan reminder rules were settled on 2026-09-25 (see 00-index).

## Open template questions (2026-09-25)

Drafted templates: [`../whatsapp-templates.md`](../whatsapp-templates.md) (42: 1 authentication, 41 utility). Settle while building this ticket, before submitting to Meta: OTP expiry (draft says 10 min); whether confirmation carries the Tagihan link instead of a separate `tagihan_terbit`; whether `tagihan_terbit` is transactional (any hour) or a reminder (08:00–20:00); a Terencana hold expiring at night vs the 08:00–20:00 window; the five "implied" templates (keep or drop); recipients for the Pencairan notice, per-Hak-Pakai expiry alerts to Admin Lokasi, and Bukti Pemesanan to a Pemegang Hak who is not the Pemesan; final URL-button routes (changing them later needs re-approval). The draft's note about a WhatsApp-only login is outdated: the email OTP fallback and email login now exist (ticket 67, decided 2026-09-25).

## Amended (2026-09-25, email login and SumoPod SMTP)

- SES is dropped: every email goes through EmailSender on the SumoPod SMTP relay (adapter ticket 68). The email for Tagihan / Bukti copies need not be verified.
- The email Kode Masuk (email login and the "Kirim lewat email" fallback, ticket 67) does not go through this module, the same exception as the WhatsApp OTP: no message-log entry, no retries, no row.
- When the Undangan Staf send moves behind this module (ticket 09 note), it also goes by email to the invite's email.

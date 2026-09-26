# Notifications module core

Status: ready-for-agent
Blocked by: 17, 18, 82
Spec: Domain modules > 15. Notifications; Adapter ports > EmailSender, WebPush; ADR 0004; stories 38, 172, 194

## What to build

One module decides recipient, channel, template and timing for every domain event and sends through the pg-boss worker. **Families get email** (EmailSender on the SumoPod SMTP relay, ticket 68) with a link into the app; **staff get Peringatan Staf** by web push to each Perangkat Push (ticket 21) and by email. There is no WhatsApp and no SMS (ADR 0004); the Kode Masuk is sent by Identity & Access outside this module. Log every message with its status on its order. Implement retries and the **"Telepon Pemesan"** call row: raised when a money message finally fails, and when a family must act and email is not enough (Tier 2 row in the Antrean). Wire the first events: Tagihan issued and its reminders, and Bukti Pembayaran issued. _Rewritten 2026-09-26 for ADR 0004 (was: WhatsApp primary, email copies, inbound WhatsApp auto-reply)._

## Acceptance criteria

- [ ] An event → (recipient, channel, template, timing) table in code; the email templates are listed in one place.
- [ ] Reminders to families go out only 08:00–20:00 WIB (deferred to 08:00 otherwise); transactional messages and new-order alerts go at any hour.
- [ ] Tagihan reminders follow exactly one rule per Tagihan kind, never stacked, all within 08:00–20:00: pay-first Perpanjangan, filing-only Pengurusan and standalone Layanan / non–Saat Duka Layanan at issue, H-1 and on the due day; Pemesanan Terencana one reminder about 4 h before the hold expires (ticket 37); Paket cycle H-7 (issue) and H-1 (ticket 54); pay-after (Saat Duka, burial under an existing Hak Pakai) H+3, H+7, H+14, H+30 (ticket 29). This ticket builds the rule table and the pay-first rule; each stops once the Tagihan is Lunas, Dibatalkan or Tidak Tertagih.
- [ ] Every outbound message is logged with status terkirim / gagal (from the EmailSender and WebPush results) and shown on its order page.
- [ ] Retries: 3 with backoff; then a phone-call row. Money subjects (Tagihan, reminders, Bukti Pembayaran, refunds) → a Tier 2 "Telepon Pemesan" row in the Antrean; Lokasi work subjects → the Antrean Lokasi (ticket 23). Kode Masuk failures create no row. Failed staff alerts are not escalated beyond web push, email and the queue.
- [ ] Family messages go to the email on the order (required on every order the family submits, proven by the Kode Masuk at Kirim; ticket 22). An order CS submitted with no email gets a "Telepon Pemesan" row wherever a message asks the family to act, and CS shares document links by hand.
- [ ] "Telepon Pemesan" row type (closes once a staff member logs the call): used here for failed money messages; used by ticket 29 (Saat Duka Tagihan Lewat Jatuh Tempo) and ticket 42 (Hak Pakai nearing its end); a declined order keeps ticket 24's Tier 1 call.
- [ ] Peringatan Staf: `sendStaffAlert` (ticket 21) wrapped in this module's job and log, sending web push to every Perangkat Push and an email to the Akun Staf's Email Terverifikasi.
- [ ] ~~Inbound WhatsApp gets an auto-reply with the CS number; there is no inbox.~~ (removed 2026-09-26, ADR 0004)
- [ ] No marketing messages; the Operator pays every message (no per-message charge anywhere).
- [ ] Tests: recipients per event; the 08:00–20:00 window with the fake Clock; retry → call-row routing by subject; an order with no email raises a Telepon Pemesan row; the Telepon Pemesan row closes once a staff member logs the call; a Peringatan Staf reaches the fake WebPush and the fake EmailSender.

## Notes

Lokasi-work subjects (confirmation, Bukti Pemesanan, Perpanjangan, Hak Pakai expiry, Lokasi Layanan) route to the Antrean Lokasi; that row type is added in ticket 23. Tagihan reminder rules were settled on 2026-09-25 (see 00-index).

## Open template questions (2026-09-25)

_2026-09-26, ADR 0004: the WhatsApp templates are retired; nothing is submitted to Meta. The content questions below still apply to the email templates._ Drafted templates: [`../whatsapp-templates.md`](../whatsapp-templates.md) (42: 1 authentication, 41 utility). Settle while building this ticket: OTP expiry (draft says 10 min); whether confirmation carries the Tagihan link instead of a separate `tagihan_terbit`; whether `tagihan_terbit` is transactional (any hour) or a reminder (08:00–20:00); a Terencana hold expiring at night vs the 08:00–20:00 window; the five "implied" templates (keep or drop); recipients for the Pencairan notice, per-Hak-Pakai expiry alerts to Admin Lokasi, and Bukti Pemesanan to a Pemegang Hak who is not the Pemesan; final URL-button routes (changing them later needs re-approval). The draft's note about a WhatsApp-only login is outdated: the email OTP fallback and email login now exist (ticket 67, decided 2026-09-25).

## Amended (2026-09-25, email login and SumoPod SMTP)

- SES is dropped: every email goes through EmailSender on the SumoPod SMTP relay (adapter ticket 68). The email for Tagihan / Bukti copies need not be verified.
- The email Kode Masuk (email login and the "Kirim lewat email" fallback, ticket 67) does not go through this module, the same exception as the WhatsApp OTP: no message-log entry, no retries, no row.
- When the Undangan Staf send moves behind this module (ticket 09 note), it also goes by email to the invite's email.

## Comments

- 2026-09-26 — ADR 0004: What to build and the criteria are rewritten above: email to families, push + email Peringatan Staf, the "Telepon Pemesan" row, no WhatsApp templates, no inbound auto-reply, statuses terkirim / gagal only (email has no "dibaca"). Now also blocked by 82 (the WhatsAppSender port is removed there). The amended 2026-09-25 notes about copies to an optional, unverified email are superseded: the email is the order's required, verified channel.

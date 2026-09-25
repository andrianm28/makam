# WhatsApp (Meta + kirim.dev) vendor setup

Status: ready-for-human
Spec: Implementation Decisions > Notifications; Adapter ports > WhatsAppSender; Further Notes > Pre-launch checklist; ADR 0003 (and its 2026-09-25 amendment)

## What to build

Get the official WhatsApp Business API sending number live through kirim.dev for PT Jaya Korpora Prima. Meta verification has a long lead time, so start now. There is no SMS vendor in v1: the OTP fallback is email through SES (tickets 03, 60). _Amended 2026-09-25: email goes through the SumoPod SMTP relay (tickets 04, 68), and email login and its fallback are ticket 67; SES is dropped._

## Acceptance criteria

- [ ] Meta Business verification completed for PT Jaya Korpora Prima (akta, NIB, NPWP).
- [ ] kirim.dev account in PT JKP's name.
- [ ] Before registering the number: confirm with kirim.dev whether `data_localization_region=ID` (Meta's Indonesian local storage) is supported; record the answer. If yes, set it at registration (it can't be set later); if no, proceed with Meta's default.
- [ ] A new phone number used only by the API registered as the sending number (the existing CS number stays on the WhatsApp Business app).
- [ ] Meta authentication template (copy-code button) approved for the OTP.
- [ ] Utility templates submitted and approved once ticket 20 publishes the template list (the list lives in the codebase).
- [ ] kirim.dev API key, webhook URL for status callbacks and inbound messages (`/api/webhooks/whatsapp`), and the webhook secret recorded as secrets.
- [ ] Confirm no unofficial QR-paired gateway (Fonnte, Wablas, WAHA) is set up anywhere, even as backup.

## Notes

Meta bills PT JKP directly per message; kirim.dev is a flat pass-through subscription. The CS WhatsApp number (the human-answered one) is entered by Admin Platform in Pengaturan Operator (ticket 63; checklist in ticket 06).

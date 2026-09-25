# WhatsApp (Meta + kirim.dev) and SMS (Zenziva) vendor setup

Status: ready-for-human
Spec: Implementation Decisions > Notifications; Adapter ports > WhatsAppSender, SmsSender; Further Notes > Pre-launch checklist; ADR 0003

## What to build

Get the official WhatsApp Business API sending number live through kirim.dev for PT Jaya Korpora Prima, and a registered Zenziva SMS sender name for the OTP fallback. Both have long lead times (Zenziva 3–4 weeks), so start now.

## Acceptance criteria

- [ ] Meta Business verification completed for PT Jaya Korpora Prima (akta, NIB, NPWP).
- [ ] kirim.dev account in PT JKP's name.
- [ ] Before registering the number: confirm with kirim.dev whether `data_localization_region=ID` (Meta's Indonesian local storage) is supported; record the answer. If yes, set it at registration (it can't be set later); if no, proceed with Meta's default.
- [ ] A new phone number used only by the API registered as the sending number (the existing CS number stays on the WhatsApp Business app).
- [ ] Meta authentication template (copy-code button) approved for the OTP.
- [ ] Utility templates submitted and approved once ticket 20 publishes the template list (the list lives in the codebase).
- [ ] kirim.dev API key, webhook URL for status callbacks and inbound messages (`/api/webhooks/whatsapp`), and the webhook secret recorded as secrets.
- [ ] CS WhatsApp number (the human-answered one) recorded for the inbound auto-reply and the site's CS button.
- [ ] Zenziva account in PT JKP's name with a registered sender name; API credentials stored as secrets.
- [ ] Confirm no unofficial QR-paired gateway (Fonnte, Wablas, WAHA) is set up anywhere, even as backup.

## Notes

Meta bills PT JKP directly per message; kirim.dev is a flat pass-through subscription.

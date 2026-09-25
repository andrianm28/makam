# Real WhatsAppSender (kirim.dev) adapter

Status: ready-for-agent
Blocked by: 05, 20
Spec: Adapter ports > WhatsAppSender; Domain modules > 15. Notifications; ADR 0003

## What to build

Implement the WhatsAppSender port on kirim.dev (Meta Cloud API pass-through): template sends with parameters, including Meta's authentication template with a copy-code button for the OTP; status reports (terkirim / dibaca / gagal) from the status webhook into the message log; and the inbound-message webhook that triggers the auto-reply pointing to the CS number. There is no SMS adapter in v1; the OTP fallback is email (ticket 60).

## Acceptance criteria

- [ ] Every template in the Notifications table maps to an approved Meta template name and parameter order; a missing mapping fails at startup.
- [ ] Status webhooks update the message log idempotently; signatures are verified.
- [ ] Inbound messages get exactly one auto-reply per conversation window with the CS number (from Pengaturan Operator); nothing is stored beyond the log entry.
- [ ] Contract tests shared with the fakes; a manual run sends one real OTP by WhatsApp to a test number.
- [ ] Phone numbers never reach logs or GlitchTip.

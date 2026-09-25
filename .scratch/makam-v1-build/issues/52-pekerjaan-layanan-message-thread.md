# Pekerjaan Layanan message thread

Status: ready-for-agent
Blocked by: 51
Spec: Domain modules > 9. Layanan (Message thread); stories 96, 131 (thread), 171, 180

## What to build

A message thread per Pekerjaan Layanan (text + photos) between the Pemesan and the fulfiller (Admin Lokasi or Mitra Jasa). Each new message notifies the Pemesan by WhatsApp with a reply link (no message text or photo goes through WhatsApp). Admin Platform can read every thread and post. The thread closes when the Keluhan window ends. Contact details are never exchanged through the platform.

## Acceptance criteria

- [ ] Pemesan, the assigned fulfiller and Admin Platform can post; others can't read.
- [ ] A new message from staff/fulfiller sends the Pemesan a WhatsApp template with a reply link; the text and photos stay in-app.
- [ ] Mitra Jasa never see the Pemesan's phone number; the Pemesan sees the Mitra Jasa's first name and photo only.
- [ ] Photos go to FileStore, viewed by signed URL.
- [ ] The thread becomes read-only when the Keluhan window closes.
- [ ] Tests: access rules per role; notification sent without content; closing at window end.

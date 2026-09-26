# Operator facts and launch reference data

Status: ready-for-human
Spec: Domain modules > 17. Pengaturan Operator; 1. Identity & Access (first Admin Platform); Public site > Content pages; story 188

## What to build

A pre-launch checklist for the Operator. Every value below is entered by Admin Platform in the dashboard; nothing is seeded except the first Admin Platform. Content page copy stays in code and only needs sign-off.

## Acceptance criteria

- [ ] First Admin Platform: phone number and email given to the engineer for the CLI seed (ticket 09).
- [ ] Pengaturan Operator (ticket 63): PT Jaya Korpora Prima legal name, registered address and contact (phone, email); CS WhatsApp number and its reply hours ("dibalas mulai pukul 06:00"), used only for `wa.me` links and display (ADR 0004).
- [ ] Tariffs (ticket 12): Biaya Layanan Platform amount (flat, one rate) and its effective date.
- [ ] DKI TPU (ticket 43): the burial and filing-only Biaya Pengurusan; every DKI TPU with name, address, pin, data source and its initial "menerima makam baru" flag.
- [ ] Layanan (ticket 49): DKI Layanan variant prices and the Mitra Jasa rate per Layanan variant.
- [ ] Wakaf (ticket 58): the Nazhir list (name, type, kab/kota, contact, BWI number), if any.
- [ ] Sign-off on the v1 content page copy drafted in ticket 26 (Tentang Kami, Cara Kami Bekerja, FAQ, Hubungi Kami) and the Pengurusan di TPU DKI DIY guide (ticket 43).

## Comments

- 2026-09-26 — Also needed from the Operator: its own photographs for the public site (team, service at partner Lokasi, well-kept graves, flowers; natural light, calm, no heavy grief visuals, people's consent). Until then licensed stock is used (spec, "imagery").
- 2026-09-26 — ADR 0004: the CS WhatsApp number is still entered, but only as a `wa.me` link and display value; no WhatsApp Business API number, Meta verification or kirim.dev account is needed (ticket 05 is wontfix).

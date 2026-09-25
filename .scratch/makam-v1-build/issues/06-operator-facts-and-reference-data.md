# Operator facts and launch reference data

Status: ready-for-human
Spec: Implementation Decisions > Tariffs (global); Lokasi > TPU; Billing > Documents; Public site > Content pages; Identity & Access (first Admin Platform)

## What to build

Collect the business facts and reference data that the code reads from configuration or that Admin Platform enters in the app before launch. Code tickets use placeholders until these arrive.

## Acceptance criteria

- [ ] PT Jaya Korpora Prima legal name, registered address and contact (phone, email) for every Tagihan / Bukti header and the Hubungi Kami page.
- [ ] CS WhatsApp number and its reply hours ("dibalas mulai pukul 06:00").
- [ ] Biaya Layanan Platform amount (flat, one rate) and its effective date.
- [ ] DKI Biaya Pengurusan: the burial amount and the filing-only amount.
- [ ] DKI Layanan variant prices and the Mitra Jasa rate per Layanan variant.
- [ ] The list of every DKI TPU with name, address, pin and the data source to cite, plus the initial "menerima makam baru" flag for each.
- [ ] The phone number(s) of the first Admin Platform, to be seeded from the CLI.
- [ ] The Nazhir list to preload (name, type, kab/kota, contact, BWI number), if any.
- [ ] Sign-off on the v1 content page copy drafted in ticket 26 (Tentang Kami, Cara Kami Bekerja, FAQ, Hubungi Kami) and the Pengurusan di TPU DKI DIY guide (ticket 43).

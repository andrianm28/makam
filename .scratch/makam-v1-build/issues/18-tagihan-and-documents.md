# Tagihan, document numbering and document pages

Status: ready-for-agent
Blocked by: 12
Spec: Domain modules > 10. Billing (Tagihan, due rules by kind, Documents); Adapter ports > PdfRenderer; story 183

## What to build

The Billing module's Tagihan: one per payment moment, immutable once issued (changes are made by cancelling and reissuing), addressed to the Pemesan (or the Pemegang Hak for a Perpanjangan), with lines carrying provider attribution. Implement the due-date rules for every Tagihan kind as one pure function, the status model, the pay-first lapse tick, sequential document numbering, and the document web pages (Tagihan and Bukti Pembayaran here) on unguessable links with "Unduh PDF" and the PT Jaya Korpora Prima header. Implement the real PdfRenderer (headless Chromium in the image) since it needs no external account.

## Acceptance criteria

- [ ] Kind pay-first or pay-after; one due date = the earliest of its lines' due dates; hari-H Layanan lines on a Saat Duka Tagihan take its due date so it stays pay-after.
- [ ] Due rules: Saat Duka checkout (Lokasi Mitra, DKI TPU) pay-after, 3×24 h after the burial (Lokasi policy); burial under an existing Hak Pakai pay-after, 3×24 h after the recorded burial; Terencana pay-first at hold expiry; Perpanjangan (Lokasi Mitra) and filing-only Pengurusan pay-first 3×24 h after issue; standalone Layanan / Layanan at a non–Saat Duka checkout pay-first at the earlier of 24 h after issue or the last lead-time day; Paket cycle pay-first at H-1.
- [ ] Statuses Belum Dibayar / Lunas / Lewat Jatuh Tempo / Tidak Tertagih / Dibatalkan, plus Dikembalikan sebagian / penuh.
- [ ] A tick lapses pay-first Tagihan to Dibatalkan at their due date; it is idempotent. Pay-after Tagihan are not lapsed (their Lewat Jatuh Tempo clock is ticket 25).
- [ ] Any attempt to change an issued Tagihan's lines fails; cancel-and-reissue produces a new Nomor Tagihan.
- [ ] Numbering, sequential per type per year: `TGH/2026/000123`, `BYR/…`, `RFD/…`, `BKP/…`, `BPM/…`, `BPP/…`; Nomor Pemesanan `MKM-2026-000123`, one series for every order kind; gap-free under concurrency.
- [ ] Tagihan and Bukti Pembayaran pages on unguessable links, header with PT Jaya Korpora Prima's legal name, address and contact (from config); "Unduh PDF" renders through PdfRenderer. Brand "Makam.co.id" everywhere else; YIEM nowhere.
- [ ] A Harga Khusus appears as a negative "Penyesuaian Harga Khusus" line (line type supported here; the Admin Platform action is ticket 30).
- [ ] Tests: each due rule; earliest-due for mixed lines; immutability; lapse tick with the fake Clock; numbering per type per year and year rollover; PDF produced via the fake PdfRenderer; one test of the real renderer in CI.

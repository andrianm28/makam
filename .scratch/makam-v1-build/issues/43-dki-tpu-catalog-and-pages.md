# DKI TPU catalog, prices and pages

Status: ready-for-agent
Blocked by: 16, 17
Spec: Domain modules > 3. Lokasi (TPU); 4. Tariffs (DKI Biaya Pengurusan, Retribusi Pemda); 14. Work Queues (Tier 4 TPU flag stale); Public site > Content pages (Pengurusan di TPU DKI); stories 7 (TPU cards), 13, 14, 148

## What to build

The TPU side of the Lokasi module: every DKI TPU with name, address, pin, data source and the "menerima makam baru" flag with its last-updated date, maintained by Admin Platform; a Tier 4 reminder row when the flag hasn't been updated for 14 days. Add the DKI price book entries to Tariffs: the two Biaya Pengurusan amounts (burial, filing-only) and Retribusi Pemda lines (Rp 0 today). Build the DKI TPU page ("TPU resmi Pemprov DKI Jakarta", new-plot status with its date, a price box with retribusi IPTM Rp 0 and the two Biaya Pengurusan amounts as service fees), add TPU cards to Daftar Lokasi Makam, and write the Pengurusan di TPU DKI page.

## Acceptance criteria

- [ ] A seed/import command loads the DKI TPU list (from ticket 06 data; sample data until then); every DKI TPU is listed.
- [ ] Admin Platform edits the flag; each update stamps the date and is audited; the Tier 4 row appears 14 days after the last update and closes on update.
- [ ] Biaya Pengurusan (two amounts) and Retribusi Pemda lines are versioned like other tariffs; no Biaya Layanan Platform on TPU quotes.
- [ ] The TPU page never uses "Terverifikasi"; it shows "TPU resmi Pemprov DKI Jakarta" and the flag with "diperbarui <tanggal>".
- [ ] Daftar Lokasi includes DKI TPU cards and the type filter covers them; a TPU card's "mulai Rp X" is the burial Biaya Pengurusan + Retribusi Pemda (Rp 0 today).
- [ ] Pengurusan di TPU DKI page: the free DIY guide (TPU on the day → surat pengantar → JakEVO / PTSP, free), the two Biaya Pengurusan amounts, the DKI Layanan price list (from ticket 49 when present), and entries to Saat Duka TPU, Perpanjang IPTM and "Sudah dimakamkan? Kami urus IPTM-nya".
- [ ] Tests: stale-flag row timing; TPU quote has no platform fee; TPU card "mulai Rp X" = burial Biaya Pengurusan + Retribusi Pemda; Retribusi Rp 0 line shown as its own line.

## Notes

A non-zero Retribusi Pemda is paid on to the Pemda from a Tier 3 "Setor Retribusi" row (ticket 45).

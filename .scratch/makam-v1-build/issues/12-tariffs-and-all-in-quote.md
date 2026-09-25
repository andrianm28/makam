# Versioned tariffs and the all-in price quote

Status: ready-for-agent
Blocked by: 10
Spec: Domain modules > 4. Tariffs; Lokasi Mitra (Jenis Makam); stories 9 (prices), 10, 150 (Jenis Makam, versioned tariffs)

## What to build

The Tariffs module: versioned price books entered only by Admin Platform, each with an effective date that may be in the future; old versions are never deleted. Admin Platform defines a Lokasi Mitra's Jenis Makam and enters per Jenis Makam the Harga Hak Pakai, tenure (Selamanya or N years) and Perpanjangan price per term; per Lokasi the Biaya Pemakaman (+ tumpang amount); and the global Biaya Layanan Platform. Expose the all-in price quote: for any set of lines, the parts plus a total including one Biaya Layanan Platform per Tagihan where it applies (Lokasi Mitra only). Admin Platform marks a Lokasi's tariffs "checked" for the publish gate.

## Acceptance criteria

- [ ] Price lookups take an instant and return the version in force then; a future version is returned only from its effective date.
- [ ] Entering a new version never mutates or deletes an older one; each entry is audited.
- [ ] Only Admin Platform can write tariffs (authorisation check).
- [ ] `quote(lines, at)` returns each line with its provider attribution (Lokasi Mitra for its tariff lines, Operator for the Biaya Layanan Platform) and the total; exactly one Biaya Layanan Platform per quote for Lokasi Mitra lines, none for TPU-only lines.
- [ ] The quote exposes "scheduled change" data (next version and its date) so pages can show "Harga baru mulai <tanggal>" and "Harga berlaku sejak <tanggal>".
- [ ] A "tariffs checked" mark per Lokasi, set by Admin Platform, audited.
- [ ] Tests: versioning by effective date (before / on / after); quote totals; one platform fee per quote; tenure Selamanya vs N years stored per Jenis Makam.

## Notes

Layanan variant prices (Lokasi and DKI), DKI Biaya Pengurusan, Retribusi Pemda lines and Mitra Jasa rates are added to this module by tickets 43 and 49 using the same versioning.

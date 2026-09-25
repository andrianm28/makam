# Layanan catalog, prices and Paket Layanan definitions

Status: ready-for-agent
Blocked by: 16
Spec: Domain modules > 9. Layanan (Catalog, Paket Layanan); 4. Tariffs (Layanan variant prices, DKI Layanan, Mitra Jasa rate); stories 9 (Layanan prices), 154

## What to build

Admin Platform keeps the one global Layanan catalog: fixed-price variants, text fields (e.g. nisan inscription), minimum lead time, "bisa hari-H" flag, "makes sense on an empty plot" flag and required proof (after photo always; before photo for Pembersihan and Perawatan Rumput & Taman; video for the Laporan Foto/Video). Each Lokasi switches on Layanan from the list with its Lokasi price per variant; DKI Layanan prices and the Mitra Jasa rate per variant are versioned in Tariffs. Admin Platform defines Paket Layanan (items + frequency sekali / bulanan / 3-bulanan / tahunan); a Paket is priced as the sum of the place's item prices and offered only where every item is offered. Layanan prices appear on the Lokasi page and the Pengurusan di TPU DKI page.

## Acceptance criteria

- [ ] Catalog CRUD by Admin Platform only, audited; variants have fixed prices per place (no free pricing).
- [ ] Required proof is derived per Layanan as listed above.
- [ ] Admin Platform marks each Batu Nisan variant "boleh di TPU DKI" by hand (audited); only marked variants are offered at a TPU (DKI price list, TPU orders). No Pemda rules are encoded.
- [ ] A Lokasi offers only the Layanan it switched on; the Lokasi page lists them with all-in prices.
- [ ] Mitra Jasa rate per variant is versioned; never shown to the Pemesan.
- [ ] Paket price = sum of item prices at that place from `quote()`; a Paket is hidden where any item is not offered.
- [ ] Tests: Paket availability rule; price sum; proof requirements per Layanan; versioned DKI prices; unmarked Batu Nisan variants not offered at a TPU.

## Notes

TPU nisan variants: resolved as a hand-set "boleh di TPU DKI" mark per Batu Nisan variant (see 00-index).

# Katalog Paket Pemakaman per Lokasi Mitra

Type: task
Status: ready-for-agent
Spec: ../spec.md (stories 4; Rules 1–2, 6)

## What to build

Module `paket-pemakaman`: create, edit and withdraw a Lokasi Mitra's Paket Pemakaman (Admin Platform only, Entri Audit on every write), its price as a Tariffs version, and a read `paketDitawarkan(lokasiId, at)` that returns only what is offered (listed Lokasi, not withdrawn, priced now) with Komponen and price. Admin Platform screen under the Lokasi Mitra's staff pages.

## Acceptance criteria

- [ ] A second live Paket for the same Tingkat Paket and Tradisi at one Lokasi is refused.
- [ ] A Paket without Komponen, or with a Komponen twice, is refused.
- [ ] A Paket without a Tarif in force is not offered; a future Tarif makes it offered from its Tanggal Berlaku.
- [ ] A withdrawn Paket is not offered; an Admin Lokasi or Pemesan cannot write.
- [ ] Every write leaves an Entri Audit with the Lokasi.

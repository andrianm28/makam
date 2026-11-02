# Paket Pemakaman: a Lokasi Mitra's own funeral-service bundle, bought with a Pemesanan Saat Duka

New product type, outside the v1 spec. Owner request (via dri, 2026-11-02): offer funeral-service packages the way funeral organisers in the market do (tiers such as Standar, Premium and VIP, per faith), now that the product focuses on Lokasi Mitra (TPS) and Graha Sentosa and no longer on TPU. We copy the *structure* of such offers (tiers, faith variants, a fixed list of components), never another organiser's wording, prices or images. Spec: `.scratch/paket-pemakaman/spec.md`.

Until now the platform sold only the grave (Hak Pakai, Biaya Pemakaman) and Layanan, which are grave services carried out at a Petak Makam with photo proof, mostly after the burial. What a family needs in the hours between a death and the burial (ambulance, washing and shrouding or dressing, the coffin or shroud, flowers, food for mourners, a funeral home or tent, the paperwork) was not on offer.

## Decision

- **A new concept, not a Layanan.** A Paket Pemakaman is one Lokasi Mitra's bundle of funeral services for one Almarhum, in a **Tingkat** (Standar, Premium, VIP) and a **Tradisi** (Muslim, Nasrani), listing which **Komponen Pemakaman** it includes from a closed list, each with the Lokasi's short description of what it means there (e.g. "ambulans dalam kota Jakarta"). It is not a Layanan or a Paket Layanan: those are grave work with a Pekerjaan Layanan, a target date and photo proof per item, and they keep that meaning.
- **Sold by the Lokasi Mitra that buries.** It is offered only at the Lokasi Mitra where the burial happens, fulfilled by that Lokasi Mitra (its own team or its own vendors, the Operator does not contract them), and bought only inside a **Pemesanan Saat Duka**, at most one per order. No Paket Pemakaman for a Pemesanan Terencana, a burial under an existing Hak Pakai, or a TPU, in this release.
- **Priced as a Tarif.** Admin Platform enters each Paket Pemakaman's price as a Tarif of that Lokasi Mitra (a version with a Tanggal Berlaku, never changed, only followed). The Operator remains the seller of record (ADR 0001): the price is a line on the Saat Duka Tagihan, pay-after like the rest of that Tagihan, under the same single Biaya Layanan Platform; the collected amount goes to the Lokasi Mitra in the same Pencairan as the Petak Makam once the Pemakaman is recorded.
- **Confirmed and done with the order.** Admin Lokasi confirms or declines the Paket Pemakaman together with the order (one decision, no separate queue), and recording the Pemakaman records the Paket as carried out. No photo proof per Komponen.
- **Cancellation follows the order.** A Saat Duka cancellation cancels the Paket with it; there is no separate Pembatalan of a Paket.
- **Kremasi deferred.** Cremation is a Tradisi only once a Lokasi Mitra with a crematorium partners; until then the closed list has Muslim and Nasrani only.
- **Visuals.** Paket Pemakaman pages show icons for the Komponen and plain cards per Tingkat, not photographs of headstones or cemetery grounds (owner feedback, 2026-11-02).

## Considered options

- **Operator-assembled packages with its own vendors** (new Mitra Jasa kinds for ambulance, catering, funeral homes): closest to a funeral organiser, but needs vendor onboarding, dispatch and quality control the Operator does not have; rejected for now.
- **Catalog with a "minta penawaran" form only**: fastest, but leaves the money outside the platform and the family without a Tagihan; rejected.
- **Extend Layanan with new `jenis` values**: reuses the catalog, but would force photo proof, target dates and Keluhan rules that do not fit an ambulance or a meal; rejected.

## Consequences

- New domain module `paket-pemakaman`, owning its tables; Tariffs holds its prices, Pemesanan adds its line to the Saat Duka quote and Tagihan, Payouts pays it with the Petak Makam.
- `CONTEXT.md` gains Paket Pemakaman, Tingkat Paket, Tradisi and Komponen Pemakaman.
- Data Contoh may plant "(Contoh)" Paket Pemakaman at its example Lokasi Mitra.

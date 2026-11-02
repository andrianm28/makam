# Paket Pemakaman

Status: ready-for-agent
Decision: ADR 0010 (`docs/adr/0010-paket-pemakaman-dari-lokasi-mitra.md`). Terms: `CONTEXT.md` (Paket Pemakaman, Tingkat Paket, Tradisi, Komponen Pemakaman). Where this spec and the v1 spec meet, the v1 spec's rules for a Pemesanan Saat Duka, Tagihan, Pencairan and Pembatalan hold unless a line below says otherwise.

## Problem

A family that has just lost someone needs more than a grave: transport of the body, washing and shrouding or dressing, the shroud or coffin, flowers, food for mourners, a place to receive them, and the paperwork. Funeral organisers sell this as tiered packages per faith. Makam sells only the grave and grave services, so the family has to find all of that elsewhere in the same few hours. The Lokasi Mitra we now focus on (TPS, Graha Sentosa) usually provide these services already.

## Solution

Each Lokasi Mitra can offer Paket Pemakaman: one per Tingkat Paket (Standar, Premium, VIP) and Tradisi (Muslim, Nasrani), each listing the Komponen Pemakaman it includes with the Lokasi's own short description and a price entered by Admin Platform as a Tarif. In the Saat Duka wizard, after the Jenis Makam, the family may pick one Paket Pemakaman for the Almarhum's Tradisi or none. It is billed pay-after on the Saat Duka Tagihan, confirmed with the order, done when the Pemakaman is recorded, and paid out to the Lokasi with the Petak Makam.

## User stories

1. As a Pemesan in the Saat Duka wizard, I see the Paket Pemakaman the chosen Lokasi Mitra offers for the Tradisi I pick, side by side per Tingkat Paket with their Komponen and prices, so I can choose one or none.
2. As a Pemesan, I see the Paket Pemakaman as its own line on the order summary and the Tagihan, under the one Biaya Layanan Platform.
3. As a visitor, I can read what each Tingkat Paket includes at a Lokasi Mitra on its public page before I start an order, shown with icons and plain cards, not photos of graves.
4. As Admin Platform, I create, edit and withdraw a Lokasi Mitra's Paket Pemakaman (Tingkat Paket, Tradisi, name, Komponen with descriptions) and set its price as a Tarif version with a Tanggal Berlaku; every write leaves an Entri Audit.
5. As Admin Lokasi, I see the chosen Paket Pemakaman and its Komponen on the order I confirm, and confirming or declining the order confirms or declines the Paket with it.
6. As Admin Lokasi, recording the Pemakaman records the Paket Pemakaman as carried out; no separate proof.
7. As a Pemesan who cancels a Saat Duka order, the Paket Pemakaman is cancelled with it under the order's own rules.
8. As the Lokasi Mitra, I am paid for the Paket Pemakaman in the same Pencairan as the Petak Makam.

## Rules

- A Lokasi Mitra offers at most one live Paket Pemakaman per (Tingkat Paket, Tradisi). A Paket needs at least one Komponen Pemakaman; each Komponen appears at most once, with a description of at most 160 characters.
- A Paket Pemakaman is offered (public, wizard) only when the Lokasi Mitra is listed, the Paket is not withdrawn and it has a Tarif in force at that moment.
- The price is the Tarif in force when the order is placed and is kept on the order; a later Tarif does not change an order already placed (same as the Petak Makam price).
- The QRIS cap and every Saat Duka total rule apply to the total including the Paket.
- At most one Paket Pemakaman per Pemesanan Saat Duka. None for a Pemesanan Terencana, a burial under an existing Hak Pakai, or a TPU.
- Withdrawing a Paket stops new orders; orders that already carry it continue.

## Out of scope

Kremasi; packages assembled by the Operator from its own vendors; per-Komponen proof, scheduling or Keluhan; choosing single Komponen à la carte; Paket Pemakaman on Pemesanan Terencana.

## Implementation decisions

- New module `src/domain/paket-pemakaman/` owning `paket_pemakaman` and `paket_pemakaman_komponen`; the closed lists (`tingkatPaketValues`, `tradisiValues`, `komponenPemakamanValues`) live in its `schema.ts` so a client may import them.
- Its price is a new Tariffs price book (`tariff_paket_pemakaman_version`, keyed by the paket id), entered only by Admin Platform like the other Lokasi tariffs.
- Pemesanan stores the chosen paket and its price on the order (expand-only columns), adds a line to the Saat Duka quote and Tagihan, and Payouts includes that line in the Lokasi's Pencairan.
- Tests in `CONTEXT.md` terms against the module's public functions and Pemesanan's, with a real Postgres.

## Tickets

`issues/01-katalog-paket-pemakaman.md`, `issues/02-paket-di-pemesanan-saat-duka.md`, `issues/03-halaman-paket-pemakaman.md`, `issues/04-data-contoh-paket-pemakaman.md`.

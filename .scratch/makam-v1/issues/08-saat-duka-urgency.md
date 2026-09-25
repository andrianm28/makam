# Speed and documents for Pemesanan Saat Duka

Type: grilling
Status: resolved
Blocked by: 04
Map: ../map.md

> **Amended by [Operator entity: PT Jaya Korpora Prima and YIEM's role](20-operator-entity.md)** (2026-09-25): read "YIEM" as the Operator (PT Jaya Korpora Prima), "Admin YIEM" as Admin Platform and "Petugas YIEM" as Petugas Lapangan. YIEM itself has left the product.

## Question

A burial often has to happen within 24 hours. What is the commitment time from booking to a confirmed Petak Makam, which documents must be uploaded before versus brought on the day, what happens outside working hours, and do we need a hold on the Petak Makam before payment?

## Answer

Decided with the user on 2026-09-25 and checked against [concept.md](../concept.md) (Booking Journey: Cari/Pilih Lokasi → Pilih Makam → Isi Data → Konfirmasi → Pembayaran → Bukti Booking).

1. **Scope**: the decisions below apply to Pemesanan Saat Duka at a **Lokasi Mitra**, where an Admin Lokasi assigns plots. At a **DKI TPU**, a Pemesanan Saat Duka is **Pengurusan** (the TPU assigns the plot and the Pemda issues the permit), as decided in [YIEM's current assets and records](./01-yiem-current-assets.md). That flow is its own ticket: [Pemesanan Saat Duka at a DKI TPU via Pengurusan](./15-saat-duka-tpu-pengurusan.md). _(Corrected on 2026-09-25: an earlier draft had ruled TPU out of scope, which contradicted ticket 01.)_
2. **Pilih Makam**: the Pemesan filters Lokasi Makam (city, Jenis Makam, price, availability, facilities, as the concept doc lists), chooses a **Jenis Makam** at a Lokasi, and may state a placement wish (e.g. "next to my father's grave"). The **Admin Lokasi assigns the specific Petak Makam** at confirmation. Choosing an exact plot is kept for Pemesanan Terencana.
3. **Isi Data**: required at submission are only the Pemesan's name and WhatsApp number and the Almarhum's name and date of death (KTP optional). Additional Layanan (e.g. flowers, headstone) can be added here; how the catalog works is settled in "Layanan catalog and Paket Layanan model".
4. **Konfirmasi**: the Admin Lokasi confirms within **2 hours during the Lokasi's operating hours**. Submissions are accepted 24/7. After hours, the submission screen shows the Lokasi's on-call contact, and confirmation comes no later than opening time; there is no promise of night-time confirmation. The confirmation shows the Nomor Pemesanan, the Lokasi details and assigned Petak Makam, the Admin Lokasi's contact, the checklist of documents to bring, and the status (Diajukan → Dikonfirmasi → …).
5. **Pembayaran**: payment never holds up a burial. The Admin Lokasi's confirmation locks the Petak Makam and issues the invoice straight away; payment is due within a set time after the burial (default 3×24 hours, set per Lokasi). The Lokasi carries the risk of non-payment.
6. **Bukti Pemesanan**: issued once payment has settled.
7. **Documents**: each Lokasi sets its own document checklist (default: the death certificate from the hospital or Puskesmas, the death report letter from the Lurah or RT/RW, and the KTP and KK of the Almarhum and the Pemesan). Documents can be uploaded later or brought on the day; the Admin Lokasi ticks each one off. Sources: [cemetery-plot-regulation.md §2.6](../research/cemetery-plot-regulation.md).

**Consistency review** (2026-09-25): "invoice" in this ticket is a **Tagihan** in the glossary set by "Invoice and payment proof for the Pemesan".

**Amended by [Lokasi Mitra order lifecycle](27-lokasi-mitra-order-lifecycle.md)** (2026-09-25): the full status list is Diajukan → Dikonfirmasi → Dimakamkan → Selesai, plus Ditolak / Dibatalkan, with the Tagihan status as a separate badge. Before confirming, the Admin Lokasi may offer an alternative or decline.

**Amended by "Admin Lokasi back office and Petugas Lapangan work"** (2026-09-25): operating hours are the Lokasi's **Jam Operasional** (weekly schedule + dated closures, edited by the Admin Lokasi); the on-call contact is its **Kontak Siaga**, which must be one of its Admin Lokasi.

**Final review** (2026-09-25): the filters listed here are superseded by "Homepage, search and Akun Saya": the Saat Duka list has a city filter plus a type chip, price and facilities appear where that ticket places them, and there is no separate Jenis Makam filter.

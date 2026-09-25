# Invoice and payment proof for the Pemesan

Type: grilling
Status: resolved
Blocked by: 05, 08
Map: ../map.md

> **Amended by [Operator entity: PT Jaya Korpora Prima and YIEM's role](20-operator-entity.md)** (2026-09-25): read "YIEM" as the Operator (PT Jaya Korpora Prima), "Admin YIEM" as Admin Platform and "Petugas YIEM" as Petugas Lapangan. YIEM itself has left the product.

## Question

YIEM is the seller of record for every order, and the brief requires an invoice to be issued at checkout and "bukti pembayaran" after payment. What does the Pemesan receive and when: one invoice per order, or separate ones for Petak Makam / Layanan / Pengurusan? Which lines does it show (Lokasi Mitra tariff, Biaya Layanan Platform, Pemda retribusi at cost, harga khusus), in whose name is it issued, and is it the same document as the booking proof (Bukti Booking) and the proof of Perpanjangan? What does a Lokasi Mitra or Mitra Jasa get as a record of each Pencairan?

Context from "Money flow and revenue model": PPN and tax treatment are out of scope (legal/tax compliance); this ticket is only about the documents the product issues.

Context from "Speed and documents for Pemesanan Saat Duka": for Saat Duka the invoice is issued at confirmation and due within 3×24 h after the burial, so the invoice and the Bukti Booking are issued at different moments there.

Context from "Petak Makam lifecycle": a Lokasi Mitra's tariff has two parts, the Harga Hak Pakai (per Jenis Makam) and the Biaya Pemakaman (on every burial, including one under an existing Hak Pakai). A burial under an existing Hak Pakai (Calon Penghuni's burial, tumpang, next plot in a Kavling Keluarga) is invoiced as Biaya Pemakaman + Biaya Layanan Platform only.

Context from "How Perpanjangan verifies the Pemegang Hak": at a DKI TPU the "surat bukti perpanjangan resmi" is the scan of the Pemda-issued IPTM; at a Lokasi Mitra it is still to be decided here. An invoice may be paid by someone other than the Pemegang Hak.

Context from "Tech stack for a solo engineer with AI agents": the gateway is SumoPod, whose payment link expires within 24 h, so the invoice is the platform's own record (with its own due date) and a SumoPod payment is created when the payer clicks Bayar. Pencairan and refunds are manual bank transfers by Admin YIEM with an uploaded transfer proof, which is the natural basis for the Lokasi Mitra / Mitra Jasa Pencairan record.

Context from "Layanan catalog and Paket Layanan model": one order = one Petak Makam with one or more Layanan; a recurring Paket Layanan issues one invoice per cycle (H-7, due H-1), each carrying its own Biaya Layanan Platform at a Lokasi Mitra; refunds on cancellation (until H-1) and after a Keluhan need a document too.

Context from "Pemesanan Saat Duka at a DKI TPU via Pengurusan": a TPU Saat Duka invoice shows the Pemda retribusi (Rp 0) and YIEM's Pengurusan fee (labelled a service fee, no Biaya Layanan Platform); issued at confirmation, due 3×24 h after the burial; the Pemda-issued IPTM scan is the official document and is handed over regardless of payment, separate from the Bukti Pemesanan.

## Answer

Resolved by grilling with the user (2026-09-25). New terms in `CONTEXT.md`: Tagihan, Bukti Pembayaran, Bukti Perpanjangan, Bukti Pengembalian Dana, Bukti Pencairan; Bukti Pemesanan narrowed.

**Documents the Pemesan receives**

1. **Tagihan**, one per **payment moment**, issued by YIEM as seller of record: the checkout (Petak Makam + any Layanan added there, one Biaya Layanan Platform line), each Perpanjangan, each standalone Layanan order, each Paket Layanan cycle, and each burial under an existing Hak Pakai (incl. the Terencana "Nanti" Biaya Pemakaman when the burial happens). No split by Petak Makam / Layanan / Pengurusan.
   - Addressed ("Ditagihkan kepada") to the Pemesan; for a Perpanjangan, to the Pemegang Hak. Anyone may pay; the payer's name is not recorded.
   - Lokasi Mitra lines: Harga Hak Pakai, Biaya Pemakaman, each Layanan (variant, target date), one Biaya Layanan Platform line; the Lokasi Mitra is named as provider of its tariff lines. TPU lines as in "Pemesanan Saat Duka at a DKI TPU via Pengurusan" (Pengurusan fee, Pemda retribusi at cost incl. Rp 0, Layanan).
   - **Harga Khusus** appears as the official tariff lines plus a negative **"Penyesuaian Harga Khusus"** line, never as silently changed prices.
   - **Immutable** once issued. Statuses: Belum Dibayar / Lunas / Lewat Jatuh Tempo / Dibatalkan, plus Dikembalikan (sebagian/penuh) after a refund. Any change (Harga Khusus added later, extra Layanan, wrong Jenis Makam) = cancel and reissue under a new number.
2. **Bukti Pembayaran**: a **separate** receipt, exactly one per settled Tagihan (full payment only). Standalone: repeats the Tagihan's lines, plus amount, method, time, reference and the Nomor Tagihan. Issued automatically when SumoPod confirms; the Tagihan then shows Lunas and links to it.
   - **Payment outside SumoPod**: Admin YIEM may mark a Tagihan paid by hand (Transfer manual / Tunai) with an uploaded proof, audited; this issues the same Bukti Pembayaran and triggers the same effects (Bukti Pemesanan, Pencairan due).
   - **Rp 0 Tagihan** (full Harga Khusus waiver): still issued, Lunas at once, with a Rp 0 Bukti Pembayaran, method "Tanpa pembayaran (Harga Khusus)", so every order follows Tagihan → Bukti Pembayaran → Bukti Pemesanan.
3. **Bukti Pemesanan**: the proof of the **right**, not of the money: Lokasi, Petak Makam, Pemegang Hak, masa Hak Pakai, Almarhum / Calon Penghuni, and the Nomor Tagihan, **no amounts**. Issued **in the Lokasi Mitra's name via makam.co.id** (the Lokasi grants the Hak Pakai), still once payment settles (per "Speed and documents for Pemesanan Saat Duka"). Amends "Booking flow prototype for a Lokasi Mitra", whose Bukti Pemesanan showed the itemised paid amount; that now lives on the Bukti Pembayaran.
4. **Bukti Perpanjangan** (Lokasi Mitra): the "surat bukti perpanjangan resmi": Petak Makam, Pemegang Hak, old and new end dates, terms bought; in the Lokasi Mitra's name, issued once paid (quick OTP path) or once approved and paid (manual path). A separate document, not a reissued Bukti Pemesanan. At a DKI TPU the IPTM scan stays the proof.
5. **Bukti Pengembalian Dana**: on each refund transfer by Admin YIEM (cancellation, Keluhan): own number, references the Tagihan, lists refunded lines and whether the Biaya Layanan Platform was kept, attaches the transfer proof.

**Pencairan records (Lokasi Mitra, Mitra Jasa)**

- Each order / job still becomes **due** for Pencairan individually (rules unchanged from "Money flow and revenue model"), but Admin YIEM may **batch several due Pencairan to the same partner into one bank transfer**, at a cadence Admin YIEM chooses (e.g. daily).
- One **Bukti Pencairan** per transfer lists every order or job it covers (Nomor Pemesanan / Nomor Tagihan, tariff lines, amount), the total and the uploaded transfer proof; visible in the partner's back office.
- The Mitra Jasa version shows only job, Layanan, date and rate, never family contacts or the price charged to the Pemesan.
- **Who bears a Harga Khusus**: Admin YIEM records the split per order; default is that YIEM bears the whole reduction (platform fee first, then its own funds) and the Lokasi Mitra's Pencairan stays the full tariff. If a partner agrees offline to share it, Admin YIEM records the lower Pencairan amount.

**Format, delivery, numbering**

- Every document is a web page on an unguessable link with **Unduh PDF**, listed in Akun Saya (or the partner back office), link sent by message (channel per "Notification channels and WhatsApp provider").
- Sequential number series per document type per year: `TGH/2026/000123` (Tagihan), `BYR/…` (Bukti Pembayaran), `RFD/…` (Bukti Pengembalian Dana), `BKP/…` (Bukti Pencairan); Nomor Pemesanan unchanged.

**Amended by "Unpaid Saat Duka Tagihan at a Lokasi Mitra"** (2026-09-25): new Tagihan status **Tidak Tertagih** (declared by Admin Platform, from H+30, still payable afterwards). New manual payment method **"Dibayar langsung ke Lokasi Mitra"**, recorded by the Admin Lokasi with proof (Admin Platform can reverse); its Bukti Pembayaran says the money was received by that Lokasi Mitra.

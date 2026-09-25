# Invoice and payment proof for the Pemesan

Type: grilling
Status: open
Blocked by: 05, 08
Map: ../map.md

## Question

YIEM is the seller of record for every order, and the brief requires an invoice to be issued at checkout and "bukti pembayaran" after payment. What does the Pemesan receive and when: one invoice per order, or separate ones for Petak Makam / Layanan / Pengurusan? Which lines does it show (Lokasi Mitra tariff, Biaya Layanan Platform, Pemda retribusi at cost, harga khusus), in whose name is it issued, and is it the same document as the booking proof (Bukti Booking) and the proof of Perpanjangan? What does a Lokasi Mitra or Mitra Jasa get as a record of each Pencairan?

Context from "Money flow and revenue model": PPN and tax treatment are out of scope (legal/tax compliance); this ticket is only about the documents the product issues.

Context from "Speed and documents for Pemesanan Saat Duka": for Saat Duka the invoice is issued at confirmation and due within 3×24 h after the burial, so the invoice and the Bukti Booking are issued at different moments there.

Context from "Petak Makam lifecycle": a Lokasi Mitra's tariff has two parts, the Harga Hak Pakai (per Jenis Makam) and the Biaya Pemakaman (on every burial, including one under an existing Hak Pakai). A burial under an existing Hak Pakai (Calon Penghuni's burial, tumpang, next plot in a Kavling Keluarga) is invoiced as Biaya Pemakaman + Biaya Layanan Platform only.

Context from "How Perpanjangan verifies the Pemegang Hak": at a DKI TPU the "surat bukti perpanjangan resmi" is the scan of the Pemda-issued IPTM; at a Lokasi Mitra it is still to be decided here. An invoice may be paid by someone other than the Pemegang Hak.

Context from "Tech stack for a solo engineer with AI agents": the gateway is SumoPod, whose payment link expires within 24 h, so the invoice is the platform's own record (with its own due date) and a SumoPod payment is created when the payer clicks Bayar. Pencairan and refunds are manual bank transfers by Admin YIEM with an uploaded transfer proof, which is the natural basis for the Lokasi Mitra / Mitra Jasa Pencairan record.

Context from "Layanan catalog and Paket Layanan model": one order = one Petak Makam with one or more Layanan; a recurring Paket Layanan issues one invoice per cycle (H-7, due H-1), each carrying its own Biaya Layanan Platform at a Lokasi Mitra; refunds on cancellation (until H-1) and after a Keluhan need a document too.

Context from "Pemesanan Saat Duka at a DKI TPU via Pengurusan": a TPU Saat Duka invoice shows the Pemda retribusi (Rp 0) and YIEM's Pengurusan fee (labelled a service fee, no Biaya Layanan Platform); issued at confirmation, due 3×24 h after the burial; the Pemda-issued IPTM scan is the official document and is handed over regardless of payment, separate from the Bukti Pemesanan.

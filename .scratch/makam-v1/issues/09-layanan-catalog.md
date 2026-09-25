# Layanan catalog and Paket Layanan model

Type: grilling
Status: resolved
Map: ../map.md

> **Amended by [Operator entity: PT Jaya Korpora Prima and YIEM's role](20-operator-entity.md)** (2026-09-25): read "YIEM" as the Operator (PT Jaya Korpora Prima), "Admin YIEM" as Admin Platform and "Petugas YIEM" as Petugas Lapangan. YIEM itself has left the product.

## Question

How is the catalog structured: is a Layanan's price set per Lokasi by the Admin Lokasi, or globally by Admin YIEM? Is a Paket Layanan a one-off bundle or a recurring subscription (monthly/yearly)? What proves a Layanan is done (a mandatory photo/video report)? Can a Layanan be ordered for any Petak Makam, or only ones managed on the platform?

Context from "YIEM's current assets and records": Layanan at a Lokasi Mitra is fulfilled by its Admin Lokasi; at a DKI TPU by a Mitra Jasa (paid a fixed rate per Layanan type). Photo proof is uploaded by whoever fulfils it. So "any Petak Makam" now includes TPU plots that the platform does not inventory.

Context from "Money flow and revenue model": YIEM collects every Layanan payment. At a Lokasi Mitra, the Admin Lokasi's price is paid out to the partner (Pencairan) once the photo proof is uploaded, and the Biaya Layanan Platform is added once per order. At a TPU, the Pemesan's price minus the Mitra Jasa's fixed rate is YIEM's margin, and the Mitra Jasa is paid once Admin YIEM approves the photo proof.

## Answer

Resolved by grilling with the user (2026-09-25). Terms added to `CONTEXT.md`: Layanan (catalog item), Pekerjaan Layanan, Paket Layanan (with frequency), Keluhan.

**Catalog**
- **One global list of Layanan**, kept by Admin YIEM; each Lokasi Mitra switches on the ones it offers. v1 list follows the brief: Bunga Ziarah / Bunga Pemakaman, Batu Nisan (pesan + pasang), Pembersihan Makam, Perawatan Rumput & Taman, Laporan Foto/Video Kondisi Makam. No custom items per Lokasi in v1.
- A Layanan may have **fixed-price variants** (e.g. Nisan Granit 60 cm / Marmer 80 cm, bunga sizes) and free-text fields where needed (nisan inscription). No quote / custom-price flow: every price is known before checkout.
- Each Layanan type carries a **minimum lead time** (e.g. Bunga 1 day, Pembersihan 3 days, Nisan 14 days) and a **"bisa hari-H"** flag.
- At TPU, nisan variants must respect the Pemda's rules on nisan; Admin YIEM configures only compliant variants.

**Prices**
- **Lokasi Mitra**: Layanan prices are part of the partnership agreement, entered and changed only by Admin YIEM; the Admin Lokasi sees them but cannot edit.
- **TPU (DKI)**: one DKI-wide Pemesan price per Layanan (variant) and one Mitra Jasa rate per Layanan (variant); YIEM's margin is the difference.
- **Paket Layanan price** = sum of that Lokasi's (or DKI TPU's) prices for its items; a Paket is offered only where every item in it is offered. No bundle discount.
- **Biaya Layanan Platform** (Lokasi Mitra only): once per invoice. A Layanan added to a Pemesanan Makam or Perpanjangan checkout shares that order's fee; a standalone Layanan order pays one fee; a recurring Paket pays it on every cycle invoice.
- **One order = one Petak Makam** with one or more Layanan; no cart across graves.

**Paket Layanan**
- Defined by Admin YIEM: contents + frequency, one of **sekali, bulanan, 3-bulanan, tahunan**. One-off bundles (e.g. Paket Ziarah Lebaran) and recurring care use the same model.
- Recurring cycle: invoice issued **H-7** before the cycle's target date, due **H-1**. Unpaid → that cycle's Pekerjaan Layanan are **not created** (never done on credit). **Two skipped cycles in a row → Paket paused**; the Pemesan can resume.
- No minimum commitment; the Pemesan can stop any time (effective from the next unissued cycle). Stops automatically when the Hak Pakai becomes Berakhir. Auto-debit is opt-in (per "Payment gateways and split payments in Indonesia").

**Pekerjaan Layanan** (one Layanan at one Petak Makam on one target date)
- **Scheduling**: the Pemesan picks a target date respecting the lead time; the fulfiller must finish within **±2 days**. No time slots. Recurring cycles count from the Paket's start date.
- **Statuses shown to the Pemesan** (the brief's "transparansi status layanan"): Menunggu Pembayaran → Dijadwalkan → Sedang Dikerjakan → (TPU only: Menunggu Verifikasi) → Selesai; side states Terlambat, Dibatalkan, Keluhan.
- **Proof of done**: at least one **"sesudah" photo taken in-app with timestamp**; plus a **"sebelum"** photo for Pembersihan and Perawatan Rumput & Taman. Video optional, except mandatory for the Laporan Foto/Video Layanan. Proof is shown on the order and sent to the Pemesan (channel: see "Notifications" fog).
- **Who confirms**: at a Lokasi Mitra the Admin Lokasi's upload marks it Selesai and triggers Pencairan; at a TPU Admin YIEM approves the Mitra Jasa's proof, which triggers Pencairan (per "Money flow and revenue model").
- **TPU assignment**: Admin YIEM assigns each job to a Mitra Jasa by hand; the Mitra Jasa accepts or declines in their app; a decline returns it to Admin YIEM. No auto-dispatch or open job board.
- **Cancellation by the Pemesan**: until **H-1** before the target date or until "Sedang Dikerjakan", whichever comes first. The item amount is refunded in full; the Biaya Layanan Platform is kept. Admin YIEM approves the refund.
- **Late**: target date + 2 days without proof → **Terlambat**, flagged to Admin YIEM and the fulfiller. Admin YIEM may reassign (TPU) or cancel with a full refund including the platform fee (the fulfiller's fault).
- **Keluhan**: the Pemesan may file one within **3×24 h** of the proof. Admin YIEM decides: free redo by the fulfiller, or refund. At a Lokasi Mitra a refund after Pencairan is settled offline with the partner. Mitra Jasa quality control and sanctions stay in the "Mitra Jasa operations" fog.

**Which graves, who may order**
- **Lokasi Mitra**: only Petak Makam on the platform, found by Nomor Makam / Nomor Kavling or Almarhum, with the same lookup as Perpanjangan (Pemegang Hak never exposed). **Anyone may order**; no Pemegang Hak check. The Hak Pakai must not be Berakhir.
- **TPU (DKI)**: the Pemesan describes the grave: TPU, blok/nomor, Almarhum name and date of death, optional photo of the grave/nisan and map pin. The Mitra Jasa confirms the grave on the first visit; a confirmed grave is reused for later orders.
- **Non-partner private cemeteries**: not supported in v1.
- **Saat Duka checkout** (Lokasi Mitra or TPU Pengurusan): only Layanan flagged "bisa hari-H" (e.g. bunga tabur, karangan bunga) can be added, targeted at the burial. Other Layanan (nisan, recurring care) are ordered later on the same Petak Makam, reachable from the Bukti Pemesanan.
- **Terencana / Perpanjangan checkout**: any Layanan may be added, subject to lead time; on a Terencana plot with no Pemakaman yet, only Layanan that make sense on an empty plot (e.g. Pembersihan, Perawatan Rumput & Taman, Laporan Foto) are offered.

**Amended by "Tech stack for a solo engineer with AI agents"** (2026-09-25): no auto-debit in v1 (SumoPod); every recurring cycle is paid through its own invoice.

**Terminology** (2026-09-25): "invoice" above is a **Tagihan** in the glossary set by "Invoice and payment proof for the Pemesan" (one Tagihan per Paket cycle).

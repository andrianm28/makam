# Booking flow prototype for a Lokasi Mitra

Type: prototype
Status: resolved
Blocked by: 06, 08, 09
Map: ../map.md

## Question

How should the Pemesan's journey look on a phone, from Cari Lokasi to Bukti Pemesanan, for both Pemesanan Saat Duka (choose a Jenis Makam; the Admin Lokasi assigns the plot) and Pemesanan Terencana (choose an exact Petak Makam or Kavling Keluarga with a 24 h hold)? Where do the Lokasi's tariff, the Biaya Layanan Platform and added Layanan appear so the price is transparent before checkout? A rough clickable prototype to react to.

Context from "Petak Makam lifecycle" (merged answer): the price shown splits into Harga Hak Pakai + Biaya Pemakaman; the Pemegang Hak defaults to the Pemesan but can be someone else; a released plot still holding a burial is offered only as tumpang, never as an empty plot; a burial under an existing Hak Pakai starts from a Nomor Makam or Nomor Kavling.

Context from "Layanan catalog and Paket Layanan model": Layanan come from one global list with fixed-price variants; a Saat Duka checkout offers only "bisa hari-H" Layanan; one Biaya Layanan Platform line per invoice covers the plot and any added Layanan; each added Layanan needs a target date respecting its lead time.

## Answer

Decided with the user on 2026-09-25 by reacting to a clickable prototype. **Prototype (primary source):** branch `prototype/18-booking-flow`, file `.scratch/makam-v1/prototypes/18-booking-flow/index.html` (open with `git show prototype/18-booking-flow:.scratch/makam-v1/prototypes/18-booking-flow/index.html > /tmp/p.html`); private artifact https://claude.ai/artifact/F7i4Neh9p7sDLV9tF1HNfU. Four variants: A wizard, B one-page Lokasi checkout, C triage questions, D = A shortened with C's pricing. **D was chosen.** Wording and layout in the prototype are rough; the flow and price placement are what was decided.

**Shape: a short wizard, split on the home screen**

- The home screen has three entry points: **Keluarga baru saja wafat** (Pemesanan Saat Duka), **Siapkan makam untuk nanti** (Pemesanan Terencana), and a smaller link **Sudah punya makam keluarga?** (a burial under an existing Hak Pakai, starting from a Nomor Makam / Nomor Kavling).
- One decision per screen, a progress bar with back, and a sticky bottom bar with the total and the CTA. **There is no separate review screen**: the last screen is "Data & kirim".
- Saat Duka, new plot (2 screens): **Pilih makam → Data & kirim.**
  - *Pilih makam* is one list of Lokasi × Jenis Makam cards, all Lokasi together, with a city filter, sorted by all-in total (cheapest first). Only cards with Tersedia units are shown, each with its count. When the office is closed, the card says when confirmation will come and that an on-call contact is available. Tapping a card moves to the next screen.
  - *Data & kirim* asks for the Pemesan's name and WhatsApp, the Almarhum's name and date of death, and optionally the planned burial time and a placement wish. It also has the Pemegang Hak choice (default "Saya sendiri", else name + WhatsApp) and optional "bisa hari-H" Layanan for the burial day. Copy says nothing is paid now and documents can follow.
- Terencana (3 screens): **Lokasi → Petak → Data & kirim.**
  - *Lokasi* cards show an all-in price range and the Tersedia count.
  - *Petak* is a plot map per blok. The Pemesan taps Tersedia petak or Kavling Keluarga, and may pick several. Dipesan, Terisi and Tidak Tersedia plots can't be picked. A tumpang-only plot says to contact the Admin Lokasi.
  - *Data & kirim* has the Pemesan, the Calon Penghuni (default "untuk saya sendiri") and the Pemegang Hak. It offers empty-plot Layanan with a target date that respects each lead time. When more than one petak is picked, Layanan are hidden and ordered later per grave.
- Existing family grave (3 screens): **Lokasi → Nomor → Data & kirim.**
  - *Nomor* looks up the Nomor Makam / Nomor Kavling and shows what was found without the Pemegang Hak. It explains that only the Pemegang Hak or someone they allow may request it, and that the Admin Lokasi checks consent and the tumpang rules.
  - *Data & kirim* asks for the Almarhum and the Pemesan only; there is no Pemegang Hak step, since no new Hak Pakai is created.

**Price transparency: all-in totals**

- Everywhere a price is shown before checkout, the **headline figure is the total the Pemesan will pay**, including the Biaya Layanan Platform. The parts (Harga Hak Pakai + Biaya Pemakaman + Biaya Layanan Platform, plus each Layanan) are shown in small print under the figure. The bottom bar reads "Total semua biaya" and expands to the itemised lines.
- In Terencana, the headline covers Harga Hak Pakai + Biaya Layanan Platform (+ Layanan). The **Biaya Pemakaman appears as a separate "Nanti" line**, outside the total, because it is paid at the burial.
- There is still exactly one Biaya Layanan Platform line per order (per "Layanan catalog and Paket Layanan model").

**After Kirim** (accepted as prototyped, not compared across variants)

- *Diajukan* shows the Nomor Pemesanan and a status timeline.
  - Saat Duka shows the confirmation deadline (2 h). After hours it shows the opening-time promise and the on-call contact instead.
  - Terencana says the plot is held for 24 h after confirmation.
- *Dikonfirmasi* shows the assigned Petak Makam, then the invoice and the choice of payment method.
  - Saat Duka also shows the document checklist and the payment deadline (3×24 h after the burial, per Lokasi), with "the burial goes ahead regardless".
  - Terencana also shows the hold deadline.
- *Bukti Pemesanan* shows the Lokasi, the Petak, the Almarhum or Calon Penghuni, the Pemegang Hak, the masa Hak Pakai, the itemised paid amount, the Admin Lokasi's contact, and an entry point to order Layanan (nisan, perawatan) for that grave. Invoice content itself is "Invoice and payment proof for the Pemesan".

**Rejected**: B (one long Lokasi page acting as checkout); C's conversational one-question-per-screen format (only its all-in pricing and combined Lokasi × Jenis list were kept); A's separate Jenis, Layanan and Ringkasan steps and its "mulai Rp X + fees in small print" pricing.

## Comments

- 2026-09-25: Prototype built: [prototypes/18-booking-flow/index.html](../prototypes/18-booking-flow/index.html) (also a private artifact: https://claude.ai/artifact/F7i4Neh9p7sDLV9tF1HNfU). Three variants: A "Langkah demi langkah" (wizard + sticky total), B "Halaman Lokasi = kasir" (one-page Lokasi checkout + nota), C "Tanya dulu" (triage questions, all-in totals). Awaiting the user's reaction.
- 2026-09-25: User picked A made shorter (→ variant D), price as in C, split on the home screen; no concerns about the after-hours Saat Duka experience. Prototype moved to branch `prototype/18-booking-flow` (commit 01ef38e). Resolved.

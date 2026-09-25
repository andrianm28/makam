# Petak Makam lifecycle

Type: grilling
Status: resolved
Blocked by: 01, 04
Map: ../map.md

> **Amended by [Operator entity: PT Jaya Korpora Prima and YIEM's role](20-operator-entity.md)** (2026-09-25): read "YIEM" as the Operator (PT Jaya Korpora Prima), "Admin YIEM" as Admin Platform and "Petugas YIEM" as Petugas Lapangan. YIEM itself has left the product.

## Question

What states does a Petak Makam pass through (e.g. tersedia → dipesan → terisi → masa berlaku habis → diperpanjang / dikosongkan), how do Pemesanan Saat Duka and Pemesanan Terencana move it between them, how is tenure counted, and how are tumpang (layered) burials and Petak Makam belonging to families modelled?

Context from "YIEM's current assets and records": the lifecycle applies to Petak Makam at **Lokasi Mitra** only (the platform is their system of record). TPU plots are not inventoried; a TPU Pengurusan only records the Pemda-issued permit and its expiry.

## Answer

Decided with the user on 2026-09-25 and checked against [concept.md](../concept.md) (Booking Journey filters by "ketersediaan"; Perpanjangan looks up "data almarhum / nomor makam" and lets the user "pilih durasi/periode"). Applies to **Lokasi Mitra** only; TPU plots are not inventoried. _Two sessions resolved this ticket at the same time; this answer merges both, with the conflicts settled by the user (2026-09-25)._

**Three records**

- **Petak Makam**: the physical plot (Nomor Makam, Jenis Makam, block).
- **Hak Pakai**: the right to use **1..n Petak Makam** (1 for a normal plot, N for a Kavling Keluarga), with one Pemegang Hak, an optional Calon Penghuni (Terencana), a start date, an end date (empty = perpetual), a status `Aktif` / `Kedaluwarsa` / `Berakhir` / `Dibatalkan`, and a history of Perpanjangan and Ganti Pemegang Hak. Ending a Hak Pakai is final; the next sale creates a new one.
- **Pemakaman**: one burial of one Almarhum on one Petak Makam (date, layer). Several on one Petak = tumpang.

**Petak Makam status** (derived from Hak Pakai + Pemakaman; only `Tidak Tersedia` is set by hand)

- `Tersedia`: no active Hak Pakai and no Pemakaman.
- `Dipesan`: an `Aktif` Hak Pakai (or a Terencana payment hold) and no Pemakaman yet.
- `Terisi`: holds at least one Pemakaman. Stays `Terisi` after its Hak Pakai ends, until the Admin Lokasi records a pembongkaran (done offline). If the Lokasi allows tumpang on released plots, such a plot can be sold **only as tumpang** (subject to the minimum years since the last burial), never listed as an empty plot.
- `Masa Berlaku Habis`: the Hak Pakai is `Kedaluwarsa` (during and after the masa tenggang, until ended or extended).
- `Tidak Tersedia`: blocked by the Admin Lokasi with a free-text reason (path, damage, reserved for the operator); only when there is no active Hak Pakai.
- Search availability = count of `Tersedia` units per Jenis Makam (a Kavling Keluarga counts as one unit).

**Tenure**

- Set **per Jenis Makam** in the partnership agreement: "Selamanya" (default) or "N tahun, dapat diperpanjang" with its own Perpanjangan tariff.
- The clock starts at the **first Pemakaman** under the Hak Pakai; a Pemesanan Terencana holds the plot with no clock running. A tumpang does **not** reset the clock.
- **Perpanjangan** (fixed-term only): the Pemegang Hak picks 1–K terms (K per Lokasi, default 1); the new end date = old end date + terms × N (never counted from the payment date). Open from 3 months before expiry to the end of the masa tenggang (per Lokasi). A perpetual Hak Pakai shows "berlaku selamanya".
- **Expiry**: after the end date the Hak Pakai is `Kedaluwarsa`, with a **masa tenggang** (per Lokasi, default 3 months) in which Perpanjangan still works. After it the platform does **nothing automatically**; the Admin Lokasi ends the Hak Pakai by hand (`Berakhir`, with a reason). Reminders: see the Notifications fog.

**Prices**

- **Harga Hak Pakai** per Jenis Makam, for a new Hak Pakai.
- **Biaya Pemakaman** per Lokasi, charged on **every** burial, including those under an existing Hak Pakai (the Calon Penghuni's burial, the next plot in a Kavling Keluarga, tumpang; the Lokasi may set a different amount for tumpang). A burial under an existing Hak Pakai pays only the Biaya Pemakaman plus the Biaya Layanan Platform.

**How journeys move a plot**

- **Saat Duka (new plot)** (per "Speed and documents for Pemesanan Saat Duka"): the Admin Lokasi's confirmation assigns the Petak and creates the Hak Pakai `Aktif` → `Dipesan`. Recording the Pemakaman after the burial → `Terisi`. An unpaid invoice does not revoke the Hak Pakai (see the "Unpaid Saat Duka invoices" fog). Cancelled before the burial → Hak Pakai `Dibatalkan` → `Tersedia`.
- **Terencana**: the Pemesan picks an exact Petak Makam or Kavling Keluarga. The Admin Lokasi confirms and it is **held** (`Dipesan`) until the invoice expires (default 24 h, per Lokasi); unpaid → `Tersedia`; paid → Hak Pakai with the Calon Penghuni recorded, who becomes the Almarhum when their Pemakaman is recorded. One order may contain several Petak Makam (each its own Hak Pakai, same Pemegang Hak). A paid Terencana is cancelled only through a refund approved by Admin YIEM → `Dibatalkan` → `Tersedia`; refund terms: "Pemesanan Terencana contract terms".
- **Burial under an existing Hak Pakai** (the Calon Penghuni dies, tumpang, the next plot in a Kavling Keluarga): a Pemesanan Saat Duka naming a Nomor Makam or Nomor Kavling. Only the Pemegang Hak or someone they consent to may request it; the Admin Lokasi checks consent and, for tumpang, the Lokasi's policy ("boleh tumpang", minimum years since the last burial, maximum layers). Adds a Pemakaman; no new Hak Pakai.
- **Pemegang Hak at creation**: defaults to the Pemesan; the Pemesan may name someone else (name + WhatsApp), including the Calon Penghuni. Never the Almarhum.

**Families**

- Several separate plots: one Hak Pakai each, same Pemegang Hak, bought in one order if wanted.
- **Kavling Keluarga**: a Jenis Makam that the Admin Lokasi defines as a **fixed group of N adjacent Petak Makam** (Nomor Kavling; a double plot = a Kavling of 2), sold as one unit at one price → one Hak Pakai covering all N. **Indivisible**: Ganti Pemegang Hak, Perpanjangan (one clock, from the first burial in any of its plots) and ending apply to the whole kavling. The Admin Lokasi may split it only while it has no Hak Pakai. Each plot keeps its own status and Pemakaman; the kavling's status is derived (`Tersedia` / `Dipesan` / `Terpakai sebagian` / `Penuh`), and listings show the plots as a group.

**Ganti Pemegang Hak** (inheritance or sale): an Admin Lokasi action on the **same** Hak Pakai, with supporting documents, an optional transfer fee per Lokasi (collected offline in v1) and a history log; no self-serve flow in v1. Terencana transfer rules: "Pemesanan Terencana contract terms". Proving who the Pemegang Hak is: "How Perpanjangan verifies the Pemegang Hak".

**Import**: a Hak Pakai may be imported without the Pemegang Hak's contact details or with an empty end date, flagged `Perlu Verifikasi` until the Admin Lokasi completes it (at the latest at the first Perpanjangan or Layanan on it). An empty end date does not mean perpetual unless the Jenis Makam is perpetual.

**Amended by "Pemesanan Terencana contract terms"** (2026-09-25): the Calon Penghuni is an optional label per Petak Makam (a Kavling Keluarga may list several), which the Pemegang Hak can change freely; it does not limit who may be buried. An unused Hak Pakai can also end by **Pengembalian Hak Pakai** (`Berakhir`, reason "dikembalikan").

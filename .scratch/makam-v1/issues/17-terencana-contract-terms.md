# Pemesanan Terencana contract terms

Type: grilling
Status: resolved
Blocked by: 06
Map: ../map.md

> **Amended by [Operator entity: PT Jaya Korpora Prima and YIEM's role](20-operator-entity.md)** (2026-09-25): read "YIEM" as the Operator (PT Jaya Korpora Prima), "Admin YIEM" as Admin Platform and "Petugas YIEM" as Petugas Lapangan. YIEM itself has left the product.

## Question

What does the platform promise and enforce for a paid Pemesanan Terencana before anyone is buried? Can the Pemesan cancel and get a refund (and does the answer change with time, or after YIEM's Pencairan to the Lokasi Mitra)? Can the right be transferred to someone else before use, with which documents and fee (per Lokasi)? Can the Calon Penghuni be changed? What happens when the Calon Penghuni dies and is buried elsewhere: does the Hak Pakai stay, can it be resold or returned to the Lokasi?

Context from "Petak Makam lifecycle": a Hak Pakai carries the Calon Penghuni; transfers are an Admin Lokasi action "Ganti Pemegang Hak"; a Kavling Keluarga is indivisible. From "Money flow and revenue model": Admin YIEM approves refunds; after Pencairan refunds are settled offline with the partner. Legal enforceability is out of scope.

## Answer

Decided with the user by grilling on 2026-09-25. Applies to a paid Pemesanan Terencana at a **Lokasi Mitra**; TPUs take no Terencana ("Regulation of cemetery plots and tenure"). Legal enforceability stays out of scope.

**Syarat Pemesanan Terencana**: the terms below, filled in with the Lokasi's own values, are shown before Kirim and saved on the order. The terms in force at payment apply for the life of that Hak Pakai, even if the Lokasi changes its policy later.

**Pembatalan (cancel and refund)**

- The policy is **per Lokasi Mitra**, set in the partnership agreement:
  - a **Masa Pembatalan** of N days after payment (default 7) with a 100% refund of the tariff;
  - after that, a fixed percentage until the first Pemakaman (default 0%).
- No Pembatalan once any Pemakaman is recorded under the Hak Pakai.
- The Biaya Layanan Platform is never refunded on a Pembatalan, because the Pemesan caused it ("Money flow and revenue model").
- The platform works out the amount; Admin YIEM approves every refund, as before.
- **Who**: only the **Pemegang Hak** may ask for a Pembatalan, from Akun Saya. The refund goes to the **Pemesan who paid**, to a bank account the Pemesan enters (Bukti Pengembalian Dana as usual).
- After a Ganti Pemegang Hak, Pembatalan is no longer possible. The only ways out are Pengembalian Hak Pakai or another Ganti Pemegang Hak.
- Result: Hak Pakai `Dibatalkan` → Petak Makam `Tersedia`.

**Pencairan timing (amends "Money flow and revenue model")**

- The Pencairan for a Terencana Hak Pakai is due when the **Masa Pembatalan ends**, or at the first Pemakaman if that comes sooner, not at confirmation. A Pembatalan inside the window therefore never needs money back from the partner.
- For a Pembatalan after the window, YIEM pays the refundable percentage to the Pemesan and **deducts it from that Lokasi Mitra's next Pencairan**, shown on the Bukti Pencairan. The partner keeps exactly what its policy lets it keep.

**Transfer before use**

- Through the normal **Ganti Pemegang Hak** (Admin Lokasi action); no Terencana-specific flow.
- Documents: a surat pernyataan pengalihan signed by both parties plus both KTPs, or heirship documents if the Pemegang Hak has died.
- Fee: the per-Lokasi transfer fee, collected offline. Any sale price between the two parties stays off the platform.
- A Lokasi may forbid sale transfers through a flag in its agreement; transfers by inheritance are always allowed.
- Blocked while a Pembatalan request is open.

**Calon Penghuni**

- Only a label: optional, one per Petak Makam (a Kavling Keluarga may list several).
- The Pemegang Hak changes it at any time, free, from Akun Saya; the Lokasi is notified but does not review it.
- It restricts nothing: who may be buried is decided by the Pemegang Hak's consent (the check in "Petak Makam lifecycle"), not by the name recorded.

**Calon Penghuni buried elsewhere / plot never used**

- The Hak Pakai stays `Aktif` indefinitely with the Pemegang Hak (the tenure clock starts only at the first Pemakaman). They may use it for someone else or transfer it.
- **Pengembalian Hak Pakai**: the Pemegang Hak asks to give the unused Hak Pakai back; the Admin Lokasi ends it (`Berakhir`, reason "dikembalikan") → `Tersedia`. Any compensation is agreed offline between the Pemegang Hak and the Lokasi, never paid through YIEM.
- No automatic lapse for disuse.

**Biaya Pemakaman later**

- Not locked. It is charged at the Lokasi's rate on the day of the burial. The booking flow's "Nanti" line reads "sesuai tarif saat pemakaman (saat ini Rp X)".

**Orders with several plots**

- Each Hak Pakai in the order is cancelled, transferred or returned on its own, with its own refund.
- A Kavling Keluarga is all-or-nothing.

**If the Lokasi Mitra partnership ends**

- The terms state that the Hak Pakai is a right against the **Lokasi Mitra**, not YIEM (consistent with the Bukti Pemesanan in the partner's name).
- When a partnership ends: every Pemegang Hak is notified and can download their Bukti Pemesanan, and the Lokasi gets an export of its records. YIEM guarantees no refund.
- Pencairan still held back is released to the partner, except for Pemesan who cancel within their Masa Pembatalan, who are refunded.

# Pembatalan of a paid Pemesanan Terencana

Status: ready-for-agent
Blocked by: 31, 37
Spec: Domain modules > 6. Pemesanan (Requests from the Pemegang Hak: Pembatalan); 14. Work Queues (Tier 3 Pembatalan refund approval); stories 102, 107, 125 (Pembatalan)

## What to build

In Akun Saya's Makam tab, the Pemegang Hak of a Terencana Hak Pakai can "Ajukan Pembatalan", seeing the refund under the Lokasi's snapshot policy. The request becomes an Antrean Lokasi row due in 2 working days; the Admin Lokasi confirms there is no Pemakaman; the refund is computed (100% of the tariff within the Masa Pembatalan, else the set %; the Biaya Layanan Platform is never refunded) and a Tier 3 "Pembatalan refund approval" row is created for Admin Platform. The refund goes to the Pemesan who paid, to a bank account that Pemesan enters. The Hak Pakai becomes Dibatalkan and the plots become Tersedia.

## Acceptance criteria

- [ ] "Ajukan Pembatalan" is shown only for a Terencana Hak Pakai with no Pemakaman and no earlier Ganti Pemegang Hak; it shows the computed refund before submitting.
- [ ] The refund uses the Syarat snapshot on the order, not the Lokasi's current policy.
- [ ] Antrean Lokasi row due in 2 working days (the Lokasi's Jam Operasional calendar, ticket 11); the Admin Lokasi confirms no Pemakaman (or declines with a reason).
- [ ] The Pemesan who paid (who may differ from the Pemegang Hak) is asked by email (and on the order page) to enter a bank account; the refund request goes into ticket 31's flow; Tier 3 approval row due in 2 working days (Admin Platform calendar).
- [ ] If the Terencana Pencairan was already paid out, the refunded tariff becomes a Potongan.
- [ ] On completion: Hak Pakai Dibatalkan, Petak Tersedia, order Dibatalkan (Pembatalan).
- [ ] Tests: 100% inside the Masa Pembatalan, set % after; Biaya Layanan Platform never refunded; blocked after a Ganti Pemegang Hak or a Pemakaman; refund to the paying Pemesan; Potongan when already paid out.

## Added (2026-09-25)

- [ ] Pembatalan request statuses: Diajukan → (Perlu Perbaikan ↺ Diajukan) → Disetujui | Ditolak | Dibatalkan (by the requester before a decision); the Antrean Lokasi row exists while Diajukan, due 2 working days (Lokasi calendar).

## Comments

- 2026-09-26 — ADR 0004: the bank-account request goes by email, not WhatsApp; for an order with no email it becomes a Telepon Pemesan row.
- 2026-09-29 — **Built** on `origin/main` e060da2, branch `ticket-38-pembatalan-terencana`, test-first at the modules' public seams on real Postgres with the fake Clock (`src/domain/pemesanan/pembatalan-terencana.test.ts`, 28 tests, plus one in `refunds.test.ts`).
  - **Pemesanan**: `pratinjauPembatalanTerencana` (the Makam tab's "Ajukan Pembatalan": the refund under the order's own Syarat snapshot, or why it is not offered), `ajukanPembatalanTerencana`, `ajukanUlangPembatalanTerencana` (Perlu Perbaikan ↺ Diajukan), `batalkanPermintaanPembatalanTerencana`; the Admin Lokasi's `setujuiPembatalanTerencana` / `tolakPembatalanTerencana` / `mintaPerbaikanPembatalanTerencana` (each audited in its own transaction, the approval is one commit: every Hak Pakai Dibatalkan, Petak Tersedia, order Dibatalkan, the refund asked of Refunds, the family emailed); reads for the Antrean Lokasi row (Lainnya, due 2 Hari Kerja on the Lokasi calendar from the filing), Admin Platform's Tier 3 "Pembatalan refund approval" row (2 Hari Kerja on its calendar from the Lokasi's approval, closes when Refunds approves), the order page and `adaPembatalanTerbuka` for ticket 39's block.
  - **Refunds** (changed, tested): `ajukanBaris` takes `penuh` (refused unless the lines really are everything the fee rule returns), so a 100% Pembatalan makes the Tagihan Dikembalikan penuh and Payouts never makes the Lokasi's Pencairan; and a "sebagian" transfer now records a Potongan of the refunded tariff only (what the unpaid items could not absorb, never more than was paid), where it used to claim everything already paid out.
  - **Migration `0039_sweet_cammi`** (expand only: one new table `permintaan_pembatalan_terencana`, no CHECK, no change to an existing table). Wiring: Pemesanan now takes `refunds` (`ajukanBaris`, `permintaan`) through the lazy box `refundsTertunda()` in `src/composition/refunds.ts`, the way Billing holds Payouts, because Refunds asks Pemesanan who placed an order.
  - **Readings for the owner** (decisions where the spec is silent; please confirm): (1) A Pembatalan cancels the **whole order**: one Terencana order is one Tagihan paid once, so the request names one Hak Pakai but ends every one on the order, and every one must be Aktif, with no Pemakaman and no earlier Ganti Pemegang Hak. (2) "Completion" (Hak Pakai Dibatalkan, Petak Tersedia, order Dibatalkan) is the **Admin Lokasi's approval**, not the refund transfer: the Lokasi has confirmed no Pemakaman, and the money follows through Refunds. (3) Which side of the Masa Pembatalan is judged **when the request is first made** (strictly before its end = the whole tariff), and a request sent back for a fix keeps that figure when filed again, so a slow Lokasi never costs the family the full refund. (4) The refund is a percentage of every line but the Biaya Layanan Platform, rounded down to the rupiah; 0% raises no refund request and the right still ends. (5) Only the Pemegang Hak of the Hak Pakai (Email Terverifikasi = the recorded holder email) may ask; the Pemesan who paid is emailed the refund and the bank-account ask, and so is the Pemegang Hak when somebody else (one email when the same person). (6) A Terencana order always has an email, so the Telepon Pemesan fallback of ADR 0004 is not reachable here. (7) The Perlu Perbaikan note and the Ditolak reason are free text (max 500), never in the Audit Log's `after`.
  - **Found and fixed on the way** (not in the ticket): a 100% refund inside the Masa Pembatalan would otherwise have let the Pencairan tick pay the Lokasi the whole tariff at the Masa's end, because a "sebagian" request never marked the Tagihan refunded; and the old Potongan sizing over-claimed on a partial refund.
  - **Not built**: Ganti Pemegang Hak itself (ticket 39; the "earlier Ganti" check reads the closed Pemegang Hak row, so it works once that ticket writes one; the test closes the row directly, as `releasedPetak` does for a Berakhir Hak Pakai). No e2e was added (not asked for).

# Perpanjangan at a Lokasi Mitra: OTP path and Bukti Perpanjangan

Status: ready-for-agent
Blocked by: 29, 32, 34, 82
Spec: Domain modules > 7. Perpanjangan; 10. Billing (Perpanjangan pay-first, Bukti Perpanjangan); 11. Payouts (Perpanjangan on payment); stories 58, 62, 63, 64, 65, 66

## What to build

The Perpanjangan module's direct path. From the hub lookup (or the Makam tab), a Perpanjangan is open from 3 months before the end date to the end of the Masa Tenggang. A code sent to the email recorded on the Hak Pakai (skipped when logged in with that Email Terverifikasi; with no recorded email, the manual paths of ticket 41 apply) takes the Pemegang Hak straight to choosing 1–K terms with the price shown. A pay-first Tagihan addressed to the Pemegang Hak is due 3×24 h after issue; anyone may pay it without gaining any right. On payment the new end date = old end date + terms × N (never counted from payment), a Bukti Perpanjangan is issued in the Lokasi Mitra's name, and the Pencairan item is due at once.

## Acceptance criteria

- [ ] When not possible, a note replaces the button: "berlaku selamanya" (perpetual), "bisa diperpanjang mulai <tanggal>" (too early), "hubungi Admin Lokasi" (Berakhir, Dibatalkan, or other).
- [ ] An overdue pay-after Tagihan on the Hak Pakai blocks with "Lunasi Tagihan TGH/… terlebih dahulu" and a pay link.
- [ ] The code goes to the Hak Pakai's recorded email; an Akun logged in with that Email Terverifikasi skips it; with no recorded email the button points to the manual paths (ticket 41). _(Amended 2026-09-26, ADR 0004.)_
- [ ] Terms 1..K (Lokasi policy, default 1); price = Perpanjangan price per term × terms from `quote()` + Biaya Layanan Platform.
- [ ] New end = old end + terms × N years, applied automatically on payment, also when paid inside the Masa Tenggang.
- [ ] Bukti Perpanjangan `BPP/YYYY/NNNNNN`: Petak Makam, Pemegang Hak, old and new end dates, terms bought; in the Lokasi Mitra's name with the PT JKP header.
- [ ] A Hak Pakai flagged Perlu Verifikasi must be completed by the Admin Lokasi before the Perpanjangan proceeds.
- [ ] Pencairan: Perpanjangan item due on payment.
- [ ] The checkout's email follows ticket 22 (required unless logged in, proven by a Kode Masuk); the Tagihan and Bukti Perpanjangan go by email. _(Amended 2026-09-26, ADR 0004; was an optional email for copies.)_
- [ ] Tests: the open window; each blocking note; end-date arithmetic (early renewal, renewal in masa tenggang, K terms); code skip when logged in with the recorded email; payer ≠ Pemegang Hak gets no right; lapse to Dibatalkan at 3×24 h.

## Notes

For a Kavling Keluarga the Perpanjangan covers the whole kavling. The optional "Tambah Layanan" step before payment is ticket 53.

## Comments

- 2026-09-26 — ADR 0004: the "OTP path" is now a code to the email recorded on the Hak Pakai, skipped for the Akun with that Email Terverifikasi; no recorded email → manual paths. Now blocked by 82. The title keeps "OTP path" for continuity.
- 2026-09-29 — Builder readings (branch `ticket-40-perpanjangan`; not yet reviewed, not a review record). Where the ticket or spec was silent or two readings fit, this is what was built; each is the orchestrator's to overrule.
  - **Module created.** `src/domain/perpanjangan` (table `perpanjangan`; migration 0035 also holds `bukti_perpanjangan` and its append-only trigger). Public interface: `status`, `tawaran`, `kirimKode`, `verifikasiKode`, `ajukan`, `perpanjanganOf`, `perpanjanganUntukHakPakai`. For 41: its manual paths end in the same kind of order once an Admin Lokasi approves (the 30-day validity is 41's), reusing `status`, `tawaran` and the payment effect unchanged; `ajukan` today proves the holder only by the recorded email. For 42: `perpanjanganUntukHakPakai` says whether one is ordered, for stopping reminders.
  - **Status is derived, not stored.** `menunggu_pembayaran` / `lunas` / `dibatalkan` come from the paid mark and the Tagihan's own status, so Billing's lapse tick is the one place a Perpanjangan lapses (3x24 h, tested). One open Tagihan per Hak Pakai (advisory lock); a second order is pointed to it, never a changed Tagihan (a reissue keeps the due date, so changing terms means waiting for the lapse).
  - **No Nomor Pemesanan.** The spec lists Perpanjangan as "requests on a Hak Pakai", so its Tagihan carries none. Payouts' tick therefore gained a second path (payments with no Nomor Pemesanan whose Tagihan carries a Lokasi Mitra Perpanjangan line): due at the instant of payment; the Biaya Layanan Platform is not an item.
  - **Window from dates, not stored status.** Open from end date minus 3 months to end date plus Masa Tenggang (both days, WIB). Ticket 42 owns the Kedaluwarsa transition, so the window never reads `status = kedaluwarsa`; payment sets the Hak Pakai Aktif again.
  - **Block scope.** "An overdue pay-after Tagihan on the Hak Pakai" is read as ticket 29's existing rule: the Saat Duka order's own Lewat Jatuh Tempo Tagihan (`pemesanan.tagihanPenghalangOf`, new: the same fact as `isBlockedByOverdueTagihan` plus number and pay link). A burial-under-existing-Hak-Pakai Tagihan is not built yet and is not covered.
  - **Perlu Verifikasi.** The gate is built ("hubungi Admin Lokasi") and `inventory.lengkapiHakPakai` (Admin Lokasi, audited as `hak_pakai.lengkapi`) is the completion that opens it; 41's review can call it.
  - **Payer gets nothing.** The payment names no payer anywhere; the Hak Pakai stays in the recorded holder's Makam tab only (tested).
  - **Effect failure.** Superseded by the owner's decision in the fix pass below.
  - **Two questions this entry raised, answered in the fix pass below.** (1) The hub link (built in the fix pass). (2) `tariffs.quote` prices only a Terverifikasi Lokasi, so a Lokasi that stops being listed cannot sell a Perpanjangan, while spec line ~357 says Perpanjangan carries on for a Ditangguhkan one: a **defect to settle before or with ticket 59** (noted in 59's Comments); not fixed here.
  - **Not in this ticket.** "Tambah Layanan" (53), the reminders and Kedaluwarsa (42), the manual paths (41). Choices above the Rp 10.000.000 QRIS cap are not offered; if none fits the page says to call CS.
  - AGENTS.md: an edit was made here and reverted in the fix pass (a builder does not widen its own rulebook).
- 2026-09-29 — Fix pass after the two-axis review (builder; not itself a review record).
  - **Owner decision (in chat, 2026-09-29):** a Perpanjangan payment that arrives after its Hak Pakai has ended (Masa Tenggang over) is **not applied automatically**. The money is recorded (the Tagihan is Lunas with its Bukti Pembayaran) and a "Pembayaran Perlu Ditinjau" (Antrean row for Admin Platform) opens, to apply by hand or refund, the pattern of a late payment (spec ~458). No endless effect retry. Built: Billing `catatPembayaranPerluDitinjau` (new reason `tidak_dapat_diterapkan`, the reason CHECK widened in migration 0035 with a `-- contract:` comment), the effect's `masihBisaDiterapkan` (Hak Pakai not Berakhir / Dibatalkan, fixed term with an end on record, payment date no later than the last day of the Masa Tenggang), and Payouts skipping a payment under review. Tested: an ended Hak Pakai, a payment after the Masa Tenggang (Hak Pakai never ended), the last day still applied, reported twice gives one row. Not built: the "apply by hand" action itself (no screen or function applies a reviewed Perpanjangan; refund goes through ticket 31); if Admin Platform resolves the review some other way, the Payouts item stays skipped only while the row exists.
  - **Same-transaction messages.** `Notifications.within(tx)` added; `tagihanTerbit` is queued inside the order's transaction and `buktiPerpanjanganTerbit` inside the payment effect's. Tests make the announcement fail after it queued and show no Perpanjangan, no Tagihan and no email remain, and that the retry of a rolled-back effect completes once.
  - **Server Actions.** `masukDanPesanPerpanjangan` is split: `kirimKodePerpanjangan` and `verifikasiKodePerpanjangan` are the login itself (identity through the module) and end on the page; the order is only the guarded `pesanPerpanjangan`. AGENTS.md edit reverted.
  - **Hub (spec narrowing built).** The lookup answer now carries `hakPakaiId` (an unguessable uuid, in `KUNCI_HASIL_CARI_MAKAM`; the page shows only a masked email and the code goes to the recorded one). Each found grave links to `/perpanjangan/<id>`, and the Perpanjang card no longer says "Segera hadir": it says to pick Perpanjang Makam on the result.
  - **Smells.** Payouts' two candidate queries share their columns; `fakta()`'s long conditional is `tidakAdaYangDiperpanjang`.
- 2026-09-29 — Re-review fixes (builder). One mechanism for a transaction: `Notifications.within` is gone; `tagihanTerbit(input, within?)` (ticket 89) and `buktiPerpanjanganTerbit(input, within?)` take it the same way, rollback tests unchanged and green. Privacy (story 51): `status()` returns the open Tagihan (number, due date, link) only to the Akun signed in with the recorded email, so an anonymous hub search reaching `/perpanjangan/<id>` sees Lokasi, Petak, end date, prices and the masked email only; tested for no viewer, an unrelated Akun and the holder. The Tagihan page itself names the Pemegang Hak (addressee) and the total, but is reachable only through its unguessable link, which an anonymous visitor never receives. Migration 0035: `-- contract:` above the re-added CHECK too; `check-destructive-ddl` exit 0, second `db:generate` no changes.

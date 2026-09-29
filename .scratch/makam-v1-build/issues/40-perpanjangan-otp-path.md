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
  - **Effect failure.** If the Hak Pakai ended between the order and the payment, the effect throws, the payment stands and Billing records and retries the failure; no Pembayaran Perlu Ditinjau is raised. Flagged for the owner: money for an ended Hak Pakai then needs a human.
  - **Needs an owner decision (not built).** (1) The hub lookup answer deliberately carries no Hak Pakai id (privacy list, ticket 34), so the hub's Perpanjang card stays "Segera hadir" (Rilis 2) and the new page `/perpanjangan/<hakPakaiId>` is reached from Akun Saya's Makam tab only. Linking from the hub needs an owner call on what the lookup may reveal. (2) `tariffs.quote` prices only a Terverifikasi Lokasi, so a Lokasi that stops being listed cannot sell a Perpanjangan, while the spec says Perpanjangan carries on for a Ditangguhkan one; ticket 59 has to reconcile it.
  - **Not in this ticket.** "Tambah Layanan" (53), the reminders and Kedaluwarsa (42), the manual paths (41). Choices above the Rp 10.000.000 QRIS cap are not offered; if none fits the page says to call CS.
  - AGENTS.md: the Perpanjangan page's code step is named beside Masuk and Kirim as a login-itself exception (it validates with Zod and calls the module).

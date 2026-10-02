# Lokasi Mitra Ditangguhkan and Berhenti

Status: ready-for-agent
Blocked by: 32, 38, 54
Spec: Domain modules > 3. Lokasi (Ditangguhkan, Berhenti); 9. Layanan (Berhenti cycles); 11. Payouts (On Berhenti); 16. Scheduler (Berhenti effective dates); stories 15, 106, 152

## What to build

Admin Platform sets a Lokasi Mitra Ditangguhkan or Berhenti (with an effective date, default 30 days after the decision), audited. Ditangguhkan blocks only a new Hak Pakai (Saat Duka new plot and Terencana); burials under an existing Hak Pakai, Perpanjangan, Layanan and Paket cycles, Pembatalan, Ganti Pemegang Hak, Pengembalian Hak Pakai and orders in progress carry on. Berhenti: from the decision no further Paket cycles are issued and families are told; until the effective date the Lokasi behaves as Ditangguhkan; open Pekerjaan Layanan not finished by that date are cancelled with a full refund including the Biaya Layanan Platform; from that date no order of any kind, and Hak Pakai stay read-only in Akun Saya with the pengelola's contact and downloadable documents. Pencairan and Potongan settle as the spec says.

## Acceptance criteria

- [ ] The Lokasi page stays up with "sementara tidak menerima pesanan"; the Lokasi disappears from Pilih makam and Terencana lists.
- [ ] Every order entry point checks the status: new Hak Pakai blocked while Ditangguhkan; everything blocked from the Berhenti effective date.
- [ ] Berhenti decision: Paket cycles stop at once and Pemegang Hak / Paket subscribers are notified.
- [ ] Effective-date tick (idempotent): unfinished Pekerjaan Layanan cancelled with full refunds incl. the Biaya Layanan Platform; Hak Pakai read-only in the Makam tab with the pengelola contact and documents.
- [ ] Payouts on Berhenti: pending Pencairan for finished work paid net; Potongan become an offline request; held Terencana Pencairan released except for Pemesan inside their Masa Pembatalan who cancel, who are refunded.
- [ ] Tests: each carry-on vs blocked action under Ditangguhkan; the Berhenti timeline; refunds of leftovers; payout settlement.

## Comments

- 2026-09-29 — From ticket 40's fix pass, a defect to settle before or with this ticket: `tariffs.quote()` prices only a Lokasi Mitra that is Terverifikasi (its public visibility), but the spec says Perpanjangan (and burials under an existing Hak Pakai, Layanan, Pembatalan) carry on at a Ditangguhkan Lokasi. Today a Perpanjangan at a Lokasi that stops being listed cannot be priced, so `tawaran` and `ajukan` refuse it (`harga_tidak_tersedia`). The fix belongs with the status work here (a quote that a Lokasi's own carry-on actions may ask for regardless of the listing), and this ticket's "carry-on vs blocked" tests should include Perpanjangan.
- 2026-10-02 — Owner decision 2026-10-02 ("ya setuju semua" to the orchestrator's list of open questions; small concrete choices put to the owner directly, recorded here as settled): **keep the current behaviour** — at a Berhenti decision only families with a running order or a Paket at that Lokasi are told; a Pemegang Hak with neither is not.
- 2026-10-02 — **Two-axis review of the whole branch (head 4fcfc31), recorded before the fix pass.** Fixed point origin/main.
  - **Standards: 0 hard, 7 judgement.** (1) `src/composition/berhenti.ts` `hentikanLokasiMitra` commits Berhenti, then calls `notifications.lokasiBerhenti` outside that transaction (no `within`); a crash between them loses every family notice with nothing to retry (a retry returns `status_tidak_cocok`). The orchestrator treats this as **must-fix**: AGENTS.md says enqueue in the data's transaction. (2) `berhentiBerlakuTick(ctx, _now)` ignores `now`; (3) the open-status list in `batalkanSisaBerhenti` is written twice; (4) the `sebab` ternary in `tulisPengembalian` is written twice; (5) `StatusPesanan.status` re-declares the status union; `HentikanResult` nested union; (6) a second date-format check inside `hentikan`; (7) the `kind === "terencana" && status === "aktif"` filter repeated in composition and the scheduler belongs in Pemesanan.
  - **Spec: 0 hard.** (a) AC4's "with the pengelola's contact" is unmet; the Lokasi Mitra holds the pengelola name and address (spec line ~355), so show those now; phone/email stays an owner question. (b) Unverified that the effective-date payouts step excludes a Pemesan still inside the Masa Pembatalan ("refunded if they cancel"): prove with a test or fix. (c) Notice scope follows the owner decision of 2026-10-02; the owner may confirm for a Pemegang Hak with neither.
  - **Fix pass**: Standards 1 (one transaction, with a test), 3, 4, 5, 7; Spec (a) name + address, (b) a test. Items 2 and 6 at the builder's judgement.
- 2026-10-02 — **Owner decision** (AskUserQuestion, after "ya setuju semua"): the read-only Makam card at a Berhenti Lokasi shows the pengelola's **phone and email** as well as name and address: new nullable columns on the Lokasi Mitra (expand-only), entered by the Admin Platform, shown on the card.
- 2026-10-02 — **Owner decision ("iya setuju semua" to the recommendation):** the pengelola's phone may be an office/landline number as well as a mobile; it is only shown to families, never messaged. Sentry must mask it in that format too.

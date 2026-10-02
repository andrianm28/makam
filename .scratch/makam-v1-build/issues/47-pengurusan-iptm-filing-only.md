# Pengurusan IPTM (filing-only) and PTSP rejections

Status: ready-for-agent
Blocked by: 31, 46
Spec: Domain modules > 8. Pengurusan (Pengurusan IPTM, payment rule, PTSP rejection); 13. Field Work (surat pengantar on Lunas); 14. Work Queues (Tier 3 filing-only document check, filing); stories 78, 82

## What to build

"Sudah dimakamkan? Kami urus IPTM-nya": a family that buried at a DKI TPU on their own orders filing only. The order starts Dimakamkan; the Pemesan uploads documents within 7 days of the order; Admin Platform checks them (Tier 3, 1 working day) → Dokumen Lengkap; then a pay-first Tagihan (Biaya Pengurusan filing-only amount) due 3×24 h after issue, lapsing to Dibatalkan (Menunggu Pembayaran). Once Lunas, an Ambil surat pengantar Tugas Lapangan is created and filing is due within 3 working days (Tier 3) → IPTM Diajukan → IPTM Terbit (Makam TPU created/updated). A fixable PTSP rejection (missing or unclear document, Surat Kuasa problem) goes back to Perlu Perbaikan and is refiled at no charge, also after payment; a final PTSP rejection is refunded in full with the reason shown.

## Acceptance criteria

- [ ] Statuses: Dimakamkan → Dokumen Lengkap → Menunggu Pembayaran → IPTM Diajukan → IPTM Terbit, plus Ditolak and Dibatalkan; Perlu Perbaikan loop for fixable rejections.
- [ ] No Tagihan before the document check passes; the Tagihan lapses (order Dibatalkan) at 3×24 h unpaid.
- [ ] Ambil surat pengantar Tugas is created only once the Tagihan is Lunas.
- [ ] Tier 3 rows: document check (1 working day), filing (3 working days after Lunas), on the Admin Platform calendar (ticket 11).
- [ ] Fixable rejection → Perlu Perbaikan (shown in Perlu tindakan), refile creates no new Tagihan.
- [ ] Final rejection → Ditolak with the reason shown; full refund (including Biaya Pengurusan) through ticket 31, Operator-funded.
- [ ] Tests: pay-first after check; lapse; surat pengantar on Lunas only; Perlu Perbaikan loop without charge; final rejection refund.

## Added (2026-09-25)

- [ ] Optional email field on the order screen (copies of Tagihan / Bukti by email through SumoPod SMTP; SES dropped 2026-09-25), as in spec "Booking wizards".
- 2026-10-02 — **Two-axis review (branch `ticket-47-pengurusan-iptm`, head eb66d4f), recorded before the fix pass.** Fixed point origin/main = 4aa73c3, confirmed by the orchestrator (30 files).
  - **Standards: 0 hard, 8 judgement.** Red-first order holds; thin guarded actions, Clock, idempotent tick, module ownership, client imports, expand-only 0057 all clean. Judgement: day arithmetic copied three times (reuse `hariKemudian`); the Tier 3 row projection repeats ticket 46's; parallel hand-kept status lists (`BOLEH_DIBATALKAN`, `SUDAH_DIMAKAMKAN`, `SESUDAH_BAYAR`) and a recurring `dimakamkan`/`perlu_perbaikan` check — gather into named status sets; the `berkas` flag threaded through `tempatkan` (a per-kind config would be cleaner); `order.pemegangHak.phoneNumber ?? order.phoneNumber`; the tick's two untransacted updates with no audit (state the decision); `quote(..., new Date())` on the page; the best-effort `files.delete` should carry a comment.
  - **Spec: 1 hard, 3 judgement.** HARD: the surat pengantar Tugas must be **created automatically when the Tagihan is Lunas** (story 146, spec ~518 "auto-created … only once its Tagihan is Lunas", "so that pickup is never forgotten"); the branch makes it manual. The spec already gives the shape: a system-created, unassigned Tugas that shows as the Tier 2 "Ambil surat pengantar" row (spec ~525) — no owner decision needed. Judgement: `diproses` for paid-and-waiting is acceptable; the signed-in-only order page meets the Akun-email intent (wizard shape, CS path and Kode Masuk at Kirim belong with the wizard work); refund on final PTSP rejection for filing-only only is what the spec says; the 2026-09-25 optional-email AC is stale since ADR 0004.
  - **Fix pass**: Spec HARD (auto, unassigned Tugas on Lunas, in the Lunas transaction, idempotent, test-first), Standards 1, 3, 6, 7, 8 and 2 if cheap.

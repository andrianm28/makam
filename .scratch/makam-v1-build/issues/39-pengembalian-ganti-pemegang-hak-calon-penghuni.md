# Pengembalian Hak Pakai, Ganti Pemegang Hak and Calon Penghuni

Status: ready-for-agent
Blocked by: 27, 29, 38
Spec: Domain modules > 5. Inventory (Ganti Pemegang Hak, change number, Pengembalian, Calon Penghuni); 6. Pemesanan (Requests from the Pemegang Hak); stories 103, 104, 105, 125, 126

## What to build

The other Pemegang Hak requests and holder changes. From the Makam tab: "Kembalikan Hak Pakai" for an unused plot (warned that compensation is agreed directly with the Lokasi), and "Ajukan Ganti Pemegang Hak" (new holder name + phone number and, if known, email, jual / waris, optional documents). Both become Antrean Lokasi rows due in 2 working days. The Admin Lokasi performs Ganti Pemegang Hak with documents, keeping the holder history, and can change the Pemegang Hak's contact number or recorded email after a KTP check. The Pemegang Hak changes the Calon Penghuni label freely; the Lokasi is notified, with no review.

## Acceptance criteria

- [ ] Both requests have statuses Diajukan → (Perlu Perbaikan ↺ Diajukan) → Disetujui | Ditolak | Dibatalkan (by the requester before a decision); Perlu Perbaikan shows in Perlu tindakan. The Antrean Lokasi row exists while Diajukan, due 2 working days on the Lokasi's Jam Operasional calendar (ticket 11).
- [ ] Pengembalian: allowed only with no Pemakaman; on completion the Hak Pakai is Berakhir (reason Pengembalian) and the Petak Tersedia; no money moves through the Operator.
- [ ] Ganti Pemegang Hak: blocked while a Pembatalan is open or a Saat Duka Tagihan on the Hak Pakai is overdue (`isBlockedByOverdueTagihan`); a sale (jual) is rejected when the Lokasi forbids sale transfers; inheritance is always allowed; the transfer fee is noted as collected offline.
- [ ] The holder history keeps every earlier Pemegang Hak with dates; the Hak Pakai moves to the new holder's Makam tab by number.
- [ ] Heirs of a deceased Pemegang Hak are pointed to the hub lookup instead of this request.
- [ ] Admin Lokasi changes the Pemegang Hak number after uploading a KTP check; audited.
- [ ] Calon Penghuni label change: immediate, no review; the Admin Lokasi gets a notification.
- [ ] Every Admin Lokasi action here is audited.
- [ ] Tests: request status transitions (Perlu Perbaikan round trip, Dibatalkan only before a decision, row only while Diajukan); blocks on Ganti Pemegang Hak; sale vs inheritance; history kept; Pengembalian ends the Hak Pakai; label change notifies without a row.

## Comments

- 2026-09-26 — ADR 0004: the new Pemegang Hak is recorded with a phone and, when known, an email (the Makam tab matches by email); the Admin Lokasi's KTP-checked change covers the recorded email as well as the phone.
- 2026-10-02 — **Settled through the `grilling` skill (round 5 Q15, owner "ya setuju semua"):** the Calon Penghuni label is **per Petak** (spec line ~377). A Terencana order for a Kavling Keluarga puts its label on the **first Petak** of the Kavling; the family labels the other Petak from Akun Saya at any time (story 105). Resolves the branch's SPEC 3. Branch `ticket-39` is 218 commits behind main: rebuild on current main, reusing its code; the label move is an expand/contract migration.
- 2026-10-02 — **Two-axis review of the rebuilt branch (`ticket-39-rebuilt`, head b7ae3fa).** Fixed point origin/main = ac21081, confirmed by the orchestrator (49 files).
  - **Standards: 0 hard, 7 judgement.** Migration 0057 is expand-only and its INSERT…SELECT backfill is safe on non-empty tables while the previous release runs (the old release never reads the new table). Judgement: the backfill has no `ON CONFLICT DO NOTHING`; the "first Petak" rule is written twice in SQL and twice in TS with no parity test; **`ubahCalonPenghuni` writes the new table and the old column as separate statements with no transaction** (worst); `kembalikanHakPakai` has no `status = 'aktif'` guard in its UPDATE and is safe only through `within(tx)`; the KTP and request-document type/size checks are duplicated; the Ganti block re-check at approval reads before the transaction (small race); `permintaan-hak-pakai.ts` (576 lines) also holds Calon Penghuni. Clean: thin guarded actions, client-safe schema file, private FileStore with short-lived URLs, audit without PII, red-first commits.
  - **Spec: 0 hard, 4 judgement.** All eight ACs delivered. Judgement: the overdue-Saat-Duka-Tagihan block is enforced at filing and approval but untested; `ktp` is optional in the domain (only the form requires it); the heirs pointer always shows; attachments only at filing (re-filing after Perlu Perbaikan unchecked).
  - **Decision (orchestrator):** no hard finding on either axis, but the data-integrity items are cheap and are taken before merge: one transaction for the Calon Penghuni dual write; the Ganti re-check inside the approval transaction; a status guard in `kembalikanHakPakai`; `ktp` required in the domain; the overdue-Tagihan block test; `ON CONFLICT DO NOTHING` on the backfill; one shared upload check.

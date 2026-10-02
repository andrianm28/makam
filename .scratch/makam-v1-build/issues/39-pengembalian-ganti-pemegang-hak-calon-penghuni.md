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

- 2026-10-02 — Builder (rebuild on current main, branch `ticket-39-rebuilt`): brought the domain slice across (`pemesanan_permintaan_hak_pakai`, `permintaan-hak-pakai.ts`, Inventory `kembalikanHakPakai`, `aturanGantiPemegangHak`, Antrean row, `staf_calon_penghuni_diubah`; SPEC 1 and 2 and the one-transaction STANDARDS fix are in). **Calon Penghuni per Petak (grilling Q15):** new table `inventory_calon_penghuni` (Hak Pakai + Petak, one label), written alongside the old `inventory_hak_pakai.calon_penghuni` (expand; the column is NOT dropped, its contract is a later release); the migration backfills existing labels onto the first Petak. A Terencana order's label goes on the first Petak of a Kavling Keluarga; `ubahCalonPenghuni` takes an optional `petakId` (required for a Kavling, else `petak_tidak_dikenal`), the Lokasi alert names that Petak; `makamKeluargaSaya` returns the label per Petak. New: Ganti requests take attached documents (`berkas`, stored privately, JPEG/PNG/PDF); `permintaanHakPakaiUntukStaf` (signed URLs); `permintaanHakPakaiPerluPerbaikan` (feeds Perlu tindakan); `ubahKontakPemegangHak` takes an uploaded KTP check (`ktp`, kept in the FileStore, key in the audit entry), required by the Admin Lokasi's form. UI: Makam tab link + per-Petak label forms, `/permintaan-hak-pakai/[hakPakaiId]` (Kembalikan, Ganti, status, ajukan ulang, tarik; heirs pointed to `/makam-keluarga`), Admin Lokasi `/staf/admin-lokasi/[lokasiId]/permintaan/[id]` (setujui/tolak/kirim kembali), KTP form on the Hak Pakai staff page. Migration `0057` (regenerated; numbering fixed at merge).
  Spec gaps and decisions for the owner: (1) the overdue Saat Duka Tagihan block (`isBlockedByOverdueTagihan`) is enforced at filing and approval but has no integration test here (the open-Pembatalan block, at filing and approval, does); (2) `ubahKontakPemegangHak` keeps `ktp` optional in the domain (the Perpanjangan approval also calls it); only the Admin Lokasi's form makes it required; (3) no Playwright spec and no Server Action tests for the new screens.
  HANDOFF (Rilis 2 gate, `RILIS_TERBUKA`): new routes `/permintaan-hak-pakai/[hakPakaiId]` (family) and `/staf/admin-lokasi/[lokasiId]/permintaan/[id]` (staff); Server Actions in `src/app/(site)/permintaan-hak-pakai/[hakPakaiId]/actions.ts` (ajukanPengembalian, ajukanGantiPemegangHak, ajukanUlang, batalkan, ubahCalonPenghuni), `.../permintaan/[id]/actions.ts` (setujui, tolak, minta perbaikan), `.../hak-pakai/[hakPakaiId]/actions.ts` (ubahKontakPemegangHak); Makam tab link; new authorize action `permintaan_hak_pakai.ajukan`/`.putuskan`; no new ticks (the Antrean row is a read). Unverified: `npm run build`; full-folder suites beyond the files named in the report.

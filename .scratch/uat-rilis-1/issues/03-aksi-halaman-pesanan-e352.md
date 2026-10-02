# Every Pemesan action on the order page fails (E352)

Status: in-progress
Blocked by: —
Spec: spec.md (makam-v1), Refunds (bank account for a refund), Pemesanan (order page actions)

## What to build

Found in the staging UAT on 2026-10-02. On `/pesanan/<nomor>`, "Simpan rekening" (the refund bank account after an approved Pembatalan Terencana) answers HTTP 500, digest `882762768@E352`, reproduced with two different accounts (MKM-2026-000001, MKM-2026-000005). Next.js E352: a `"use server"` file may export only async functions; `src/app/(site)/pesanan/[nomor]/actions.ts` ends with `export { JENIS_BERKAS };` (since ticket 23). Every action in that file is at risk: unggah dokumen, batalkan pesanan, jawab alternatif, tarik Terencana, isi rekening.

## Acceptance criteria

- [ ] "Simpan rekening" saves the account and the refund continues to Admin Platform approval and a Bukti Pengembalian Dana.
- [ ] No `"use server"` file exports anything but async functions; a guard test fails if one does.

## Comments

- 2026-10-02 — Filed from the UAT (orchestrator). Branch `fix/pesanan-actions-use-server`.

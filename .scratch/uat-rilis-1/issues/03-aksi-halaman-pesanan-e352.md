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
- 2026-10-02 — Two-axis review (code-review skill, fixed point origin/main 0ff5acb, branch at 78e6b9a). Standards: 0 hard; judgement — stale comment + Middle Man alias `draftLayananSchema` at `src/app/layanan/actions.ts:32-33` (inline `placePesananLayananSchema`), stray blank line at the end of `pesanan/[nomor]/actions.ts`, terse names in `tests/tooling/use-server-exports.test.ts`, guard sees tracked files only. Spec: ACs met in code; `src/app/layanan/actions.ts` had the same E352 defect (in scope by AC 2); "Simpan rekening" end to end still to be verified on staging after deploy. Fix pass: the alias/comment, the blank line, clearer helper names.
- 2026-10-02 — Re-review of the fix pass (1f1a613): alias/comment OK, blank line OK; names BELUM — the rename turned `.split("\n")` into `.split("\node")` (verified with `git show`, line 69), so the tracked-file list is never split and the guard scans nothing: it stays green while blind. Fix pass: restore `"\n"`, and assert the scan covers the known `"use server"` files (count > 0, and it names `src/app/(site)/pesanan/[nomor]/actions.ts`) so a blind guard fails.

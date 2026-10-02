# Small findings from the Rilis 1 UAT

Status: ready-for-agent
Blocked by: —
Spec: spec.md (makam-v1), the screens named below; CONTEXT.md for wording

## What to build

Found in the staging UAT on 2026-10-02, each with a screenshot in the UAT run:

1. Admin Lokasi order page, "Konfirmasi pesanan": after choosing a Petak, the Petak picker shows the raw id (`eaf1fb04-…`) instead of "A-01 (Blok A)".
2. Family order page (Saat Duka): "Yang tidak boleh **delaying** pemakaman adalah pembayaran" — English word in Indonesian copy.
3. Staff "Pembatalan atas nama keluarga": "Alasan yang mereka apa pun tidak Anda ketik ulang." — broken sentence.
4. Admin Platform staff invitations list: "berlaku sampai … WIB WIB".
5. Akun Saya → Pesanan lists Saat Duka orders but not Pemesanan Terencana (MKM-2026-000001 and -000005 missing).
6. Admin Lokasi order page says "Lokasi Mitra ini belum punya daftar dokumen" while the Lokasi's own Beranda lists four documents.
7. A Saat Duka order page that is already confirmed is still headed "Pesanan terkirim".
8. A Tagihan says "Bayar dengan Virtual Account (VA) atau QRIS" while the sandbox offers QRIS only (check against the spec before changing).

## Acceptance criteria

- [ ] Each item fixed or, where the spec says otherwise, answered in `## Comments`.

## Comments

- 2026-10-02 — Filed from the UAT (orchestrator).
- 2026-10-02 — Two-axis review (code-review skill, fixed point origin/main 623dc4c, branch at cbbafc4). Standards: 0 hard; judgement — Petak label "nomor (Blok x)" likely built twice in `pesanan-forms.tsx:46` (extract one `labelPetak`); the status union repeated four times in `akun/pesanan/page.tsx` (name one `StatusPesanan`) and stale comments above `BadgePesanan` and `AkunPesananPage`; `dokumenOf` exported with one in-file caller, mixed-language locals (`punya`, `names`); N+1 unit read in `terencanaSaya` (small lists). Spec: all 8 items addressed; item 8 leaves "Virtual Account" in the comment at `src/app/dokumen/[link]/page.tsx:230` and a label at `sumopod-payment-provider.ts:48`; story 35 ("VA or QRIS") is a spec gap for the owner; story 99's "Perlu tindakan" strip gets no Terencana input (not asked here); item 6 shows the Lokasi's current checklist, not a snapshot. Fix pass: labelPetak, StatusPesanan, stale comments, VA leftovers (check whether the adapter label is SumoPod's own method name before renaming), `dokumenOf` unexported and Indonesian names. Follow-ups, not in this pass: N+1, Perlu tindakan for Terencana, checklist snapshot.
- 2026-10-02 — Builder (fix/uat-temuan-kecil). Outcome per item:
  1. Fixed: the Petak Select in "Konfirmasi pesanan" now has `items` (id → "A-01 (Blok A)"), so the trigger shows the label. No test seam (UI only).
  2. Fixed: "menunda pemakaman".
  3. Fixed: "Alasan apa pun yang mereka sebutkan tidak perlu Anda ketik ulang."
  4. Fixed: duplicate "WIB" removed (`formatWib` already appends it).
  5. Fixed, test first: new `pemesanan.terencanaSaya` read (newest first, own Akun only); Pesanan tab merges Terencana rows into the list (status `aktif` badge added). Test in `pesanan-saya.test.ts`.
  6. Fixed, test first: the staff order read (`orderUntukStaf`) showed only the order's own berkas rows; it now lists the Lokasi Mitra's whole checklist (as the family read does) plus any leftover row. Tests in `berkas.test.ts`.
  7. Fixed: Saat Duka order page heading is "Pesanan terkirim" only while Diajukan, else "Pesanan Anda".
  8. Spec says "Online payment in v1 is QRIS only ... no Virtual Account" (Billing), so the Tagihan copy now reads "Bayar dengan QRIS." Spec gap for the owner: user story 35 still says "VA or QRIS".
  Verified: vitest berkas + pesanan-saya (13 passed), lint, typecheck clean.

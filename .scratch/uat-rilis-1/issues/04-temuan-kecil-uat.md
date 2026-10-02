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

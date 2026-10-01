# A second Pembatalan on one Tagihan waits for the earlier refund's transfer

Status: ready-for-agent
Blocked by: —
Spec: spec.md, Pemesanan (Pembatalan) and Billing (refunds)

## What to build

Since Pembatalan is per Hak Pakai (ticket 38, owner decision 2026-09-29), two plots of one Terencana order can be cancelled on different days. Refunds joins a new refund line to an open request only while it is still Diajukan; once the earlier refund is approved and awaiting transfer, the Admin Lokasi's approval of the second Pembatalan is refused with `pengembalian_sebelumnya_menunggu_transfer` ("tunggu sampai pengembalian itu ditransfer"). Money stays right and the block clears at transfer, but the Admin Lokasi has to come back. Let the second Pembatalan be approved at once, its refund becoming its own request (or joining the next batch) without double-paying a line.

## Acceptance criteria

- [ ] A second Pembatalan on the same Tagihan can be approved while the first refund is approved and awaiting transfer.
- [ ] Each refunded line is paid exactly once; the Potongan and Pencairan effects follow each refund.
- [ ] Tests through Pemesanan and Refunds public functions.

## Comments

- 2026-09-29 — Filed at ticket 38's merge (owner decision 2026-09-29: the limit accepted for now, with its own message, and a follow-up).
- 2026-10-01 — Builder (ticket-92): aturan dipindah ke Refunds: `ajukanBaris` hanya menggabungkan baris baru ke permintaan yang masih `diajukan`; permintaan yang sudah `disetujui` membekukan barisnya, jadi baris berikutnya menjadi permintaan sendiri dengan transfernya sendiri (setiap baris tetap dibayar sekali). Indeks unik parsial `permintaan_pengembalian_tagihan_open_idx` (status <> 'ditransfer') diganti `permintaan_pengembalian_tagihan_diajukan_idx` (status = 'diajukan') lewat migrasi 0047; penanda `-- contract:` menjelaskan mengapa rilis sebelumnya tetap aman. `pengembalian_sebelumnya_menunggu_transfer` dan `menunggu_transfer` dihapus karena tidak lagi pernah dikembalikan. AC tercakup lewat Pemesanan dan Refunds; 223 tes lulus di `src/domain/pemesanan src/domain/refunds`, lint/typecheck/build hijau. Catatan untuk owner: permintaan refund kedua perlu rekening bank diisi lagi (Pemesan boleh mengisinya selagi masih diajukan; setelah disetujui hanya Admin Platform), dan efek Potongan/Pencairan mengikuti transfer masing-masing seperti sebelumnya.

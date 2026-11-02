# TPS saja: DKI TPU and Mitra Jasa are taken out of the product

Amends the v1 spec (Release plan; the DKI TPU stories, tickets 43–48, 55–57 and the TPU parts of 51–53), ADR 0006 (one release number per environment) and the `CONTEXT.md` entries **TPU**, **Mitra Jasa** and **Pengurusan**. Owner decision, 2026-11-02 (relayed by dri: "fokus ke TPS dan Graha Sentosa, takeout semua TPU").

The product serves private cemeteries (Lokasi Mitra; "TPS" in marketing copy) only. Nothing of DKI TPU is offered any more: the TPU catalog and its pages, Saat Duka at a TPU, Pengurusan IPTM and Perpanjangan TPU, the Surat Kuasa, the TPU Layanan order, and with them Mitra Jasa, whose only work was TPU Layanan.

## Decision

- **Taken out, not deleted (expand only).** `tpu` and `mitra_jasa` move from Rilis 3 to `RILIS_DIKELUARKAN` (4) in the release map (`src/lib/rilis-peta.ts`). No staging or production environment opens 4: `RILIS_TERBUKA=4` is refused outside development and test, where it keeps the taken-out code and its tests alive. No table, column, route or domain function is removed, and no data is changed; rows already written (none on production) stay readable.
- **Hidden, never "Segera hadir".** A feature waiting for its release says "Segera hadir"; a taken-out one is not coming, so its public pages answer 404 like its staff pages, and its homepage tile, menu items, Makam Keluarga card and section, Daftar Lokasi filter and cards, Akun Saya cards, FAQ question, Cara Kami Bekerja claim and Tentang Kami mention are not shown. Admin Platform no longer sees the TPU prices, the Mitra Jasa rates, the Pengurusan fees and the Retribusi Pemda, and cannot invite a Mitra Jasa; an Akun that holds the Mitra Jasa role gets no menu for it. Its scheduled ticks do not run.
- **Opening Rilis 3 on production** no longer waits for the DKI Layanan prices, the Biaya Pengurusan, the Retribusi Pemda or Mitra Jasa accounts: at 3 it opens Perpanjangan lanjutan, Ditangguhkan/Berhenti of a Lokasi Mitra, and Wakaf Tanah.

## Considered options

- **Delete the TPU code and tables.** Rejected: destructive (contract migrations, a later release), not reversible, and the owner may serve TPUs again later.
- **Leave TPU at Rilis 3 and keep production below it.** Rejected: production must open Rilis 3 for Wakaf and Perpanjangan lanjutan.
- **One feature switch per environment.** Rejected for the same reason as in ADR 0006; one number per environment plus a level no environment opens is enough.

## Also decided the same day

- **No headstone or cemetery-field photos in the public visuals** (owner: "kurangin foto papan nisan atau areal pemakaman"): the Beranda's Perpanjang Makam and Layanan Makam tiles now show garden paths, and the development seed's example Lokasi Mitra photos no longer include rows of graves. Proof photos of a Pekerjaan Layanan, which only the ordering family sees, are unchanged.

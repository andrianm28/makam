# Laporan 2026-10-03: preflight produksi, prod.env, tiket 98, aos-02

Sesi di VPS makam, atas permintaan owner. Tidak ada deploy, promote, rollback, reload nginx, prune, atau perubahan pada aplikasi lama. Tidak ada nilai rahasia yang ditampilkan; yang dilaporkan hanya nama variabel, pemilik dan mode berkas.

## Tugas 1: preflight produksi (rehearsal tiket 72, langkah 1) dan bukti tiket 98

### Checkout untuk deploy
- `/home/ubuntu/makam` ada di `main`, tetapi kotor (catatan UAT owner yang belum di-commit). Atas izin owner, catatan itu di-commit secara lokal sebagai `f0104c07`. Commit ini kemudian di-push ke branch `host-local-2026-10-03` (Tugas 2A).
- Checkout bersih baru dibuat di **`/home/ubuntu/makam-deploy`**: clone `andrianm28/makam`, `main`, porcelain kosong, `pull --ff-only` "Already up to date", HEAD `3467f785` (memuat `3467f78`), `deploy/bin/makam-preflight` ada.

### `deploy/install-host.sh`
- Exit 0, dan `nginx -t` sukses. Script mencatat bahwa `backup-passphrase` staging dan prod belum ada (diperbaiki di Tugas 2B). Kelima timer staging terjadwal.

### Preflight pertama
- Hasil: exit 1, **9 PASS / 8 FAIL**.
- FAIL karena belum ada promosi: ghcr pull, webhook forged signature.
- FAIL karena belum ada konfigurasi: `prod.env` belum ada (sehingga sumopod api key, webhook secret dan GitHub token juga gagal) dan `backup-passphrase` prod belum ada (sehingga backup and restore juga gagal).

### Bukti tiket 98 (baca-saja)
- Host memakai UTC. Pukul 07:15:40–07:15:53 UTC, staging di-deploy dari `sha-0ff5acb2…` ke `sha-623dc4c1…`.
- Nginx mencatat `POST /masuk` **500** pukul 07:11:27, dari HeadlessChrome (skrip UAT).
- Tidak ada OOM kernel. Galat nginx di jendela itu hanya berasal dari scanner.

## Tugas 2

### A. Push commit host
- `f0104c07` di-push ke branch baru **`host-local-2026-10-03`** (head `f0104c078de177a2237557885a5c2e2c0415fb2a`). Tidak ke `main`, tanpa PR.

### B. Passphrase backup
- Dibuat baru, masing-masing `ubuntu:ubuntu`, mode `600`, 45 byte:
  - `/opt/makam-v1/staging/backup-passphrase`
  - `/opt/makam-v1/prod/backup-passphrase`
- `makam-staging-db-backup.service` dijalankan sekali dan sukses: dump terenkripsi 110 MiB di `backups/db/makam-20261003T133824Z.dump.enc`.
- Journal mencatat peringatan `~/.docker/config.json: permission denied`; peringatan ini tidak menghentikan backup.
- **Owner:** salin kedua passphrase ke tempat offline, dari shell sendiri.

### C. `/opt/makam-v1/prod/prod.env`
`ubuntu:ubuntu`, mode `600`, sama seperti `staging.env`.

| Kelompok | Variabel |
|---|---|
| Nilai tetap | `MAKAM_ENV_FILE`, `MAKAM_PROJECT=makam-prod`, `MAKAM_APP_ENV=production`, `MAKAM_WEB_PORT=3100`, `APP_BASE_URL=https://makam.co.id` |
| Rahasia baru, dibuat di host | `POSTGRES_PASSWORD`, `DATABASE_URL` (bentuknya sama dengan staging), `AUTH_SECRET`, `TOTP_ENCRYPTION_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| Dari berkas GlitchTip | `SENTRY_DSN` (internal), `NEXT_PUBLIC_SENTRY_DSN` (public) |
| Disalin dari staging | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `VAPID_SUBJECT`, `SUMOPOD_API_KEY` (keputusan owner: sandbox yang sama) |
| Override | `SUMOPOD_BASE_URL=https://api-pay-sandbox.sumopod.com` |
| Ditempel owner | `SUMOPOD_WEBHOOK_SECRET`, `MAKAM_GITHUB_TOKEN`, `MAKAM_GLITCHTIP_TOKEN` |

- Lewat perbandingan hash, kelima rahasia baru dipastikan berbeda dari milik staging.
- `web-push` tidak ada di image, jadi pasangan VAPID dibuat dengan `crypto` bawaan Node di image makam (P-256, base64url tanpa padding).
- `GHCR_READ_TOKEN` tidak ada di `staging.env`, jadi tidak disalin.
- **Belum ditulis; menunggu keputusan owner:**
  - `MAKAM_IMAGE`: di staging `ghcr.io/andrianm28/makam`. Saran: pakai nilai yang sama.
  - `SENTRY_ENVIRONMENT`: di staging `staging`. Saran: `production`.
  - `SMTP_PORT`, `EMAIL_FROM_NAME`: punya nilai bawaan.

### Webhook SumoPod: perlu ditindaklanjuti
- Isian pertama `SUMOPOD_WEBHOOK_SECRET` ternyata **Webhook Token** (`whtok_`). Owner sudah menggantinya dengan **Signing Secret** (`whsec_`); preflight kini PASS untuk baris ini.
- Nilai di `prod.env` **sama** dengan milik `staging.env`. Ini cocok dengan dugaan bahwa project sandbox ini hanya punya satu endpoint dan satu signing secret.
- Di dashboard, URL webhook project ini sempat diubah ke `https://makam.co.id/api/webhooks/pembayaran)`, dengan `)` salah ketik di ujung, sehingga test webhook mendapat 404 dari aplikasi lama. Kalau project hanya punya satu URL, **webhook staging tidak lagi sampai**. Saran: kembalikan ke URL staging sampai switch nginx.
- Signing secret dan webhook token **sempat tertempel di chat, jadi keduanya harus di-rotate.** Kalau secret dipakai bersama, nilai barunya harus dipasang di `prod.env` **dan** `staging.env`.
- **Belum dikonfirmasi owner:** apakah rotate sudah dilakukan, dan URL webhook sekarang mengarah ke mana.

### D. Tiket 98
- **GlitchTip, 07:10–07:13Z:** satu event, `2026-10-02T07:11:27.606Z`.
  - Judul "Error: Invalid Server Actions request.", culprit `POST /(site)/masuk/page`, release `0ff5acb2…`.
  - Stack teratas: `rH`, `sw` di `next/dist/compiled/next-server/app-page-turbo.runtime.prod.js` (baris 102 dan 139).
  - Request: `multipart/form-data`, tanpa header `next-action` yang tercatat.
  - Event identik juga muncul `06:18:40Z` di release `ed9d9f34…`.
- **Reproduksi** di `sha-3467f785`, 2026-10-03 13:51:26 UTC:
  - Owner mengisi `uji98.repro@…invalid` dan menekan Kirim. Halaman menampilkan **"Masukkan Kode Masuk"**: berhasil.
  - Nginx mencatat `POST /masuk HTTP/2.0` **200**.
  - Log web dan worker selama rekaman kosong. Tidak ada event GlitchTip baru.
- **Kesimpulan:** galat tidak muncul lagi di image sekarang.
- **Dugaan, belum diuji ulang:** form dimuat sebelum deploy, lalu dikirim ke server dengan action ID yang sudah berbeda. Event terjadi di release `0ff5acb2…`, dan deploy ke `623dc4c1…` menyusul pukul 07:15.

### E. Preflight kedua
- Hasil: exit 1, **12 PASS / 3 FAIL**.
- **FAIL**, ketiganya memang diperkirakan brief selama belum ada promosi:
  - ghcr pull (belum ada digest rilis);
  - webhook forged signature (stack prod belum jalan);
  - backup and restore (`makam-backup-db` exit 1, stack prod belum jalan).
- **SKIP:** image signature, env schema, smtp send dan github deployments (keempatnya butuh image yang sudah di-pull), s3 (ditunda ke v2), uptime monitor (manual), nginx switch (gerbang owner).
- **PASS:** env file, docker daemon, compose plugin, disk, memory, dns dan certificate untuk `makam.co.id` dan `www.makam.co.id`, sumopod api key, sumopod webhook secret, backup encryption key.
- `sumopod api key` sudah PASS, padahal brief memperkirakan baris ini tetap FAIL sampai tiket 101. Penyebabnya, `SUMOPOD_BASE_URL` sandbox ikut dipakai preflight.
- Token GitHub baru benar-benar teruji setelah ada promosi.

## Tugas 3: branch `aos-02-sync-proof`

- Atas pilihan owner, jalur aturan diganti dari `/tmp/aos/sync.sh` ke `/home/ubuntu/aos/sync.sh`, karena `/tmp` bisa ditulis siapa pun di host.
- Worktree sementara `/tmp/makam-proof` dibuat dari `origin/main` `4eaf3f91`.
- Auto mode Claude Code menolak agen menyunting berkas izinnya sendiri ("Self-Modification"). Karena itu suntingan, commit dan push dijalankan owner sendiri lewat `!`. Commit memakai identitas `-c user.name/-c user.email`, karena clone baru tidak punya identitas git.
- Diff: kunci `"permissions": { "allow": ["Bash(/home/ubuntu/aos/sync.sh:*)"] }` di tingkat atas `.claude/settings.json`; JSON valid.
- **Head branch: `74393b55500a6c00271e4e39da2ecff238112db7`.** Tidak ke `main`, tanpa PR.
- Worktree sudah dihapus. Branch lokal masih ada di `makam-deploy`, dan `makam-deploy` bersih di `main`.

## Sisa pekerjaan untuk owner
1. Salin kedua `backup-passphrase` ke tempat offline.
2. Putuskan `MAKAM_IMAGE`, `SENTRY_ENVIRONMENT`, `SMTP_PORT` dan `EMAIL_FROM_NAME` untuk `prod.env`.
3. SumoPod: perbaiki URL webhook (kembalikan ke staging sampai switch nginx), rotate signing secret dan webhook token, lalu pasang secret baru di `prod.env` dan `staging.env`.
4. Taruh skrip sync di `/home/ubuntu/aos/sync.sh` sebelum bukti aos-02 dijalankan.
5. Tiket 98: putuskan apakah tiket ditutup (tidak bisa direproduksi di `sha-3467f785`) atau dugaan form-sebelum-deploy diuji dulu.

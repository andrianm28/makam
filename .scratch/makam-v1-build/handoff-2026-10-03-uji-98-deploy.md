# Uji tiket 98 pada deploy staging, 2026-10-03

## Lingkungan
- Staging: dev.makam.co.id, dengan basic auth. Deploy dari `sha-4eaf3f91` ke **`sha-70a87723`** (digest `sha256:987804fd…`): migrate ok 15:15:23, web dan worker sehat 15:15:32 UTC; `/api/health` 200 pukul 15:15:36.
- Browser: Playwright 1.63.0 dengan Chromium 153 headless yang sudah terpasang di host. Pull `mcr.microsoft.com/playwright:v1.63.0-noble` gagal dua kali (connection reset ke MCR), jadi tidak ada image yang dipakai atau perlu dihapus.
- Yang direkam: setiap respons (status dan panjang body; untuk POST juga 200 karakter pertama body), console, pageerror, dan screenshot di setiap langkah. Email dan kode 6 digit disensor di log.
- Screenshot dan `events.jsonl` ada di host, di `/home/ubuntu/uji98-2026-10-03/` (tidak di-commit).
- Alamat uji UAT: alamat Gmail owner yang bisa menerima email, tercatat di tiket 98.

## Hasil per kasus

| Kasus | Hasil | POST /masuk (nginx) | Panjang body | Event GlitchTip | Screenshot |
|---|---|---|---|---|---|
| 1. Form basi melewati deploy | **Gagal** | **404**, 15:15:39 | 44 | tidak | `k1-01-diisi-sebelum-deploy.png`, `k1-02-setelah-deploy-sebelum-klik.png`, `k1-03-hasil.png` |
| 2. Alamat `uji98@contoh.makam.invalid` | **Gagal** (tidak sesuai harapan) | 200, 15:16:17 | 195 (Playwright: 184) | tidak | `k2-04-diisi.png`, `k2-05-hasil.png` |
| 3. Minta kode lalu "Kirim ulang kode" | **Lolos** (pada percobaan ulang) | 200, 15:20:56 dan 200, 15:21:58 | 192 dan 193 | tidak | `k3-06-kode-terkirim.png` (percobaan pertama), `k3-07-kode-terkirim.png`, `k3-08-kirim-ulang-terbuka.png`, `k3-09-hasil.png` |

### Kasus 1: form basi
- Langkahnya: `/masuk` dibuka pukul 14:28:36 di `sha-4eaf3f91` dan alamat uji diisi tanpa menekan apa pun. Setelah deploy selesai, "Kirim Kode Masuk" ditekan pukul 15:15:39 tanpa memuat ulang.
- **Server:** `POST /masuk` mendapat **404**. Log web mencatat `Error: Failed to find Server Action "608940fc…". This request might be from an older or newer deployment.`
- **Browser:** pageerror `Server Action "608940fc…" was not found on the server`, lalu halaman galat Next.js "This page couldn't load / Reload / Back" (`k1-03`). Tidak ada pesan dalam bahasa Indonesia, dan tidak ada petunjuk agar pengguna memuat ulang.
- Penyebab galat tiket 98 sekarang terkonfirmasi: form yang dimuat sebelum deploy mengirim ID Server Action lama. Bedanya dengan 2026-10-02: kini statusnya 404 (sebelumnya 500, "Invalid Server Actions request"), tetapi pengguna tetap mendarat di halaman galat.
- Tidak ada event GlitchTip, karena galat ini hanya muncul di log container.

### Kasus 2: alamat yang tidak bisa menerima email
- Halaman dimuat ulang, lalu kode diminta untuk `uji98@contoh.makam.invalid`.
- Harapannya pesan "gagal kirim". **Yang terjadi:** respons `{"status":"terkirim", …, "resendInSeconds":58}` dan layar "Masukkan Kode Masuk … sudah kami kirim ke [email]" (`k2-05`).
- Tidak ada halaman galat dan tidak ada 5xx. Tetapi relay SMTP tampaknya menerima pesan ke domain `.invalid` (penolakan, kalau ada, baru datang belakangan sebagai bounce), sehingga Identity menganggapnya terkirim. "Gagal kirim" hanya muncul kalau relay menolak pada saat pengiriman.
- **Untuk owner:** perlu diputuskan apakah ini sesuai spec. Kalau "gagal kirim" juga harus muncul untuk alamat semacam ini, aturannya perlu validasi domain atau penanganan bounce.

### Kasus 3: Kirim ulang kode
- **Percobaan pertama, 15:16:20, di sesi browser yang sama dengan kasus 2:** respons `{"status":"gagal","message":"Kode baru bisa dikirim dalam 56 detik."}`. Batas jeda kirim ulang ternyata berlaku per sesi atau per perangkat, bukan per alamat: permintaan untuk alamat lain pun ditolak, 4 detik setelah kasus 2. Layar tetap di langkah email, sehingga skrip tidak menemukan tombol "Kirim ulang kode" (batas tunggu skrip 240 detik). Ini kekurangan desain uji, bukan galat aplikasi.
- **Percobaan ulang dengan sesi baru:** "Kirim Kode Masuk" pukul 15:20:56 mendapat 200 `terkirim` (`resendInSeconds: 60`). Tombol "Kirim ulang kode" aktif setelah hitung mundur. Klik pukul 15:21:58 mendapat 200, layar tetap "Masukkan Kode Masuk", dan hitung mundur mulai lagi ("Kirim ulang kode (57 detik)", `k3-09`).

## Bukti untuk rentang 14:28–15:22 UTC
- **GlitchTip (makam-staging):** tidak ada event baru. Event terbaru masih 2026-10-02T07:11:27Z "Error: Invalid Server Actions request.".
- **Log container web staging sejak 15:15:** tidak ada baris 5xx. Satu baris galat: `Failed to find Server Action "608940fc…"` pukul 15:15:39 (kasus 1).
- **Nginx dev.makam.co.id, POST /masuk:** 15:15:39 404 44; 15:16:17 200 195; 15:16:20 200 182; 15:20:56 200 192; 15:21:58 200 193.

## Temuan sampingan
- `deploy.log` pada deploy 15:15 memuat teks usage `makam-deploy-status --env staging state <in_progress|success|failure> "<description>"`, ditambah catatan bahwa tanpa curl/jq setiap panggilan hanya dicatat. Tampaknya skrip itu dipanggil dengan argumen yang tidak dikenalinya. Deploy tidak terganggu; perlu dicek di tiket deploy-status.
- Pull `:latest` dari ghcr gagal karena TLS handshake timeout beberapa kali hari ini (11:58, 13:41, 13:50, 14:09, 14:58, 15:02). Timer berikutnya selalu berhasil.

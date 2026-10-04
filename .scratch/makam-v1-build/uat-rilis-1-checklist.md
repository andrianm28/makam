# Checklist UAT Rilis 1 — uji manual (human)

Environment: `https://dev.makam.co.id` (staging; banner "STAGING — bukan layanan resmi").
Isi bukti tiap langkah: screenshot + catatan HTTP/webhook. Tandai `[x]` bila lolos.
Sumber: spec "Release plan", ticket 61 AC, handoff 2026-10-01, ADR 0004/0005.

## 0. Prasyarat & akun
- [ ] `/api/health` staging `ok` + worker `fresh`.
- [ ] Akun **Admin Platform** (email + authenticator TOTP) siap; penerima Kode Masuk memang membaca mailboxnya.
- [ ] Akun **Admin Lokasi** untuk Lokasi uji (mis. `firdaus@makam.co.id`) sudah memegang peran; Kontak Siaga sudah dipilih.
- [ ] Mailbox penerima **tidak** di suppression list SumoPod; cek spam.
- [ ] Proyek SumoPod: **"Charge fee to customer" OFF** (fee ditanggung Operator), webhook URL `/api/webhooks/pembayaran` tersimpan, **"Save & Test"** 2xx.
- [ ] Pengaturan Operator terisi (nama resmi, alamat, kontak, nomor CS) — bila kosong, isi dulu.

## 1. Masuk & identitas
- [ ] `/masuk` → email → "Kirim Kode Masuk" → Kode Masuk tiba (≤ beberapa menit).
- [ ] Kode salah → pesan "kode salah", bisa coba lagi.
- [ ] Kode benar → masuk; staf mendarat di Area Staf, Pemesan di Akun Saya.
- [ ] **Admin Platform** diminta **TOTP** setelah Kode Masuk; kode TOTP salah → pesan jelas.
- [ ] Resend Kode Masuk menghormati cooldown (~59 s) dan batas per-email/IP.
- [ ] Email `.invalid`/tidak ada → muncul **"gagal kirim"** (bukan halaman error framework) — ticket 98.

## 2. Journey Terencana (Lokasi Mitra) — end to end
- [ ] `/pesan-makam/terencana` → kartu Lokasi tampil; filter kota.
- [ ] Pilih Lokasi → **Denah**: tab Blok, tombol Petak (label `… Tersedia`), pilih Petak (mis. A-01).
- [ ] Data & kirim: isi Nama/Email/Nomor → **Kirim Kode Masuk** → masukkan kode → **Kirim pesanan** → "Pesanan terkirim" + **Nomor Pemesanan** (mis. `MKM-2026-000001`); Petak ter-*hold*.
- [ ] Denah publik menunjukkan Petak itu **Dipesan** (tak bisa dipilih lagi).
- [ ] **Admin Lokasi** (Lokasi itu): baris **Konfirmasi Terencana** muncul di Antrean Lokasi → buka → **Konfirmasi pesanan** (atau Tolak + alasan).
- [ ] Setelah konfirmasi: **Tagihan terbit** (`TGH/…`, Belum Dibayar, jatuh tempo 24 jam).
- [ ] Email **Tagihan** ke Pemesan tiba (berisi tautan bayar).
- [ ] Bukti/Petak tetap ditahan sampai dibayar.

## 3. Pembayaran QRIS (sandbox) — ticket 61 AC
- [ ] Pemesan buka Tagihan → **Bayar Rp <total>** → dialihkan ke checkout `pay-sandbox.sumopod.com`.
- [ ] Jumlah di checkout **sama persis** dengan total Tagihan (fee ditanggung Operator).
- [ ] Checkout: pilih QRIS → QR tampil; **"Simulate Payment"** (Test Mode) → "waiting for confirmation".
- [ ] Webhook `payment.completed` diterima app (**2xx**; cek dashboard SumoPod Webhooks = delivered 2xx).
- [ ] Tagihan berubah **Lunas**; **Bukti Pembayaran** terbit (channel QRIS).
- [ ] Order **Aktif**; **Bukti Pemesanan** terbit; **Hak Pakai** tampil di `/makam-keluarga`.
- [ ] Uang masuk tercatat benar (net = total − fee SumoPod).
- [ ] **Bukti Pengembalian Dana** (bila dibatalkan) — lihat §6.

## 4. Journey Saat Duka (Lokasi Mitra) — end to end
- [ ] `/pesan-makam/saat-duka` → daftar Lokasi × Jenis Makam; pilih.
- [ ] Isi data Almarhum/keluarga → Kode Masuk → Kirim.
- [ ] **Admin Lokasi**: baris Konfirmasi Saat Duka di Antrean → konfirmasi (Tagihan pay-after).
- [ ] Bayar Tagihan → **Catat Pemakaman** (bukti) → order **Selesai** + **Bukti Pemesanan**.
- [ ] Denah: Petak menjadi **Terisi**; Hak Pakai tercatat.

## 5. Journey Perpanjangan (Lokasi Mitra, OTP) — ADR 0005
- [ ] Dari **Akun Saya → Makam** atau tile **Perpanjang Makam** → halaman Perpanjangan.
- [ ] Pilih masa perpanjangan → Kode Masuk ke email Pemegang Hak (OTP) → kirim permohonan.
- [ ] **Admin Lokasi**: verifikasi permohonan (setuju/tolak/minta perbaikan) di halaman Perpanjangan.
- [ ] Disetujui → Tagihan/Perpanjangan → bayar → **Bukti Perpanjangan**; tanggal akhir Hak Pakai bertambah.

## 6. Job desk Admin Lokasi (semua)
- [ ] Antrean Lokasi: konfirmasi/tolak pesanan (Terencana & Saat Duka).
- [ ] **Denah**: buat/edit Blok; tandai Petak/Kavling/Jalan/Bukan Petak/Pintu Masuk; clearing Petak (Perlu Verifikasi).
- [ ] **Jam Operasional** + **Tanggal Tutup**; **Kontak Siaga**.
- [ ] **Catat Pemakaman** (Lokasi Mitra).
- [ ] **Catat dibayar langsung ke Lokasi** (unggah bukti); Admin Platform bisa membatalkan bila keliru.
- [ ] **Pembatalan** (Terencana) & **Pengembalian Hak Pakai** (kelola permintaan).
- [ ] **Perpanjangan**: verifikasi (lihat §5).
- [ ] **Layanan**: kerjakan Pekerjaan Layanan + unggah bukti foto; status Selesai.
- [ ] **Tagihan lewat jatuh tempo** (chasing) di lokasi.
- [ ] **Audit Log** lokasi: setiap tulisan staf tercatat.

## 7. Notifikasi Admin Lokasi — semua kanal (ticket 97)
- [ ] **Baris Antrean** muncul saat ada tugas (Konfirmasi Terencana/Saat Duka).
- [ ] **Bell** (Peringatan Staf) di Area Staf menampilkan peringatan; bisa ditandai dibaca.
- [ ] **Email** Peringatan Staf tiba.
- [ ] **Push**: pasang Area Staf ke Layar Utama → aktifkan notifikasi push → peringatan tiba sebagai push.
- [ ] Kegagalan kirim di-*retry* worker (tiket 91/96); kanal yang sudah sukses tidak dikirim ulang; lonceng sekali.

## 8. Admin Platform (back office)
- [ ] Tagihan: cari by nomor → **buka detail** (fix 99) → catat pembayaran manual / tetapkan Harga Khusus / batalkan pembayaran langsung.
- [ ] Pengembalian: setujui refund (dengan catatan fee bila Harga Khusus) → transfer + **Bukti Pengembalian Dana**.
- [ ] Tagihan lewat jatuh tempo (chasing), Laporan, Pencairan, Keluhan, Pengaturan Operator.
- [ ] Staf: undang peran; Audit Log platform.

## 9. Negatif / tepi
- [ ] Bayar saat Tagihan sudah Lunas → diarahkan ke Bukti (bukan bayar ulang).
- [ ] Bayar saat provider gagal → pesan ramah + retry (bukan halaman error framework).
- [ ] Jumlah Tagihan > Rp 10 juta → ditolak dengan penjelasan cap QRIS.
- [ ] Petak yang baru di-*hold* tak bisa dipilih lagi oleh orang lain.
- [ ] Webhook `payment.expired`/`failed` → Tagihan tetap bisa Bayar; `perlu_ditinjau` bila nominal tak cocok.

## 10. Penutup
- [ ] **Batalkan order uji** (mis. `MKM-2026-000001`) agar Petak kembali **Tersedia**.
- [ ] Catat tanggal uji di `docs/ops/runbook.md` ("Test payment (SumoPod sandbox)").
- [ ] Centang AC **ticket 61** + "What is NOT proved" handoff.
- [ ] Simpan semua screenshot di satu folder + rekap webhook (dashboard SumoPod).

## 11. Layanan dari sisi keluarga di Lokasi Mitra — ADR 0006 (tiket 49–54)
Layanan di Lokasi Mitra masuk Rilis 1 (ADR 0006). Prasyarat: Hak Pakai aktif dari §3 (Petak Aktif di `/akun/makam`); Lokasi menyalakan minimal satu Layanan **tanpa isian teks** dengan harga Lokasi; Biaya Layanan Platform contoh terisi; Admin Lokasi memakai perangkat berkamera (runner memakai kamera palsu Chromium). Tag: **[BAYAR]** wajib selesai di staging sebelum switch.
- [ ] **[BAYAR]** **Pesan Layanan** (tiket 50): Makam Keluarga → pilih Lokasi Mitra → cari Nomor Makam → "Layanan Makam" → pilih varian + tanggal target (tidak boleh di dalam lead time; jendela ±2 hari) → isi data (sudah masuk atau Kode Masuk) → **Pesan layanan** → Nomor Pesanan Layanan dan Tagihan.
- [ ] **[BAYAR]** Tagihan Layanan: total = harga item + **satu** Biaya Layanan Platform, sama persis dengan rincian di form; **Bayar QRIS** (sandbox) → Lunas → Pekerjaan Layanan **Dijadwalkan**; halaman `/layanan/<nomor>` menunjukkan "Sudah dibayar".
- [ ] **[BAYAR]** **Layanan saat checkout** (tiket 53): (a) **Saat Duka** hanya menawarkan item hari-H, barisnya masuk Tagihan bayar-belakang yang sama (tetap bayar-belakang); (b) **Terencana** untuk satu petak hanya menawarkan item petak-kosong, bayar-dulu dengan jatuh tempo paling awal; (c) **Perpanjangan** punya langkah opsional "Tambah Layanan", barisnya di Tagihan Perpanjangan **tanpa mengubah jatuh tempo 3×24 jam**, tanggal target minimal lead time setelah jatuh tempo itu; satu Biaya Layanan Platform per Tagihan. Bayar salah satunya (QRIS) sampai Lunas.
- [ ] **Admin Lokasi mengerjakan**: baris "Layanan hari ini" / "Layanan akan datang" di Antrean Lokasi → buka Pekerjaan Layanan → **Mulai kerjakan** → bukti dari kamera aplikasi (foto sebelum dan sesudah sesuai katalog, bertimestamp, tanpa unggah galeri) → **Tandai selesai** → bukti terkirim ke Pemesan (Selesai); Terlambat (target + 2 hari tanpa bukti) muncul sebagai baris.
- [ ] **Keluhan dan Penilaian** (tiket 51): Pemesan melihat bukti pekerjaan dan jendela Keluhan 3×24 jam; **Keluhan** ("Ada yang belum sesuai?") membuat baris Tier 1 untuk Admin Platform (respons pertama 4 jam hari; keputusan tolak / kerja ulang / refund; baris "Kerjakan ulang" untuk Admin Lokasi); **Penilaian** 1–5 bintang + komentar hanya terbaca Admin Platform (tidak Admin Lokasi); Keluhan setelah jendela ditolak.
- [ ] **Thread pesan** (tiket 52): Pemesan dan Admin Lokasi saling kirim pesan teks dan foto di halaman pekerjaan; pesan baru mengirim email ke Pemesan **tanpa isi pesan** dengan tautan balas; Admin Platform dapat membaca dan menulis; thread menjadi baca-saja saat jendela Keluhan tutup; kontak tidak dipertukarkan lewat platform.
- [ ] **Batalkan Layanan** sebelum H-1 atau sebelum dikerjakan: item dikembalikan, Biaya Layanan Platform ditahan (refund lewat Admin Platform, §8); Terlambat dibatalkan karena keterlambatan: refund penuh termasuk Biaya Layanan Platform.
- [ ] Layar pesan **Paket Layanan** (tiket 54) tidak tampil di aplikasi (ditunda; hanya definisi dan siklus di domain).

## Exit criteria
Semua butir §2–§7 dan §11 tercentang tanpa kegagalan terbuka; hanya **ticket 65 (go-live)** yang tersisa (human-gated).

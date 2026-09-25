# Draf teks halaman konten Makam.co.id v1

Status: draft for Operator sign-off (build ticket 06, last criterion)
Owners: build tickets 26 (homepage, shell, Tentang Kami, Cara Kami Bekerja, FAQ, Hubungi Kami) and 43 (Pengurusan di TPU DKI)
Sources: `.scratch/makam-v1/spec.md` (Public site and routing decisions; Domain modules), decision tickets 20, 24, 26, 29, research `dki-tpu-burial-sequence.md` and `cemetery-plot-regulation.md`, `CONTEXT.md`.

Conventions in this file:
- Everything inside `{kurung_kurawal}` is a placeholder. Admin Platform sets these in the dashboard or config (ticket 06). They are listed at the end.
- `<!-- ... -->` comments are for reviewers and are not rendered.
- `[CATATAN EDITOR: ...]` marks a line that needs a decision before publishing. Remove the note once decided.
- Login is by a code sent to WhatsApp, or to a verified email once the account has one (email login, decided 2026-09-25). New accounts are created only through WhatsApp. SMS is not mentioned anywhere (removed from v1 on 2026-09-25).
- No YIEM, no yayasan mission language. The spec says the legal name appears "only in the footer and document headers", but it also requires Tentang Kami to say PT Jaya Korpora Prima runs the site and Hubungi Kami to give the Operator's address. This draft also uses the name in FAQ 10 (who receives the money) and in the Pengurusan di TPU DKI anti-perantara paragraph (Tagihan resmi atas nama ...). [CATATAN EDITOR: decide whether those two extra uses stay or are reworded to "pengelola Makam.co.id".]

---

## 1. Beranda (homepage), trust strip, tile dan footer

<!-- Spec: Public site and routing decisions > Home; stories 1–6, 16; ticket 29 §1. Headline fixed by ticket 29 Final review. -->

### Judul

**Layanan Pemakaman Lebih Mudah, Jelas, dan Terpercaya.**

### Hero (dua tombol, "Keluarga baru saja wafat" tampil lebih dulu)

**Tombol utama: Keluarga baru saja wafat**
Keterangan kecil di bawah tombol:
> Pilih makam di lokasi mitra atau TPU DKI. Tidak ada yang dibayar sekarang, dan dokumen bisa menyusul.

**Tombol kedua: Siapkan makam untuk nanti**
Keterangan kecil:
> Pilih petak makam di lokasi mitra dengan tenang, lalu bayar setelah pengelola mengonfirmasi.

<!-- Saat Duka: nothing paid at submission, documents can follow (story 25). Terencana: Admin Lokasi confirms, then a pay-first hold (story 46). -->

### Baris tile

| Tile | Teks kecil | Tujuan |
|---|---|---|
| **Perpanjang Makam** | Perpanjang masa Hak Pakai atau IPTM makam keluarga. | Hub Makam keluarga, aksi Perpanjang terpilih |
| **Layanan Makam** | Bunga, nisan, pembersihan dan perawatan makam, dengan foto bukti. | Hub Makam keluarga, aksi Layanan terpilih |
| **Urus di TPU DKI** | Panduan gratis mengurus sendiri, atau kami bantu urus. | Halaman Pengurusan di TPU DKI |
| **Wakaf Tanah** | Ajukan wakaf tanah untuk pemakaman kepada Nazhir. | Halaman Wakaf Tanah |

### Trust strip

> **Lokasi terverifikasi · Harga transparan · Bantuan administrasi**

Tiap kata menaut ke bagiannya di halaman Cara Kami Bekerja:
- Lokasi terverifikasi → `/cara-kami-bekerja#lokasi-terverifikasi`
- Harga transparan → `/cara-kami-bekerja#harga-transparan`
- Bantuan administrasi → `/cara-kami-bekerja#bantuan-administrasi`

### Tautan CS di bawah trust strip

> Butuh bantuan? **WhatsApp CS**

(Tautan ke `{tautan_wa_cs}`.)

### Footer

Baris utama (teks persis):

> Makam.co.id dikelola oleh PT Jaya Korpora Prima

Tautan footer: Tentang Kami · Cara Kami Bekerja · Pengurusan di TPU DKI · FAQ · Hubungi Kami

---

## 2. Tentang Kami

<!-- Spec: Public site and routing decisions > Content pages > Tentang Kami: what makam.co.id is; run by PT Jaya Korpora Prima; owns no land; works with partner cemeteries and DKI TPUs. No YIEM. Ticket 20. -->

### Tentang Makam.co.id

Ketika seseorang yang kita sayangi meninggal, keluarga sering hanya punya beberapa jam untuk menemukan makam. Harga sulit diketahui, dokumen asing, dan tidak jelas siapa yang bisa dimintai tolong. Makam.co.id dibuat supaya urusan ini lebih jelas.

Di Makam.co.id Anda dapat:

- **Memesan makam**, saat duka maupun untuk nanti, di lokasi makam yang bekerja sama dengan kami (Lokasi Mitra), atau dimakamkan di TPU milik Pemprov DKI Jakarta melalui Pengurusan.
- **Memperpanjang makam**, yaitu Hak Pakai di Lokasi Mitra atau izin penggunaan tanah makam (IPTM) di TPU DKI.
- **Memesan Layanan Makam** seperti bunga, nisan, pembersihan dan perawatan rumput, sekali atau berkala, dengan foto bukti pekerjaan.
- **Mengajukan wakaf tanah** untuk pemakaman. Kami membantu mempertemukan Anda dengan Nazhir dan mengikuti prosesnya.

### Siapa kami

Makam.co.id dikelola oleh **PT Jaya Korpora Prima**. Kami menandatangani kerja sama dengan setiap Lokasi Mitra, menerima pembayaran, dan menerbitkan setiap Tagihan serta bukti pembayaran atas nama PT Jaya Korpora Prima.

### Kami tidak memiliki tanah makam

Makam.co.id tidak memiliki dan tidak mengelola tanah makam.

- Di **Lokasi Mitra**, Hak Pakai makam diberikan oleh pengelola lokasi tersebut. Nama pengelolanya tertera di halaman lokasi, dan Bukti Pemesanan diterbitkan atas nama Lokasi Mitra.
- Di **TPU DKI**, izin makam (IPTM) diterbitkan oleh Pemprov DKI Jakarta. Kami hanya membantu mengurusnya bila Anda meminta, dan Anda juga dapat mengurusnya sendiri tanpa biaya.
- Untuk **wakaf tanah**, tanah diwakafkan langsung kepada Nazhir; makam.co.id tidak menerima tanah maupun uang.

### Dari mana kami mendapat penghasilan

Kami menjelaskannya secara terbuka:

- **Biaya Layanan Platform**, biaya tetap kami pada pesanan di Lokasi Mitra, selalu tampil sebagai baris tersendiri.
- **Biaya Pengurusan**, biaya jasa kami untuk mengurus pemakaman atau IPTM di TPU DKI. Ini biaya jasa, bukan biaya pemerintah.
- **Selisih harga Layanan di TPU DKI**, dari harga Layanan yang tercantum dikurangi upah Mitra Jasa yang mengerjakannya.

Kami tidak mengambil komisi dari tarif Lokasi Mitra, dan kami tidak mengirim pesan promosi.

<!-- Spec: Out of Scope ("v1 earns only the Biaya Layanan Platform, the Biaya Pengurusan and the TPU Layanan margin"; commission on partner tariffs out of scope); Notifications ("No marketing messages"). -->
[CATATAN EDITOR: the "Dari mana kami mendapat penghasilan" section is optional. It follows the spec, but the Operator may prefer not to publish the TPU Layanan margin line. Also, "tidak mengambil komisi" is true for v1 only; drop it if a commission is planned.]

### Cara kami bekerja

Apa arti "lokasi terverifikasi", "harga transparan" dan "bantuan administrasi" kami jelaskan di halaman **Cara Kami Bekerja**.

---

## 3. Cara Kami Bekerja

<!-- Spec: Public site and routing decisions > Content pages > Cara Kami Bekerja (three sections); ticket 24 in full; Domain modules > 3. Lokasi (publish gate), 4. Tariffs, 8. Pengurusan, 10. Billing. -->

Di beranda kami menyebut tiga hal: lokasi terverifikasi, harga transparan dan bantuan administrasi. Di halaman ini kami jelaskan artinya, termasuk apa yang tidak termasuk di dalamnya.

### Lokasi terverifikasi {#lokasi-terverifikasi}

Sebuah Lokasi Mitra baru tampil di Makam.co.id setelah **ketiga** hal berikut selesai:

1. **Perjanjian kerja sama** dengan pengelola lokasi sudah ditandatangani.
2. **Kunjungan Verifikasi** oleh Petugas Lapangan kami sudah dilakukan. Petugas datang ke lokasi, memastikan alamat dan titik peta, memotret lokasi, dan memeriksa daftar fasilitas (misalnya mushola, parkir, akses jalan mobil, air, keamanan dan jam buka).
3. **Jenis makam dan tarifnya** sudah dimasukkan dan diperiksa oleh tim kami.

Karena itu setiap Lokasi Mitra yang tampil sudah terverifikasi. Tidak ada lokasi yang tampil tanpa pemeriksaan ini.

Di halaman setiap Lokasi Mitra Anda akan melihat:
- tulisan **"Terverifikasi Makam.co.id · dikunjungi <bulan tahun>"**, yaitu tanggal kunjungan terakhir;
- **foto kunjungan** dari Petugas Lapangan, dengan tanggalnya;
- daftar fasilitas yang diperiksa saat kunjungan;
- nama pengelola ("Dikelola oleh ..."), yaitu pihak yang memberikan Hak Pakai kepada Anda.

**Pemesanan untuk nanti** (memilih petak sendiri di denah) dibuka terpisah. Fitur ini baru aktif setelah petak yang dijual di lokasi itu diperiksa satu per satu dan petugas kami mencocokkan denah dengan keadaan di lapangan. Sebelum itu halaman lokasi menampilkan "Pemesanan terencana segera tersedia".

**Status ini bisa dicabut.** Bila ada masalah berulang, kami dapat menangguhkan sebuah lokasi. Halamannya tetap ada dengan tulisan "sementara tidak menerima pesanan", dan urusan atas makam yang sudah ada (perpanjangan, layanan, pemakaman di makam keluarga) tetap berjalan. Bila kerja sama berakhir, Hak Pakai Anda tetap berlaku terhadap pengelola lokasi, dan dokumen Anda tetap bisa diunduh di Akun Saya.

Kami juga dapat mengunjungi ulang sebuah lokasi kapan saja, dan tanggal "dikunjungi" akan diperbarui. Kunjungan ulang tidak dijadwalkan secara rutin.

**TPU DKI tidak kami sebut "terverifikasi".** TPU adalah pemakaman resmi milik Pemprov DKI Jakarta, dan kami tidak memeriksanya. Halamannya bertuliskan "TPU resmi Pemprov DKI Jakarta", disertai sumber data dan tanggal terakhir status penerimaan makam baru diperbarui.

[CATATAN EDITOR: the spec does not say what the check excludes. Suggested optional line, for the Operator to keep or drop: "Kunjungan Verifikasi tidak mencakup pemeriksaan sertifikat tanah atau perizinan lokasi." It is honest and avoids over-promising, but it names a gap.]

### Harga transparan {#harga-transparan}

**Harga di halaman sama dengan harga di Tagihan.**

- Di halaman setiap Lokasi Mitra, sebelum Anda memesan dan tanpa perlu masuk, kami tampilkan harga Hak Pakai per jenis makam beserta masa berlakunya, biaya pemakaman (dan biaya tumpang bila berbeda), harga perpanjangan, harga Layanan, kebijakan pembatalan, dan daftar dokumen.
- Setiap harga ditampilkan sebagai **total semua biaya**, dengan rinciannya dalam huruf kecil. Angka yang sama muncul di kartu pilihan, di bilah total saat memesan, dan di Tagihan.
- **Biaya Layanan Platform** ({biaya_layanan_platform}) selalu tampil sebagai baris tersendiri, terpisah dari tarif Lokasi Mitra. Biaya ini dikenakan satu kali per Tagihan.
- Tertulis **"Harga berlaku sejak <tanggal>"**. Bila tarif akan berubah, tertulis **"Harga baru mulai <tanggal>"** sebelum perubahan berlaku.

**Tagihan tidak pernah diubah diam-diam.** Tagihan yang sudah terbit tidak diubah. Bila ada koreksi, Tagihan lama dibatalkan dan diganti dengan yang baru. Bila keluarga dalam kesulitan diberi keringanan (Harga Khusus), keringanan itu tampil sebagai baris pengurang tersendiri, bukan harga yang diubah.

**Yang dihitung dengan tarif pada harinya.** Biaya pemakaman untuk pemakaman berikutnya dan harga perpanjangan mengikuti tarif yang berlaku pada hari itu. Saat Anda memesan untuk nanti, biaya pemakaman kami tampilkan sebagai baris "Nanti", sesuai tarif saat pemakaman, dengan tarif hari ini sebagai gambaran. Paket Layanan berkala memakai tarif baru mulai siklus berikutnya, dan pesan tagihannya menyebutkan perubahan itu.

**Di TPU DKI**, kotak harga menunjukkan:
- **Retribusi IPTM: {retribusi_pemda_iptm}**. Saat ini Rp 0, gratis sejak Perda DKI 1/2024.
- **Biaya Pengurusan**, ditandai sebagai biaya jasa kami: {biaya_pengurusan_pemakaman} bila kami mengurus pemakaman, dan {biaya_pengurusan_berkas} bila kami hanya mengurus berkas IPTM (perpanjangan, atau setelah keluarga memakamkan sendiri).
- Pada pesanan di TPU tidak ada Biaya Layanan Platform.

Bila suatu saat Pemda menetapkan retribusi, jumlahnya ditagihkan apa adanya sebagai baris terpisah dan kami setorkan ke Pemda.

### Bantuan administrasi {#bantuan-administrasi}

**Izin makam di TPU DKI gratis, dan Anda boleh mengurusnya sendiri.**

Izin Penggunaan Tanah Makam (IPTM) di TPU DKI tidak dipungut biaya. Keluarga dapat mengurusnya sendiri melalui TPU dan layanan perizinan Pemprov DKI (JakEVO atau PTSP Kelurahan). Kami menulis **panduan gratisnya** di halaman Pengurusan di TPU DKI.

Bila Anda ingin kami yang mengurus, **Biaya Pengurusan adalah biaya jasa untuk kemudahan**, bukan biaya pemerintah. Kami mengurus berkasnya dengan surat kuasa dari Anda. IPTM tetap diterbitkan oleh Pemprov DKI dan tetap atas nama ahli waris keluarga. Salinan IPTM yang terbit kami kirim ke Anda dan kami simpan di Akun Saya, **termasuk bila Tagihan belum dibayar**.

**Di Lokasi Mitra**, kami tampilkan daftar dokumen yang dibutuhkan sebelum Anda memesan. Saat duka, dokumen boleh diunggah belakangan atau dibawa pada hari pemakaman. Kekurangan dokumen tidak menghambat pemakaman.

---

## 4. FAQ

<!-- Spec: Public site and routing decisions > Content pages > FAQ (booking vs Hak Pakai; what is paid when; Pembatalan; Perpanjangan; TPU eligibility; documents; data use). Each answer is followed by the spec section it follows. 25 Q&As. -->

### Pemesanan makam

**1. Apakah saya membeli tanah makam?**

Tidak. Di Lokasi Mitra, yang Anda peroleh adalah **Hak Pakai**, yaitu hak untuk menggunakan satu petak makam (atau satu kavling keluarga). Hak Pakai diberikan oleh pengelola lokasi, bukan oleh Makam.co.id. Masa berlakunya tergantung jenis makam: selamanya, atau sejumlah tahun yang dihitung sejak pemakaman pertama. Setelah dibayar, Anda menerima **Bukti Pemesanan** atas nama Lokasi Mitra. Di TPU DKI, hak atas makam dibuktikan dengan **IPTM** yang diterbitkan Pemprov DKI.
<!-- Spec: Domain modules > 5. Inventory (Hak Pakai: tenure, clock starts at first Pemakaman); 10. Billing > Documents (Bukti Pemesanan in the Lokasi Mitra's name); 8. Pengurusan (No Bukti Pemesanan at a TPU); CONTEXT.md Hak Pakai, IPTM. -->

**2. Keluarga baru saja wafat. Apakah harus membayar dulu?**

Tidak. Pemesanan saat duka tidak meminta pembayaran di awal. Tagihan terbit setelah lokasi mengonfirmasi, dan jatuh temponya **setelah pemakaman**, pada batas waktu yang tertera di Tagihan (umumnya 3×24 jam setelah pemakaman). Pemakaman tetap berjalan meskipun Tagihan belum dibayar. Hal yang sama berlaku bila kami mengurus pemakaman di TPU DKI.
<!-- Spec: Solution 1; User Stories 25, 29; Domain modules > 10. Billing > Due rules by kind (Saat Duka pay-after, 3×24 h after the burial, per Lokasi); 3. Lokasi (Saat Duka payment window default 3×24 h); 8. Pengurusan (payment rule). -->

**3. Berapa lama sampai pesanan dikonfirmasi?**

Di Lokasi Mitra, pengelola mengonfirmasi dalam **2 jam pada jam operasional lokasi**. Bila Anda memesan di luar jam operasional, kartu lokasi menunjukkan kapan konfirmasi paling lambat datang, beserta kontak siaga yang bisa Anda telepon. Di TPU DKI, tim kami mengonfirmasi dalam **2 jam layanan (pukul 06:00–18:00)**. Waktu konfirmasi yang dihitung untuk pesanan Anda tampil begitu pesanan terkirim.
<!-- Spec: Solution 1; User Stories 20, 28, 72; Domain modules > 3. Lokasi (working-time calculator); ticket 26 §3. -->

**4. Dokumen apa yang perlu disiapkan?**

Biasanya: surat keterangan kematian dari rumah sakit atau Puskesmas, surat keterangan laporan kematian dari Kelurahan atau RT/RW, serta KTP dan KK almarhum dan pemesan. Setiap Lokasi Mitra dapat menyesuaikan daftarnya, jadi periksa daftar di halaman lokasi. Saat duka, dokumen boleh **diunggah belakangan atau dibawa pada hari pemakaman**. Untuk TPU DKI, daftar dokumennya ada di halaman Pengurusan di TPU DKI.
<!-- Spec: Domain modules > 3. Lokasi (document checklist default, editable per Lokasi); User Stories 30; 8. Pengurusan (two document sets). -->

**5. Bagaimana jika lokasi tidak dapat menerima pesanan saya?**

Pengelola dapat menawarkan pilihan lain (jenis makam lain atau hari lain) yang bisa Anda terima atau tolak dengan satu ketukan, disertai total harga yang baru. Bila pesanan ditolak, Anda menerima tautan WhatsApp ke pilihan lain di kota Anda, termasuk TPU DKI, dengan data yang sudah terisi. Tim kami juga akan menelepon Anda dalam 2 jam.
<!-- Spec: User Stories 31, 32, 33; Domain modules > 6. Pemesanan (Tawarkan alternatif / Tolak); 14. Work Queues (Tier 1 Saat Duka ditolak, call within 2 h); Public site > After a Tolak. -->

**6. Bisakah saya membatalkan pemesanan saat duka?**

Bisa, selama pemakaman belum dilakukan. Sebelum konfirmasi, belum ada yang ditagihkan. Setelah konfirmasi, Anda perlu menuliskan alasannya, lalu Tagihan dibatalkan. Bila sudah ada pembayaran, uang dikembalikan kecuali Biaya Layanan Platform. Tidak ada biaya pembatalan.
<!-- Spec: User Stories 34; Domain modules > 6. Pemesanan > Saat Duka (cancellation; no cancellation fee); 10. Billing > Refunds (Pemesan cancels: platform fee kept). -->

**7. Bagaimana cara memesan makam untuk nanti?**

Pilih lokasi, lalu pilih petak atau kavling keluarga langsung di denah. Petak yang Anda pilih ditahan untuk Anda sejak pesanan dikirim. Pengelola mengonfirmasi paling lambat pada akhir hari kerja berikutnya. Setelah itu Anda membayar dalam batas waktu tahan yang tertera (umumnya 24 jam), dan kami kirim pengingat sekitar 4 jam sebelum batas itu berakhir. Sebelum membayar, Anda bisa menarik pesanan kapan saja tanpa biaya. Pemesanan untuk nanti hanya tersedia di Lokasi Mitra, tidak di TPU.
<!-- Spec: User Stories 40, 45, 46, 47; Domain modules > 6. Pemesanan > Terencana; 3. Lokasi (Terencana hold hours default 24); 15. Notifications (reminder about 4 h before hold expires); Out of Scope (Terencana at any TPU). -->

**8. Bisakah pemesanan untuk nanti dibatalkan setelah dibayar?**

Bisa, selama belum ada pemakaman di petak itu. Pemegang Hak mengajukan Pembatalan dari Akun Saya. Dalam **Masa Pembatalan** lokasi, tarif lokasi dikembalikan penuh. Setelah itu, pengembalian mengikuti persentase yang ditetapkan lokasi. Biaya Layanan Platform tidak dikembalikan. Kebijakan yang berlaku adalah yang tertera saat Anda memesan (tersimpan di pesanan), sehingga perubahan kebijakan kemudian tidak memengaruhi Anda. Uang dikembalikan kepada orang yang membayar, ke rekening bank yang ia masukkan. Pembatalan tidak dapat diajukan setelah terjadi pergantian Pemegang Hak.
<!-- Spec: User Stories 44, 102, 107; Domain modules > 6. Pemesanan > Requests from the Pemegang Hak > Pembatalan; CONTEXT.md Pembatalan, Masa Pembatalan. -->

**9. Bisakah keluarga dimakamkan lagi di makam keluarga yang sudah ada?**

Bisa, bila aturan lokasi mengizinkan (misalnya tumpang, petak berikutnya di kavling keluarga, atau makam yang sudah disiapkan untuk seseorang). Mulai dari menu **Makam Keluarga**, cari makamnya, lalu pilih "Makamkan di sini". Bila Anda bukan Pemegang Hak, Pemegang Hak akan diminta persetujuan lewat WhatsApp. Tagihannya (biaya pemakaman dan Biaya Layanan Platform) dibayar setelah pemakaman.
<!-- Spec: Solution 1 (further burial with consent); User Stories 50–56; Domain modules > 6. Pemesanan > Burial under an existing Hak Pakai (consent resolution, tumpang policy checks, pay-after). -->

### Pembayaran

**10. Bagaimana cara membayar, dan siapa yang menerima uangnya?**

Anda membayar melalui tautan pembayaran dengan **Virtual Account (VA) atau QRIS**. Tautan ini boleh dipakai siapa saja di keluarga Anda, sehingga yang sedang memegang uang bisa langsung membayar. Semua pembayaran diterima oleh PT Jaya Korpora Prima selaku pengelola Makam.co.id, yang juga menerbitkan Tagihan dan Bukti Pembayaran. Setelah itu kami meneruskan bagian Lokasi Mitra kepada Lokasi Mitra. Bila Anda memberikan alamat email, salinan dokumen juga dikirim ke email Anda.
<!-- Spec: User Stories 35, 36, 38; Domain modules > 10. Billing (Tagihan addressed to Pemesan, anyone may pay; documents with PT Jaya Korpora Prima header); 11. Payouts; ticket 20 (seller of record). -->

**11. Apa itu Biaya Layanan Platform?**

Biaya tetap kami, saat ini {biaya_layanan_platform} per Tagihan, untuk pesanan di Lokasi Mitra. Biaya ini selalu tampil sebagai baris tersendiri di samping tarif Lokasi Mitra, dan sudah termasuk dalam "total semua biaya" yang Anda lihat sebelum memesan. Pesanan di TPU DKI tidak dikenai Biaya Layanan Platform. Di sana biaya jasa kami adalah Biaya Pengurusan.
<!-- Spec: Domain modules > 4. Tariffs (Biaya Layanan Platform flat, one per Tagihan, Lokasi Mitra only; all-in quote); CONTEXT.md Biaya Layanan Platform, Biaya Pengurusan; build ticket 43 (no platform fee on TPU quotes). -->

**12. Keluarga kami sedang kesulitan biaya. Adakah keringanan?**

Silakan hubungi CS kami. Dalam keadaan tertentu tim kami dapat memberikan **Harga Khusus** pada satu pesanan. Keringanan ini tampil di Tagihan sebagai baris pengurang tersendiri. Kami tidak menyediakan cicilan, uang muka atau voucher.
<!-- Spec: User Stories 164; Domain modules > 10. Billing (Harga Khusus negative line); Out of Scope (down payments, cicilan, vouchers, keringanan flows). -->

### Perpanjangan

**13. Kapan dan bagaimana memperpanjang Hak Pakai di Lokasi Mitra?**

Perpanjangan bisa diajukan mulai 3 bulan sebelum masa Hak Pakai berakhir sampai akhir masa tenggang lokasi. Kami mengirim pengingat 60, 30 dan 7 hari sebelumnya, lalu setiap minggu selama masa tenggang. Pemegang Hak memasukkan kode dari WhatsApp (atau langsung lanjut bila sudah masuk dengan nomornya), memilih jumlah periode, lalu membayar dalam 3×24 jam. Masa baru dihitung dari tanggal berakhir yang lama, bukan dari tanggal bayar, jadi memperpanjang lebih awal tidak merugikan Anda. Siapa pun di keluarga boleh membayar Tagihannya, tetapi hak tetap pada Pemegang Hak. Setelah dibayar, Anda menerima **Bukti Perpanjangan** atas nama Lokasi Mitra. Makam dengan masa berlaku selamanya tidak perlu diperpanjang.
<!-- Spec: User Stories 57, 58, 62, 63, 64, 65; Domain modules > 7. Perpanjangan (open window, terms 1–K, new end = old end + terms × N, pay-first 3×24 h, Bukti Perpanjangan); 15. Notifications (Hak Pakai end reminders). -->

**14. Nomor WhatsApp Pemegang Hak sudah berganti, atau Pemegang Hak sudah meninggal. Bagaimana?**

Bila nomornya berganti, unggah KTP Anda. Pengelola lokasi memeriksanya dalam 2 hari kerja. Bila Pemegang Hak sudah meninggal, ahli waris mengajukan pergantian Pemegang Hak sekaligus perpanjangan dalam satu permintaan, dengan akta kematian, bukti ahli waris dan KTP. Bila makam belum tercatat punya Pemegang Hak, kerabat dapat mengajukan klaim dengan KTP, bukti hubungan keluarga, dan kuitansi lama bila ada. Persetujuan berlaku 30 hari, jadi bila Tagihan pertama terlewat Anda tidak perlu mengunggah ulang.
<!-- Spec: User Stories 59, 60, 61, 67; Domain modules > 7. Perpanjangan (paths, manual review 2 working days, approval valid 30 days). -->

**15. Bagaimana memperpanjang IPTM makam di TPU DKI?**

IPTM berlaku 3 tahun dan harus diperpanjang. Anda bisa mengurusnya sendiri tanpa biaya (lihat panduan di halaman Pengurusan di TPU DKI), atau meminta kami mengurusnya mulai 3 bulan sebelum IPTM berakhir. Kami memeriksa dokumen Anda lebih dulu, dan baru menerbitkan Tagihan ({biaya_pengurusan_berkas}) setelah dokumen lengkap. IPTM baru biasanya terbit dalam 5 hari kerja setelah pembayaran. Bila makam kami catat, Pemegang Hak menerima pengingat 3 bulan dan 1 bulan sebelum IPTM berakhir.
<!-- Spec: User Stories 79, 80, 83; Domain modules > 8. Pengurusan > Perpanjangan TPU; 15. Notifications (IPTM expiry reminders); ticket 26 §1. -->

### Layanan Makam

**16. Siapa yang mengerjakan Layanan, dan bagaimana saya tahu sudah dikerjakan?**

Di Lokasi Mitra, Layanan dikerjakan oleh pengelola lokasi. Di TPU DKI, Layanan dikerjakan oleh Mitra Jasa yang ditugaskan tim kami. Setiap pekerjaan dibuktikan dengan foto (dan video untuk Laporan Foto/Video) yang diambil langsung di aplikasi, lengkap dengan waktu pengambilan, lalu dikirim ke Anda lewat tautan. Di TPU, foto diperiksa tim kami lebih dulu sebelum ditampilkan kepada Anda. Siapa pun di keluarga boleh memesan Layanan untuk sebuah makam, tidak harus Pemegang Hak.
<!-- Spec: Solution 3; User Stories 84, 85, 92; Domain modules > 9. Layanan (proof in-app with timestamp; Keluhan window starts at Admin Platform approval at a TPU). -->

**17. Bagaimana jika hasil pekerjaan tidak sesuai?**

Ajukan **Keluhan** dalam 3×24 jam sejak foto bukti ditampilkan kepada Anda. Tim kami akan memutuskan apakah pekerjaan diulang atau uangnya dikembalikan. Anda juga dapat memberikan penilaian bintang 1–5, yang hanya dibaca oleh tim kami.
<!-- Spec: User Stories 94, 95; Domain modules > 9. Layanan > Pekerjaan Layanan (Keluhan window, outcome, Penilaian visible to Admin Platform only). -->

**18. Bisakah Layanan dibatalkan?**

Bisa, paling lambat H-1 atau sebelum pekerjaan dimulai. Harga Layanan dikembalikan, sedangkan Biaya Layanan Platform tidak. Bila pekerjaan terlambat dan karena itu dibatalkan, uang Anda dikembalikan penuh, termasuk Biaya Layanan Platform.
<!-- Spec: User Stories 93, 97; Domain modules > 9. Layanan (cancel until H-1 or started); 10. Billing > Refunds (fault of fulfiller: platform fee refunded). -->

**19. Bagaimana cara kerja Paket Layanan berkala?**

Paket Layanan bisa dipesan sekali, bulanan, 3-bulanan atau tahunan. Harganya adalah jumlah harga Layanan di dalamnya. Tagihan setiap siklus terbit 7 hari sebelumnya, dengan pengingat sehari sebelum jatuh tempo. Siklus yang belum dibayar tidak dikerjakan dan dilewati. Bila dua siklus berturut-turut terlewat, paket dijeda, dan Anda dapat melanjutkannya. Anda bisa menghentikan paket kapan saja dari Akun Saya, dan penghentian berlaku mulai siklus yang belum ditagihkan.
<!-- Spec: User Stories 87–90; Domain modules > 9. Layanan > Recurring cycles; 10. Billing (Paket cycle pay-first, due H-1). -->

### TPU DKI

**20. Siapa yang dapat dimakamkan di TPU DKI?**

Menurut Perda DKI 3/2007, TPU DKI melayani warga ber-KTP DKI yang meninggal di Jakarta maupun di luar Jakarta, serta warga dari luar DKI yang meninggal di Jakarta. Warga ber-KTP luar DKI yang meninggal di luar Jakarta tidak dapat dimakamkan di TPU DKI. Untuk mereka, silakan lihat pilihan di Lokasi Mitra. Makam TPU tidak dapat dipesan untuk orang yang belum meninggal. Saat ini banyak TPU hanya menerima makam tumpang, dan halaman setiap TPU menunjukkan apakah TPU itu masih menerima makam baru.
<!-- Spec: User Stories 69, 13; Domain modules > 8. Pengurusan (eligibility blocks no/no); Out of Scope (Terencana at any TPU); research dki-tpu-burial-sequence §6, cemetery-plot-regulation §2.3. -->

**21. Apakah saya harus mengurus lewat Makam.co.id?**

Tidak. Pemakaman dan IPTM di TPU DKI dapat diurus sendiri oleh keluarga, dan IPTM tidak dipungut biaya. Panduan langkah demi langkah ada di halaman **Pengurusan di TPU DKI**. Bila Anda memilih kami yang mengurus, yang Anda bayar adalah Biaya Pengurusan, yaitu biaya jasa kami, bukan biaya pemerintah. Bila pemakaman harus dilakukan sebelum kami sempat mengonfirmasi, keluarga dapat langsung datang ke TPU, dan kami tetap dapat mengurus IPTM-nya setelah itu.
<!-- Spec: Public site > Content pages > Cara Kami Bekerja and Pengurusan di TPU DKI; User Stories 14, 72, 78; CONTEXT.md Biaya Pengurusan; ticket 26 §3. -->

**22. Apa yang terjadi bila pengurusan IPTM ditolak?**

Bila penolakan bisa diperbaiki (misalnya dokumen kurang atau kurang jelas), Anda akan diminta memperbaikinya, lalu kami ajukan ulang tanpa biaya tambahan. Bila IPTM akhirnya ditolak untuk pengurusan berkas saja (perpanjangan, atau IPTM setelah keluarga memakamkan sendiri), Biaya Pengurusan dikembalikan penuh, dan alasan penolakannya kami tampilkan. Bila masa perpanjangan mungkin sudah lewat, kami menanyakan ke TPU lebih dulu tanpa biaya.
<!-- Spec: User Stories 81, 82; Domain modules > 8. Pengurusan (fixable PTSP rejection refiled at no charge; final rejection of filing-only refunded in full; past-grace checked before billing). -->

### Wakaf Tanah

**23. Apakah Makam.co.id menerima tanah wakaf?**

Tidak. Tanah diwakafkan langsung kepada Nazhir; makam.co.id tidak menerima tanah maupun uang. Kami membantu Anda mengajukan wakaf, mempertemukan Anda dengan Nazhir, dan mengikuti prosesnya sampai ikrar wakaf di KUA dan sertifikat. Tidak ada biaya apa pun. Dokumen boleh menyusul, dan Anda dapat membatalkan pengajuan sebelum tahap ikrar. Saat ini kami melayani tanah di Jabodetabek. Untuk tanah di luar Jabodetabek, kami arahkan Anda ke KUA atau BWI setempat.
<!-- Spec: Solution 4; User Stories 108–114; Domain modules > 12. Wakaf (no money of any kind; Dirujuk outside Jabodetabek; cancel until Menunggu Ikrar); ticket 20 (page copy line); CONTEXT.md Pengajuan Wakaf, Nazhir. -->

### Akun dan data

**24. Bagaimana cara masuk ke akun saya?**

Cukup dengan nomor WhatsApp. Kami mengirim kode sekali pakai ke WhatsApp Anda. Kode hanya muncul di aplikasi WhatsApp di ponsel, tidak di WhatsApp Web atau Desktop. Tidak ada kata sandi. Bila email Anda sudah diverifikasi (lewat "Verifikasi email" di profil Akun Saya), Anda juga bisa memilih **Masuk dengan email** kapan saja: kodenya kami kirim ke email itu. Akun dibuat otomatis saat Anda pertama kali mengirim pesanan atau masuk dengan nomor WhatsApp, jadi Pemegang Hak yang belum pernah memesan pun bisa melihat makam keluarganya. Satu nomor adalah satu akun, dan akun tidak dapat dibagi dengan anggota keluarga lain. Bila Anda kehilangan nomor lama, hubungi CS. Tim kami dapat memindahkan akun ke nomor baru setelah memeriksa KTP Anda.
<!-- Spec: Solution (WhatsApp OTP or verified email, account keyed by phone); User Stories 26, 98, 167, 189, 190; ticket 67 (email login, 2026-09-25); Domain modules > 1. Identity & Access (no self-service recovery, no shared family access, account move after KTP check); 15. Notifications (OTP only on the phone). SMS fallback deliberately omitted per the 2026-09-25 removal. -->

**25. Bagaimana data dan dokumen keluarga saya digunakan?**

Dokumen seperti KTP, KK, surat kematian dan surat ahli waris disimpan di penyimpanan pribadi di Jakarta, dan hanya dibuka oleh pihak yang memerlukannya: pengelola lokasi untuk pesanan di lokasinya, dan petugas kami untuk urusan yang ditugaskan kepadanya. Mitra Jasa tidak melihat nomor atau dokumen Anda. Mereka berkomunikasi dengan Anda melalui pesan di halaman pekerjaan. Saat orang lain mencari makam keluarga, data Pemegang Hak tidak ditampilkan. Kami tidak mengirim pesan promosi. Pesan WhatsApp dikirim melalui layanan WhatsApp Business resmi (Meta), yang dapat memproses data di luar Indonesia.
<!-- Spec: Data and privacy decisions; Domain modules > 5. Inventory (lookup returns no Pemegang Hak details); 9. Layanan (Mitra Jasa sees first name/photo, thread); 15. Notifications (official API only, no marketing); Architecture (S3 Jakarta). Retention/deletion/UU PDP out of scope, so nothing is promised about deletion. -->

---

## 5. Hubungi Kami

<!-- Spec: Public site > Content pages > Hubungi Kami: CS WhatsApp and the Operator's address. Ticket 06 adds phone and email; Notifications: inbound WhatsApp to the notification number gets an auto-reply to the CS number, no inbox; ticket 24: before booking, contact goes to CS only. -->

### Hubungi Kami

Kami siap membantu, baik saat Anda sedang berduka maupun saat merencanakan.

**WhatsApp CS: {nomor_wa_cs}**
[Tombol: Chat WhatsApp CS] → `{tautan_wa_cs}`
Jam layanan: {jam_layanan_cs}. Pesan di luar jam itu dibalas mulai pukul {jam_mulai_balas_cs}.

**Setelah pesanan dikonfirmasi**, kontak pengelola lokasi (atau petugas kami untuk TPU DKI) tercantum di halaman pesanan Anda. Untuk pemesanan saat duka di luar jam operasional lokasi, kontak siaga lokasi ditampilkan saat Anda memilih lokasi.

**Keluhan tentang Layanan Makam** diajukan dari halaman pekerjaannya di Akun Saya, dalam 3×24 jam setelah foto bukti ditampilkan.

**Nomor WhatsApp pengirim notifikasi** (kode masuk, tagihan, pengingat) tidak dibaca oleh petugas. Bila Anda membalasnya, Anda akan diarahkan ke nomor CS di atas.

### Alamat dan kontak perusahaan

Makam.co.id dikelola oleh PT Jaya Korpora Prima

{alamat_operator}
Telepon: {telepon_operator}
Email: {email_operator}

[CATATAN EDITOR: the spec requires only the CS WhatsApp number and the Operator's address. Phone and email come from ticket 06 (document header contact). Drop them if they should not be public. CS hours are not fixed in the spec. It assumes a daily Admin Platform rota of 06:00–18:00 and the TPU after-hours line "dibalas mulai pukul 06:00".]

---

## 6. Pengurusan di TPU DKI

<!-- Spec: Public site > Content pages > Pengurusan di TPU DKI (DIY guide: TPU on the day → surat pengantar → JakEVO / PTSP, free; the two Biaya Pengurusan amounts; DKI Layanan price list; entries to Saat Duka TPU, Perpanjang IPTM and "Sudah dimakamkan? Kami urus IPTM-nya"). Build ticket 43. Facts from research dki-tpu-burial-sequence.md and cemetery-plot-regulation.md §2; confidence markers from that research are noted in reviewer comments. -->

### Pengurusan di TPU DKI

Pemakaman dan izin makam (IPTM) di TPU milik Pemprov DKI Jakarta **dapat Anda urus sendiri, dan IPTM tidak dipungut biaya**. Di halaman ini kami jelaskan langkah-langkahnya. Bila Anda lebih memilih dibantu, di bagian bawah ada penjelasan apa yang bisa kami urus dan berapa biaya jasanya.

### Bagian A: Mengurus sendiri (gratis)

#### Siapa yang dapat dimakamkan di TPU DKI

- Warga ber-KTP DKI Jakarta, baik yang meninggal di Jakarta maupun di luar Jakarta.
- Warga dari luar DKI yang meninggal di Jakarta.

Warga ber-KTP luar DKI yang meninggal di luar Jakarta tidak dapat dimakamkan di TPU DKI. Makam TPU juga tidak dapat dipesan untuk orang yang belum meninggal.

<!-- Perda DKI 3/2007 Pasal 3 and Pasal 37 [primary]. -->

#### Memilih TPU

Banyak TPU di Jakarta sudah penuh dan **hanya menerima makam tumpang** (pemakaman di petak keluarga yang sudah ada). Makam baru hanya bisa di TPU yang masih punya petak kosong.

- Halaman setiap TPU di Makam.co.id menunjukkan apakah TPU itu masih menerima makam baru, dan kapan status itu terakhir diperbarui.
- Dinas Pertamanan dan Hutan Kota (Distamhut) DKI menampilkan jumlah petak kosong per TPU di situsnya (halaman ketersediaan perpetakan), lengkap dengan nomor kontak petugas TPU.
- Petak yang tepat ditentukan oleh petugas TPU.

<!-- Research dki-tpu-burial-sequence §2: 69 of 80 TPUs tumpang-only (Oct 2025, official-quoted); Distamhut availability page [primary]; TPU staff assign the blad/number. Deliberately no count of TPUs, since it changes. -->

#### Dokumen yang perlu disiapkan

**Bila almarhum meninggal di Jakarta:**
- Surat keterangan kematian (pemeriksaan jenazah) dari rumah sakit atau Puskesmas
- Surat keterangan laporan kematian dari Kelurahan
- KTP dan KK almarhum
- KTP-el dan KK ahli waris atau penanggung jawab yang mengurus

**Bila almarhum warga DKI yang meninggal di luar Jakarta**, siapkan juga dokumen dari daerah asal:
- Surat pemeriksaan jenazah dari rumah sakit atau Puskesmas di daerah asal
- Surat laporan kematian dari Lurah atau Kepala Desa di daerah asal
- Surat pengantar kematian dari Dinas Kesehatan daerah asal
- KK dan KTP

<!-- Perda DKI 3/2007 Pasal 17(1)-(2) [primary]; DPMPTSP IPTM checklist 16-05-2024 [primary]. Death abroad (Pasal 17(3)) omitted for brevity; CS can advise. -->

#### Langkah 1: Datang ke kantor TPU pada hari pemakaman

Keluarga (atau pengurus RT/RW, atau rumah duka) menghubungi atau mendatangi **loket resmi kantor TPU** dengan membawa dokumen di atas. Petugas TPU memeriksa dokumen, menentukan petak (atau memeriksa petak keluarga untuk tumpang), lalu pemakaman dilakukan.

- Pemakaman dilakukan antara **pukul 06:00 dan 18:00**. Pemakaman di luar jam itu memerlukan izin dari dinas.
- Menurut Distamhut, layanan pemakaman di TPU DKI, termasuk penggalian dan penutupan makam oleh petugas, **tidak dipungut biaya** bagi warga ber-KTP DKI. Petugas resmi berseragam dan memakai tanda pengenal, dan tidak boleh menerima uang. Distamhut juga meminta masyarakat tidak memberi uang tip kepada petugas.

<!-- Perda DKI 3/2007 Pasal 30 [primary]; Antara-2026 and WK-2026 (official-quoted). Free-for-non-DKI-KTP is unverified, so the "tidak dipungut biaya" sentence is scoped to KTP DKI as Distamhut states it. -->

**Makam tumpang** (di petak keluarga yang sudah ada):
- IPTM petak tersebut harus **masih berlaku**. Bawa IPTM lama.
- Pemakaman sebelumnya di petak itu minimal **3 tahun** yang lalu.
- Tumpang dilakukan untuk anggota keluarga. Bila yang dimakamkan bukan anggota keluarga, diperlukan **izin tertulis** dari ahli waris atau penanggung jawab petak.
- IPTM tumpang mengikuti masa berlaku IPTM petak tersebut.

<!-- Perda DKI 3/2007 Pasal 36(3), 36(5) [primary]; IPTM checklist (tumpang validity follows prior IPTM) [primary]. The "max 4 bodies" cap is unverified and deliberately omitted. -->

#### Langkah 2: Terima surat pengantar dari TPU

Setelah pemakaman, kantor TPU menerbitkan **surat pengantar** (asli) untuk pengurusan IPTM. Simpan baik-baik, karena surat ini diperlukan untuk langkah berikutnya.

#### Langkah 3: Ajukan IPTM lewat JakEVO atau PTSP Kelurahan (gratis)

Ajukan **Izin Penggunaan Tanah Makam (IPTM)** secara daring melalui **JakEVO** (layanan perizinan daring Pemprov DKI, juga dapat diakses lewat aplikasi JAKI), atau langsung di **loket PTSP Kelurahan** pada hari kerja.

- **Biaya: Rp 0.** Retribusi IPTM dihapus sejak Perda DKI 1/2024.
- **Waktu penyelesaian: 1 hari kerja.** Pengajuan pada akhir pekan atau hari libur diproses pada hari kerja berikutnya.
- IPTM diterbitkan oleh Unit Pelayanan PTSP Kelurahan.

Dokumen untuk pengajuan IPTM:

| Dokumen | Makam baru | Tumpang | Perpanjangan |
|---|---|---|---|
| Formulir elektronik (JakEVO) | ✓ | ✓ | ✓ |
| KTP-el dan KK pemohon (ahli waris atau penanggung jawab) | ✓ | ✓ | ✓ |
| KTP dan KK almarhum | ✓ | ✓ | |
| Surat keterangan kematian dari RS atau Puskesmas | ✓ | ✓ | |
| Surat keterangan laporan kematian dari Kelurahan | ✓ | ✓ | |
| Surat pengantar dari TPU (asli) | ✓ | ✓ | ✓ |
| IPTM sebelumnya | | ✓ (salinan/pindaian) | ✓ (asli) |
| Surat kuasa bermeterai dan KTP penerima kuasa, bila diwakilkan | bila perlu | bila perlu | bila perlu |

<!-- DPMPTSP IPTM checklist 16-05-2024 [primary]; DPMPTSP service page ("Durasi: 1 Hari"); WK-2026 (JAKI). Weekend handling is [unverified] in research but follows from the "1 hari kerja" basis. PTSP counter hours (Mon–Fri 08–16) are snippet-level only, so the copy says "pada hari kerja" without hours. -->

Urutan di atas (pemakaman dulu, lalu surat pengantar, lalu IPTM) adalah urutan yang umum dijalankan di TPU DKI. Bila petugas TPU atau PTSP meminta urutan lain, ikuti arahan petugas.

<!-- Research §1: Perda Pasal 16 literally puts the IPTM before the burial; practice evidence (2016 PTSP blog, 2019 PTSP quote) puts it after. The implementing Pergub was not found. This sentence hedges honestly. -->

#### Setelah IPTM terbit: jangan lupa memperpanjang

- IPTM berlaku **3 tahun** dan dapat diperpanjang setiap 3 tahun.
- Ajukan perpanjangan **paling lambat 3 bulan setelah IPTM berakhir**. Untuk perpanjangan, mintalah dulu surat pengantar di kantor TPU, lalu ajukan lewat JakEVO atau PTSP Kelurahan dengan dokumen di tabel atas (kolom Perpanjangan). Biayanya juga Rp 0.
- **Penting:** menurut Pemprov DKI, makam yang IPTM-nya tidak lagi berlaku dapat ditumpangi jenazah lain tanpa persetujuan ahli waris sebelumnya.

<!-- Perda DKI 3/2007 Pasal 33(1)-(2) [primary]; jakarta.go.id portal (lapsed IPTM may be tumpang'd without consent) [primary]; PTSP-LA (perpanjangan: TPU first). How strictly the 3-month grace is enforced is unverified; the copy states the Perda rule only. -->

#### Waspadai perantara berbayar

Pemprov DKI meminta keluarga mengurus langsung di loket resmi TPU dan PTSP, dan melaporkan siapa pun yang mengaku bisa "mengurus" pemakaman dengan meminta bayaran di luar ketentuan. Laporan dapat disampaikan lewat aplikasi JAKI, posko pengaduan di TPU, atau {hotline_pengaduan_distamhut}.

Bila Anda memilih dibantu Makam.co.id, biaya kami selalu tertulis sebagai **biaya jasa**, terpisah dari retribusi pemerintah (Rp 0), dan tertera di Tagihan resmi atas nama PT Jaya Korpora Prima. Kami tidak meminta uang "untuk TPU" atau "untuk PTSP".

<!-- Kompas-2026 / Antara-2026 (official-quoted). Hotline numbers in research (June 2026 news): 0816-878-889 / 0858-9000-9132; kept as a placeholder pending verification. Last sentence: Tariffs (Retribusi Pemda Rp 0 own line; any non-zero line collected at cost as its own line); CONTEXT.md Biaya Pengurusan ("never as a government charge"). -->

[CATATAN EDITOR: "Kami tidak meminta uang 'untuk TPU' atau 'untuk PTSP'" holds only while the Retribusi Pemda is Rp 0. If the Pemda ever sets a fee, the spec collects it at cost as its own line and pays it on. Reword the sentence then.]

### Bagian B: Bila Anda ingin kami bantu urus

Semua langkah di atas dapat kami urus untuk Anda. **Biaya Pengurusan adalah biaya jasa kami untuk kemudahan, bukan biaya pemerintah.** IPTM tetap diterbitkan oleh Pemprov DKI atas nama ahli waris keluarga. Kami mengajukannya dengan **surat kuasa** yang dibuat otomatis oleh sistem dan Anda tandatangani.

#### Harga

| | Biaya |
|---|---|
| Retribusi IPTM (Pemprov DKI) | {retribusi_pemda_iptm} (saat ini Rp 0, gratis sejak Perda DKI 1/2024) |
| Biaya Pengurusan: pemakaman dan IPTM (kami atur pemakaman dengan TPU, lalu kami ajukan IPTM) | {biaya_pengurusan_pemakaman} |
| Biaya Pengurusan: berkas IPTM saja (perpanjangan IPTM, atau IPTM setelah keluarga memakamkan sendiri) | {biaya_pengurusan_berkas} |

Pesanan di TPU DKI tidak dikenai Biaya Layanan Platform. Tidak ada Bukti Pemesanan untuk makam TPU, karena **IPTM adalah bukti hak atas makam**. Anda menerima Bukti Pembayaran, halaman pesanan dengan statusnya, dan salinan IPTM.

<!-- Spec: Domain modules > 4. Tariffs (two Biaya Pengurusan amounts, Retribusi Pemda lines); 8. Pengurusan (No Bukti Pemesanan / Perpanjangan at a TPU); build ticket 43 (no platform fee on TPU quotes). -->

#### 1. Pemakaman di TPU DKI (saat duka)

[Tombol: **Pesan pemakaman di TPU DKI**]

- Pilih makam **baru** (hanya di TPU yang masih menerima makam baru) atau **tumpang** di petak keluarga. Untuk tumpang, jelaskan letak makamnya dan unggah foto IPTM lama.
- Kami ajukan dua pertanyaan singkat, yaitu apakah almarhum ber-KTP DKI dan apakah meninggal di Jakarta, untuk memastikan TPU dapat menerima.
- Tim kami mengatur pemakaman dengan TPU dan **mengonfirmasi dalam 2 jam layanan (pukul 06:00–18:00)**. Waktu konfirmasi paling lambat untuk pesanan Anda tampil saat Anda mengirim pesanan. Konfirmasi memuat waktu pemakaman yang disepakati, alamat TPU, kontak petugas kami dan petugas TPU, serta daftar dokumen.
- **Tidak ada yang dibayar di awal.** Tagihan jatuh tempo 3×24 jam setelah pemakaman.
- Setelah pemakaman, unggah dokumen untuk IPTM dan surat kuasa **dalam 7 hari**. Kami ajukan IPTM-nya. Anda dapat mengikuti statusnya: Dimakamkan → Dokumen Lengkap → IPTM Diajukan → IPTM Terbit.
- Salinan IPTM kami kirim ke Anda dan kami simpan di Akun Saya, **meskipun Tagihan belum dibayar**.
- Anda dapat menambahkan Layanan untuk hari pemakaman, misalnya bunga tabur, yang dikerjakan oleh Mitra Jasa dan dibayar bersama Tagihan pemakaman.

**Bila Anda memesan di malam hari:** tim kami membalas mulai pukul 06:00. Bila pemakaman harus dilakukan sebelum waktu konfirmasi, keluarga dapat langsung datang ke TPU dengan panduan di atas, dan kami tetap bisa mengurus IPTM setelahnya.

**Pembatalan:** pesanan dapat dibatalkan selama IPTM belum diajukan. Tagihan yang belum dibayar dibatalkan. Bila sudah dibayar, uang dikembalikan penuh, kecuali bila tim kami sudah mengatur pemakaman dengan TPU. Dalam hal itu Biaya Pengurusan tidak dikembalikan, dan hanya baris lain (misalnya Layanan yang belum dikerjakan) yang dikembalikan.

<!-- Spec: User Stories 68–77; Domain modules > 8. Pengurusan (Saat Duka TPU statuses, eligibility, two document sets, 7-day uploads, Surat Kuasa, pay-after, hari-H Layanan by Mitra Jasa, cancellation, IPTM handed over regardless of payment); ticket 26 §3 (night copy). -->

#### 2. Sudah dimakamkan? Kami urus IPTM-nya

[Tombol: **Urus IPTM saja**]

Untuk keluarga yang sudah memakamkan sendiri di TPU DKI dan ingin kami yang mengajukan IPTM (makam baru atau tumpang).

- Unggah dokumen **dalam 7 hari** setelah pesanan dibuat. Petugas kami mengambil surat pengantar di TPU.
- Kami periksa dokumen dulu, lalu terbit Tagihan {biaya_pengurusan_berkas} yang **dibayar sebelum pengajuan**, paling lambat 3×24 jam. Bila tidak dibayar, pesanan batal dengan sendirinya.
- Bila IPTM akhirnya ditolak, Biaya Pengurusan dikembalikan penuh.

<!-- Spec: User Stories 78; Domain modules > 8. Pengurusan > Pengurusan IPTM (statuses incl. Menunggu Pembayaran; pay-first after document check, 3×24 h, lapse to Dibatalkan; uploads due 7 days after the order); 13. Field Work (Ambil surat pengantar once Lunas); ticket 26 §4. -->

#### 3. Perpanjangan IPTM

[Tombol: **Perpanjang IPTM**]

- Dapat diajukan mulai **3 bulan sebelum IPTM berakhir**. Masukkan tanggal berakhir yang tertera pada IPTM.
- Satu kali perpanjangan berlaku untuk satu masa (3 tahun).
- Kami periksa dokumen lebih dulu. Bila ada yang perlu diperbaiki, Anda akan diberi tahu. Tagihan {biaya_pengurusan_berkas} baru terbit setelah dokumen lengkap, dan dibayar paling lambat 3×24 jam.
- **IPTM baru biasanya terbit dalam 5 hari kerja setelah pembayaran.**
- Bila masa perpanjangan mungkin sudah lewat, kami menanyakan ke TPU lebih dulu, **tanpa biaya**. Bila TPU tidak dapat memperpanjang, permintaan ditutup tanpa ada yang dibayar.
- Penolakan yang bisa diperbaiki kami ajukan ulang tanpa biaya. Bila IPTM akhirnya ditolak, Biaya Pengurusan dikembalikan penuh, dan alasannya kami tampilkan.
- Untuk makam yang kami catat, Pemegang Hak menerima pengingat lewat WhatsApp 3 bulan dan 1 bulan sebelum IPTM berakhir.

<!-- Spec: User Stories 79–83; Domain modules > 8. Pengurusan > Perpanjangan TPU; 15. Notifications (IPTM expiry reminders); ticket 26 §1. -->

#### 4. Layanan Makam di TPU DKI

[Tombol: **Pesan Layanan di TPU DKI**]

Layanan di TPU DKI dikerjakan oleh **Mitra Jasa**, penyedia jasa perorangan yang bekerja sama dengan kami. Jelaskan letak makamnya (TPU, blok dan nomor, nama almarhum, dan bila ada foto serta titik peta). Setiap pekerjaan dibuktikan dengan foto yang diambil di aplikasi dan diperiksa tim kami sebelum ditampilkan kepada Anda. Anda dapat berkirim pesan dengan Mitra Jasa lewat halaman pekerjaan tanpa membagikan nomor Anda, dan dapat mengajukan Keluhan dalam 3×24 jam setelah foto bukti ditampilkan.

Harga Layanan di TPU DKI (sama di semua TPU DKI):

| Layanan | Pilihan | Harga | Pesan paling lambat |
|---|---|---|---|
| Bunga Ziarah / Bunga Pemakaman | {varian_bunga} | {harga_tpu_bunga} | {lead_time_bunga} sebelumnya |
| Batu Nisan (pesan dan pasang) | {varian_nisan_tpu} | {harga_tpu_nisan} | {lead_time_nisan} sebelumnya |
| Pembersihan Makam | {varian_pembersihan} | {harga_tpu_pembersihan} | {lead_time_pembersihan} sebelumnya |
| Perawatan Rumput & Taman | {varian_perawatan_rumput} | {harga_tpu_perawatan_rumput} | {lead_time_perawatan_rumput} sebelumnya |
| Laporan Foto/Video Kondisi Makam | {varian_laporan} | {harga_tpu_laporan} | {lead_time_laporan} sebelumnya |

Paket Layanan berkala (bulanan, 3-bulanan, tahunan) juga tersedia. Harganya adalah jumlah harga Layanan di dalamnya.

Pilihan batu nisan di TPU hanya yang sudah kami tandai sesuai untuk TPU DKI.

<!-- Spec: Domain modules > 9. Layanan (catalog; Batu Nisan variants marked "boleh di TPU DKI"; Paket price = sum; Mitra Jasa first name/photo, thread); 4. Tariffs (DKI Layanan variant price); build tickets 43 and 49 (price list rendered from the catalog when present). The table is rendered from the catalog, so rows and variants come from Admin Platform data. -->

[CATATAN EDITOR: the table rows are examples from the v1 catalog in decision ticket 09. On the live page the table should be generated from the Layanan catalog (build ticket 49), not hard-coded.]

---

## Daftar placeholder

Admin Platform or config supplies every value below (ticket 06). None of them may be hard-coded in copy.

| Placeholder | Used on | Source |
|---|---|---|
| `{biaya_layanan_platform}` | Cara Kami Bekerja, FAQ 11 | Tariffs (global, flat, versioned) |
| `{biaya_pengurusan_pemakaman}` | Cara Kami Bekerja, Pengurusan di TPU DKI | Tariffs (DKI Biaya Pengurusan, burial amount) |
| `{biaya_pengurusan_berkas}` | Cara Kami Bekerja, FAQ 15, Pengurusan di TPU DKI | Tariffs (DKI Biaya Pengurusan, filing-only amount) |
| `{retribusi_pemda_iptm}` | Cara Kami Bekerja, Pengurusan di TPU DKI | Tariffs (Retribusi Pemda line, Rp 0 today) |
| `{varian_bunga}`, `{varian_nisan_tpu}`, `{varian_pembersihan}`, `{varian_perawatan_rumput}`, `{varian_laporan}` | Pengurusan di TPU DKI | Layanan catalog (variants; nisan only where marked "boleh di TPU DKI") |
| `{harga_tpu_bunga}`, `{harga_tpu_nisan}`, `{harga_tpu_pembersihan}`, `{harga_tpu_perawatan_rumput}`, `{harga_tpu_laporan}` | Pengurusan di TPU DKI | Tariffs (DKI Layanan variant price) |
| `{lead_time_bunga}`, `{lead_time_nisan}`, `{lead_time_pembersihan}`, `{lead_time_perawatan_rumput}`, `{lead_time_laporan}` | Pengurusan di TPU DKI | Layanan catalog (minimum lead time) |
| `{nomor_wa_cs}` | Hubungi Kami | Config (CS WhatsApp number) |
| `{tautan_wa_cs}` | Beranda, Hubungi Kami, WhatsApp CS button on every page | Config (derived from the CS number) |
| `{jam_layanan_cs}` | Hubungi Kami | Config (CS reply hours; spec assumes a 06:00–18:00 daily rota) |
| `{jam_mulai_balas_cs}` | Hubungi Kami | Config (spec text: "dibalas mulai pukul 06:00") |
| `{alamat_operator}` | Hubungi Kami | Ticket 06 (PT Jaya Korpora Prima registered address) |
| `{telepon_operator}` | Hubungi Kami | Ticket 06 (Operator contact phone) |
| `{email_operator}` | Hubungi Kami | Ticket 06 (Operator contact email) |
| `{hotline_pengaduan_distamhut}` | Pengurusan di TPU DKI | Verify before launch. Research found 0816-878-889 / 0858-9000-9132 in June 2026 news reports |

Values filled in per page by the app (not placeholders to configure, listed for completeness): `<bulan tahun>` of the last Kunjungan Verifikasi, `<tanggal>` for "Harga berlaku sejak" / "Harga baru mulai", the computed confirmation time, and the TPU "diperbarui <tanggal>" date.

# Homepage, search and Akun Saya

Type: grilling
Status: resolved
Blocked by: 26
Map: ../map.md

## Question

1. **Homepage entry points**: the brief has primary CTA "Cari Makam", secondary "Perpanjang Makam • Layanan Pemakaman • Wakaf Tanah", and booking CTAs "Cari Makam Sekarang • Lihat Lokasi Tersedia • Hubungi Bantuan"; the booking prototype's home splits into Saat Duka / Terencana / existing family grave. How do these reconcile into one homepage?
2. **Search and filters**: the brief and "Speed and documents for Pemesanan Saat Duka" list city, Jenis Makam, price, availability and facilities; the prototype's Saat Duka screen has only a city filter sorted by price; "Lokasi terverifikasi and published tariffs" says the facilities checklist drives a filter. Which filters appear where (Daftar Lokasi Makam, Terencana search, Saat Duka list), and how are TPUs mixed in?
3. **Akun Saya contents**: orders, Tagihan, Bukti, Hak Pakai on my number, Paket Layanan, TPU grave records and IPTM scans, Pengajuan Wakaf. What is listed and what actions are offered there (Perpanjangan, order Layanan, request Pembatalan / Pengembalian Hak Pakai, Ganti Pemegang Hak request)?
4. **Wakif access**: does a Wakif log in the same way (WhatsApp OTP, phone-keyed account) and track the Pengajuan Wakaf in Akun Saya?

Added by consistency review 2 (2026-09-25):
- The **Perpanjang Makam** CTA must branch between a Lokasi Mitra and a DKI TPU ("TPU order loose ends"), and **Pengurusan IPTM** needs an entry point.
- After a Lokasi's **Tolak**, the family gets a city-filtered list of alternatives ("Lokasi Mitra order lifecycle"): part of Q2.
- Akun Saya must also host: self-serve Saat Duka cancellation, accepting a "Tawarkan alternatif", following TPU Perpanjangan / Pengurusan IPTM orders (incl. Perlu Perbaikan, Ditolak), read-only Hak Pakai at a Berhenti Lokasi, and the Pembatalan / Pengembalian Hak Pakai request buttons.

## Answer

Decided with the user on 2026-09-25 (grilling, all recommendations accepted). `CONTEXT.md`: **Makam TPU** added.

**1. Homepage**

- Hero keeps the prototype's situational split: two big buttons, **Keluarga baru saja wafat** (Saat Duka, visually first) and **Siapkan makam untuk nanti** (Terencana).
- Below it a tile row: **Perpanjang Makam · Layanan Makam · Urus di TPU DKI · Wakaf Tanah**; then the trust strip (Lokasi terverifikasi · Harga transparan · Bantuan administrasi → Cara Kami Bekerja); then "Butuh bantuan? WhatsApp CS".
- The brief's "Cari Makam Sekarang / Lihat Lokasi Tersedia / Hubungi Bantuan" fold into these; "Lihat Lokasi Tersedia" is the Daftar Lokasi Makam nav link.
- **Navigation**: desktop top bar Pesan Makam · Makam Keluarga · Layanan · Wakaf Tanah · Daftar Lokasi · Masuk / Akun Saya. Mobile: logo, WhatsApp CS button, menu drawer with the same items. Tentang Kami, Cara Kami Bekerja, Pengurusan di TPU DKI, FAQ and Hubungi Kami sit in the drawer's lower part and the footer (with "dikelola oleh PT Jaya Korpora Prima").

**2. "Makam keluarga" hub** (replaces the prototype's "Sudah punya makam keluarga?" link, which now opens it)

- First question *"Di mana makamnya?"*: Lokasi Mitra on the platform / TPU di DKI.
- **Lokasi Mitra** → lookup by Lokasi + Nomor Makam / Nomor Kavling or Almarhum (Pemegang Hak not shown) → Makamkan di sini (tumpang) · Perpanjang · Pesan Layanan.
- **TPU DKI** → Makamkan (tumpang; the Saat Duka TPU flow) · Perpanjang IPTM · Urus IPTM (sudah dimakamkan sendiri, i.e. Pengurusan IPTM) · Pesan Layanan (described grave).
- The Perpanjang Makam and Layanan tiles open this hub with their action preselected; the "Urus di TPU DKI" tile opens the Pengurusan di TPU DKI page (DIY guide, prices, entries to the TPU actions). One place owns the Lokasi Mitra / TPU branch.
- Logged-in users see their own graves (Makam tab) at the top as one-tap shortcuts.

**3. Search and filters**

- **Saat Duka Pilih makam**: Lokasi Mitra × Jenis Makam cards first, sorted by all-in total; then a section "TPU resmi Pemprov DKI – dimakamkan lewat Pengurusan" with one card per TPU still taking new plots (all-in Biaya Pengurusan, 06:00–18:00 confirmation note). Filters: city (kota/kab, prefilled from the last choice) and a type chip Semua / Lokasi Mitra / TPU DKI. Availability implicit (only Tersedia). No facilities or price filter.
- **Terencana Lokasi step**: city + all-in price range + facilities chips (the checklist from "Lokasi terverifikasi and published tariffs"); only Lokasi with the plot map switched on; availability implicit. TPUs never appear (no pre-need at TPU).
- **Daftar Lokasi Makam** (browse directory, Lokasi Mitra + TPU DKI): filters city, type, facilities; no price filter, each card shows "mulai Rp X" all-in. The Lokasi page has "Pesan saat duka di sini" and, where enabled, "Siapkan untuk nanti", entering the wizards with the Lokasi preselected.
- No separate Jenis Makam filter anywhere: Jenis is the Saat Duka card and the Terencana map legend.
- **After a Tolak**: the WhatsApp link and the order page's "Pilih lokasi lain" open the Saat Duka Pilih makam screen with a banner ("<Lokasi> tidak dapat menerima; berikut pilihan lain di <kota>"), the rejecting Lokasi removed, TPU section included. A card goes straight to Data & kirim prefilled; one Kirim, no OTP when logged in; a new Nomor Pemesanan.

**4. Masuk and Akun Saya**

- **Masuk** works cold: WhatsApp number → OTP → Akun Saya, even for a number with no orders (a Pemegang Hak who never ordered sees their Makam; otherwise "Belum ada pesanan" with the homepage CTAs).
- A **Perlu tindakan** strip on top: unpaid Tagihan, missing documents, Perlu Perbaikan, a Tawarkan alternatif to accept, a burial consent to give (Setujui / Tolak).
- **Pesanan** tab: every order placed from this number, any kind (Pemesanan Saat Duka / Terencana, burial under an existing Hak Pakai, Perpanjangan, Pengurusan incl. TPU Perpanjangan and Pengurusan IPTM with Perlu Perbaikan / Ditolak, Layanan), newest first, status timeline. The order page holds its Tagihan, Bukti Pembayaran, Bukti Pemesanan / Perpanjangan, Bukti Pengembalian Dana and IPTM scan, and the order actions: batalkan (Saat Duka until Dimakamkan), terima alternatif / pilih lokasi lain, upload documents, perbaiki, bayar. Tagihan and Bukti have no tab of their own.
- **Makam** tab: every Hak Pakai and **Makam TPU** whose recorded Pemegang Hak number is the login number. Each shows the Hak Pakai (or the IPTM scan and expiry), its Pemakaman, any active Paket Layanan with the next cycle and past Pekerjaan photos, and its documents. Actions: Perpanjang, Pesan Layanan, Makamkan di sini, and for a Hak Pakai's Pemegang Hak:
  - **Ajukan Pembatalan** (Terencana, before the first burial, not after a Ganti Pemegang Hak): shows the refund under the Lokasi's policy, raises an Antrean Lokasi row and Admin Platform's refund row.
  - **Kembalikan Hak Pakai** (unused only; warns that compensation is agreed directly with the Lokasi).
  - **Ajukan Ganti Pemegang Hak**: a request form (new holder name + WhatsApp, jual / waris, optional documents) creating an Antrean Lokasi row; the Admin Lokasi still performs the change. Heirs of a deceased Pemegang Hak start from the hub lookup instead.
- **Paket Layanan**: **Hentikan Paket**, effective from the next uninvoiced cycle (an issued cycle may simply go unpaid and is skipped); no pause, no editing (stop and reorder). Only the account that ordered the Paket can stop it.
- A **Makam TPU** shows for the number recorded as its Pemegang Hak: the ahli waris named on the IPTM filing, defaulting to the Pemesan.
- **Berhenti Lokasi**: the Hak Pakai stays in Makam read-only with a banner ("Lokasi ini tidak lagi bekerja sama dengan Makam.co.id sejak <tanggal>. Hak Pakai Anda tetap berlaku terhadap pengelola; hubungi <pengelola>."), documents downloadable, no actions. A **Ditangguhkan** Lokasi keeps every action except those creating a new Hak Pakai.
- **Wakaf** tab (hidden until there is a Pengajuan): the Wakif logs in the same way (WhatsApp OTP at Kirim on the Pengajuan Wakaf page, same phone-keyed account); each Pengajuan shows its manual status timeline, Admin Platform's notes to the Wakif, and lets them add documents later. No Tagihan.

**Final review** (2026-09-25): "Ajukan Pembatalan" raises only an Antrean Lokasi row; Admin Platform's refund row follows once the Admin Lokasi confirms no Pemakaman ("Lokasi Mitra order lifecycle"). The homepage headline keeps the brief's "Layanan Pemakaman Lebih Mudah, Jelas, dan Terpercaya." The Wakaf tab also offers "Batalkan pengajuan" while the Pengajuan Wakaf is not yet at Menunggu Ikrar.

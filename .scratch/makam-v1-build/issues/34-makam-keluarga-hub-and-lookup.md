# Makam keluarga hub and grave lookup

Status: ready-for-agent
Blocked by: 14, 26
Spec: Domain modules > 5. Inventory (lookup); Public site > Makam keluarga hub; stories 50, 51

## What to build

The Makam keluarga hub asks "Di mana makamnya?" (Lokasi Mitra / TPU DKI) and owns the branch for tumpang, Perpanjang, Layanan and Pengurusan IPTM; the Perpanjang Makam and Layanan Makam tiles open it with that action preselected; logged-in users see shortcuts to their Makam tab. For Lokasi Mitra, the Inventory lookup finds a grave by Lokasi + Nomor Makam / Nomor Kavling, or Almarhum name + year of death, returning only Almarhum names, numbers, status and end date, never the Pemegang Hak's details. A Kavling Keluarga returns the whole kavling. The TPU branch links to the TPU flows (tickets 44, 47, 48, 56).

## Acceptance criteria

- [x] Lookup by Lokasi + Nomor Makam, Lokasi + Nomor Kavling, or Lokasi + Almarhum name + year of death. A Nomor Makam matches the current number or a hidden alias left by a renumber (ticket 14); results show only the current number.
- [x] Results expose only Almarhum names, Nomor Makam / Kavling, Hak Pakai status and end date; no Pemegang Hak name or number anywhere in the response payload.
- [x] A match inside a Kavling Keluarga returns the whole kavling (all its Petak).
- [x] From a result the hub offers the preselected action (Makamkan di sini, Perpanjang, Layanan), each built by later tickets; heirs of a deceased Pemegang Hak start here.
- [x] Lookup is rate-limited to prevent enumeration.
- [x] Logged-in users see their Makam tab graves as shortcuts.
- [x] Tests: each lookup form; privacy of the payload; kavling returned whole; Almarhum name matching tolerant of case and spacing.

## Comments

- 2026-09-27 — Dibangun di `ticket-34-makam-keluarga-hub`; migration `0023_curly_amphibian.sql` (tabel `inventory_cari_makam_attempt`). Antrean merge yang sudah ditetapkan akan menomorin ulang; 0023 ini berebut dengan tiket 23, seperti yang sudah diperingatkan.
- **Privacy payload (AC 2)** — `Inventory.cariMakam` mengembalikan bentuk `MakamDitemukan` yang tidak punya field Pemegang Hak sama sekali, dan tidak pernah menyeleksinya. Testnya membaca *kunci* balasan (whitelist `KUNCI_HASIL_CARI_MAKAM`) plus `JSON.stringify`-nya, bukan DOM. Sudah dibuktikan bergigit: menyuntik `pemegangHak` ke payload membuat dua test merah.
- **Alias renumber (AC 1)** — memakai bacaan alias yang sudah ada (`findPetakByNomor`), bukan membangun ulang mechanics renumber. Nomor lama tidak pernah masuk payload (dicek dengan `JSON.stringify`).
- **Nama Almarhum (AC 7)** — input pengguna tidak pernah masuk SQL. Kandidat diambil per (Lokasi, tahun wafat) lalu dicocokkan di JS dengan `namaAlmarhumCocok`: kapitalisasi dan spasi diabaikan, urutan kata bebas, tetapi kata-katanya harus sama. `%` dan `_` yang diketik tidak menjadi wildcard, dan "Hasan" tidak mengembalikan "Hasan Basri". Aturan "kata utuh, bukan sebagian" adalah pilihan builder di dalam AC (AC hanya men'syaratkan toleran kapitalisasi dan spasi) — perlu konfirmasi pemilik kalau yang diinginkan lebih longgar.
- **Rate limit (AC 5)** — 10 lookup per IP per 15 menit, dihitung **di dalam modul `inventory`** (bukan hanya di Server Action), dengan advisory lock per IP. Hit dan miss sama-sama dihitung; penolakan dibentuk sebelum pertanyaannya dijalankan dan hanya membawa waktu, jadi tidak membocorkan apa pun. Tick prune terdaftar sebagai `inventory.prune_cari_makam_attempts`.
- **AC 4 (aksi ter-pilih)** — hub memiliki cabangnya: empat kartu aksi, aksi ter-pilih (dari tile Perpanjang Makam / Layanan Makam) berada di depan dan bertahan di alamat. Alur tiap aksi belum ada (tumpang 35, Perpanjang 40/41, Layanan 50/53/54, Pengurusan IPTM 47/48), jadi kartu berbunyi "Segera hadir." dan menawarkan CS — tanpa `href`, tanpa tanggal. Tidak ada setengah implementasi.
- **Cabang TPU** — brief menyebut tiket 44 sudah merged dan `pengurusan` punya signature untuk dipakai. Di base `8e35015` `src/domain/pengurusan/index.ts` masih placeholder dan tiket 44 masih `ready-for-agent`, jadi cabang TPU hanya menautkan halaman yang benar-benar ada (`/pengurusan-tpu`, `/lokasi?jenis=tpu`). Perlu dikaji ulang setelah 44/47/48/56 merge.
- **Di luar tiket ini** — `npm run build` gagal di `main` juga: dua `page.tsx` untuk satu URL (`src/app/(site)/pengurusan-tpu/page.tsx` dari tiket 26 dan `src/app/pengurusan-tpu/page.tsx` dari tiket 43). Build tiket ini diverifikasi dengan stub `(site)`-nya dipindahkan sementara, lalu dikembalikan seperti semula; stub mana yang bertahan adalah keputusan pemilik.
- **Lokasi Mitra di luar daftar** — pemilih Lokasi pada form memakai daftar publik (Terverifikasi), jadi Lokasi yang Ditangguhkan atau Berhenti belum bisa dipilih dari form; hub menawarkan CS di bawah form, dan nama Lokasi pada hasil jatuh ke "Lokasi Mitra" kalau tidak terdaftar. Sepadan dengan tiket 59.
- Test yang tidak membuktikan dirinya: yang membandingkan "pesan yang sama untuk semua kegagalan" hanya membandingkan dua miss (nomor dan nama), bukan setiap kombinasi; nama Lokasi yang tidak Terverifikasi tidak punya test; dan e2e `public-site.spec.ts` yang saya ubah hanya berjalan di CI pada `main`, tidak di worktree ini.

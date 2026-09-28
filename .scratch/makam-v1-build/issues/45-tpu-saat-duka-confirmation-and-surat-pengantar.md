# TPU Saat Duka confirmation and Ambil surat pengantar

Status: ready-for-agent
Blocked by: 28, 44
Spec: Domain modules > 8. Pengurusan (payment rule); 13. Field Work (Ambil surat pengantar); 14. Work Queues (Tier 1 Konfirmasi TPU Saat Duka, Tier 2 surat pengantar); 15. Notifications (night TPU alerts); stories 73, 145, 146

## What to build

Admin Platform confirms a Saat Duka TPU order from a Tier 1 "Konfirmasi TPU Saat Duka" row (2 service hours on the 06:00–18:00 clock, escalating at 30 and 90 min) after arranging the burial with the TPU, or offers another TPU. Once an Admin Platform takes the row, their name and contact show to the family. Confirming issues the pay-after Tagihan (Biaya Pengurusan burial amount + Retribusi lines), due 3×24 h after the burial, and auto-creates an "Ambil surat pengantar" Tugas Lapangan. The confirmation shows the agreed burial time, TPU address, Admin Platform and TPU staff contacts, both document lists and the price lines.

## Acceptance criteria

- [ ] The Tier 1 row alerts per ticket 28 (Bertugas, 30 min, 90 min, night rows at 06:00) and closes on confirm or cancellation.
- [ ] Ambil by an Admin Platform shows that person's name and contact on the family's order page.
- [ ] Offer another TPU: the family accepts or declines as with a Lokasi alternative.
- [ ] Confirm: status Dikonfirmasi; pay-after Tagihan issued; the Operator bears the loss if unpaid (chased per ticket 29 with no Pencairan involved).
- [ ] An "Ambil surat pengantar" Tugas Lapangan is created on confirmation; a Tier 2 row appears when it is unassigned or overdue.
- [ ] Confirmation page and message list: agreed burial time, TPU address, Admin Platform and TPU staff contacts, burial and filing document lists, price lines.
- [ ] Setor Retribusi: any Lunas Tagihan with a non-zero Retribusi Pemda line (here or on a filing-only Tagihan, ticket 47) creates a Tier 3 "Setor Retribusi" row due 2 working days after Lunas (Admin Platform calendar, ticket 11); Admin Platform or the Petugas Lapangan records the payment to the Pemda with an uploaded setoran proof, which closes the row (audited). A Rp 0 line creates no row; since every Retribusi is Rp 0 today, only the structure is built.
- [ ] Tests: deadline and escalation timing; no Setor Retribusi row for Rp 0, a row for a non-zero line that closes on the recorded setoran; Tugas auto-created once (idempotent); Tagihan kind and due; staff contact visible after Ambil.

## Added (2026-09-25)

- [ ] A non-zero Retribusi paid in person by a Petugas Lapangan is recorded through a "Setor Retribusi" Tugas Lapangan; its proof upload closes the Tier 3 row.

## Comments

- 2026-09-28 — **Two-axis review, axis Spec: 2 temuan, keduanya keras, keduanya diperbaiki di bawah.** (1) **Biaya Layanan Platform masih diizinkan pada Tagihan TPU.** `KINDS_YANG_BISA_DITAGIH` di `src/domain/pengurusan/konfirmasi-saat-duka-tpu.ts:98` memuat `biaya_layanan_platform`, padahal `spec.md:370` menetapkan fee itu "one Biaya Layanan Platform per Tagihan where it applies (**Lokasi Mitra only**)", `pilihan.ts` memilih dua baris tanpa fee, dan test membuktikan harganya bebas fee. Izin itu membuat **tipe dan kode berbeda dengan spec dan dengan quote yang memanggilnya**. (2) **AC "no Pencairan involved" terpenuhi oleh ketiadaan, bukan oleh test** — `grep Pencairan` di empat file test tiket ini kosong, jadi tidak ada test yang merah kalau Pencairan suatu saat muncul untuk order TPU. Yang **diperiksa benar dan sengaja tidak diubah**: `burialAt` adalah pemakaman *rencana* dengan tenggat 3×24 jam diukur darinya (`spec.md:460`), dan jangkar "recorded" milik tick Lewat Jatuh Tempo (tiket 29); tawaran alternatif hanya TPU DKI (`tawarkan-tpu-lain.ts:89-90`); Surat Pengantar tetap Tugas untuk Petugas dengan bukti wajib dan tenggat Tier 2 23:59 hari pemakaman; baris Tier 1 tetap berbagi Antrean dengan tenggat dua jam kerja; `assignee_account_id` tetap NOT NULL (`spec.md:519`); tidak ada `new Date()`; tidak ada nomor tiket di copy; migrasi `0026` tidak disentuh.

- 2026-09-28 — **Axis Standards belum selesai saat fix pass ini dimulai**, jadi fix pass ini hanya menyentuh dua item Spec di atas dan tidak menyentuhnya, sesuai instruksi.

- 2026-09-28 — **Fix pass item 1 — fee dicabut dari daftar, bukan dari pemanggil.** `biaya_layanan_platform` **dihapus dari `KINDS_YANG_BISA_DITAGIH`**. Bentuk parameternya (`quoted: readonly QuotedLine[]`) tidak berubah dan **tidak ada call site lain**: satu-satunya pemanggil adalah `konfirmasiSaatDukaTpu` sendiri, yang mengisinya dari `burialLines` lokal yang dua barisnya, dan `quote()` hanya menambah fee bila baris ber-`provider: lokasi_mitra` ada (tidak ada di quote TPU). Jadi ini **bukan** signature change dan tidak ada call site yang harus diikuti — permission-nya sendiri yang salah. "Kenapa lubang, bukan kenyamanan": fungsi yang menerima parameter berbentuk fee padahal tidak boleh menerimanya berarti kebenarannya bergantung pada **apa yang pemanggil kirim**, bukan pada apa yang tiket ini mengizinkan; pemanggil lain, atau pelebaran `quote()` di masa depan (Layanan di TPU = tiket 56), bisa mengirim fee dan mendiagnosisnya sebagai baris yang sah. Menolaknya di dalam daftar membuat kegagalan itu **refusal yang membatalkan seluruh konfirmasi** — tidak ada Tagihan terbit sama sekali, bukan menagih keluarga biaya yang bukan haknya — dan refusal itu punya test sendiri. Test yang membuktikan: "refuses a quote carrying a Biaya Layanan Platform, because a TPU order never carries the Operator platform fee" (spec 370).

- 2026-09-28 — **Fix pass item 2 — AC "no Pencairan involved" tidak bisa diuji persis seperti yang diminta, dan alasannya dicatat.** Modul Payouts di pohon ini **placeholder kosong**: tidak ada fungsi publik, tidak ada tabel, tidak ada satu pun `CREATE TABLE` pencairan di `drizzle/`. **Tidak ada Pencairan yang bisa dibuat**, jadi bukti merah yang diminta ("create the Pencairan, show the test failing, then remove it") tidak dapat dilakukan — bukan karena sulit, tetapi karena objeknya belum ada; yang memilikinya adalah **tiket 32** (`Pencairan and Potongan`, `ready-for-agent`). Yang ditulis sebagai gantinya, dengan jujur tentang apa yang ia buktikan: konfirmasi TPU **tidak menghasilkan Tagihan dengan satu pun baris ber-`provider: lokasi_mitra`, dan order itu tidak punya Petak Makam** — dua fakta yang membuat Pencairan mustahil, karena **setiap trigger Pencairan di `spec.md:493-501` berkeyat pada Lokasi Mitra, Mitra Jasa, atau Petak Makam**, dan order TPU tidak punya satu pun ketiganya. Jadi test ini **lebih lemah dari AC**: ia mengunci subjeknya, bukan "tidak ada Pencairan" secara langsung, dan ia akan menguat begitu tiket 32 menyelesaikannya dan `payouts.pencairanOpen()` tersedia untuk dibaca. **Saya tidak menulis test yang lolos karena alasan yang salah** (memeriksa tabel yang memang tidak ada, atau list kosong karena memang tidak ada apa pun untuk diperiksa). Bukti merahnya di entri berikutnya: yang disuntikkan adalah subjek Pencairan itu sendiri, dengan konfirmasi tetap berhasil supaya tidak ada error lain yang menutupi.

- 2026-09-28 — **Fix pass item 1, bukti merah.** Izin `biaya_layanan_platform` sengaja dikembalikan ke `KINDS_YANG_BISA_DITAGIH`, lalu `npx vitest run src/domain/pengurusan/tanpa-pencairan.test.ts` dijalankan:

```
FAIL  src/domain/pengurusan/tanpa-pencairan.test.ts > a Saat Duka TPU Tagihan never
      carries a Lokasi Mitra line > charges only the Operator's Biaya Pengurusan
      and the town's Retribusi: never the Operator's platform fee
AssertionError: expected [ 'biaya_pengurusan', …(2) ] to deeply equal [ 'biaya_pengurusan', …(1) ]
- Expected
+ Received
  [
    "biaya_pengurusan",
    "retribusi_pemda",
+   "biaya_layanan_platform",
  ]
 ❯ src/domain/pengurusan/tanpa-pencairan.test.ts:51:36
```

Izin itu lalu ditarik lagi dan test hijau. Test ini **guard di level sumber**, seperti `src/app/no-ticket-numbers.test.ts` dan sekelasnya, karena yang bisa salah di item 1 adalah **konstanta saat kompilasi**, bukan state saat runtime: `quote()` tidak pernah menghasilkan fee itu untuk quote TPU, jadi tidak ada jalan publik mana pun untuk mencapainya — dan test yang memeriksa total Tagihan saja akan tetap hijau meski izinnya dikembalikan, yaitu persis "lolos karena alasan yang salah".

- 2026-09-28 — **Fix pass item 2, bukti merah.** Pencairan tidak bisa dibuat (lihat entri di atas), jadi yang disuntikkan adalah **subjeknya**: `lineProviderOf` sengaja diubah agar baris Biaya Pengurusan membawa `provider: { kind: "lokasi_mitra", … }` — persis kondisi yang membuat `spec.md:493-501` menarik Pencairan. Konfirmasi **tetap berhasil**, jadi tidak ada error lain yang menutupi, lalu test gagal tepat di assertion subjek:

```
FAIL  src/domain/pengurusan/tanpa-pencairan.test.ts > a Saat Duka TPU Tagihan never
      carries a Lokasi Mitra line > leaves the order with no plot and every line on
      no Lokasi Mitra, which is what makes a Pencairan impossible
AssertionError: expected [ { …(4) }, { …(4) } ] to deeply equal [ …(2) ]
  {
    "amount": 1750000,
    "kind": "biaya_pengurusan",
    "label": "Biaya Pengurusan",
    "provider": {
-       "kind": "operator",
+       "kind": "lokasi_mitra",
+       "lokasiId": "00000000-0000-0000-0000-000000000001",
+       "name": "Sabotase",
    },
  }
 ❯ src/domain/pengurusan/tanpa-pencairan.test.ts:74:28
```

Baris `provider` itu lalu dikembalikan ke `operator` dan test hijau. Kegagalan mendarat **tepat di subjek Pencairan**, bukan di error lain, jadi yang terbukti memang assertion itu yang bekerja.

- 2026-09-28 — **Catatan untuk merge (bukan bagian dari dua fix Spec):** `origin/main` sudah bergerak sejak branch ini dibuat — main sekarang punya `0026_stiff_khan` (tiket 34) dan `0027_fresh_firebird`, sedangkan branch ini membawa `0026_closed_galactus`. **Nomor migrasi akan bentrok dan itu pekerjaan orchestrator di merge worktree** (AGENTS: jangan edit `_journal.json`, jangan rename `.sql` di branch). Saya **tidak menyentuh** `drizzle/0026_closed_galactus.sql` maupun `_journal.json`; keduanya bersih di `git status`.

- 2026-09-28 — **`new Date()` di kode saya sendiri, dibersihkan.** `setor-retribusi.ts` pernah memanggil `new Date(\`${data.dibayarkanPada}T00:00:00+07:00\`)` untuk mengubah tanggal kalender WIB yang tertulis di bukti setor menjadi instan. Itu **bukan** baca "now" (argumennya data yang diketik manusia, dan "now" sendiri tetap dari Clock), tapi aturan repo menyebut konversi tanggal hanya lewat `@/lib/time/jakarta`, dan file saya yang lain sudah memakai `wib()` untuk hal yang persis sama. Sekarang konsisten: `wib(\`${data.dibayarkanPada} 00:00\`)`, nilai instannya identik, test tetap hijau. Tiga `new Date()` yang tersisa di `acara.ts` dan `pesan-keluarga.ts` adalah kode `main` yang tidak saya tulis — semuanya aritmetika atas instan yang sudah diketahui (`start.getTime() + 8h`), bukan `new Date()` tanpa argumen.

- 2026-09-28 — **Empat test yang sudah hijau + `tests/support/queues.ts` dari commit pertama masih dibenarkan** setelah kedua fix ini; tidak ada yang dibatalkan, dan tidak ada assertion lama yang dilonggarkan.

## Comments (lanjutan)

- 2026-09-28 — **AC 1 terpenuhi separuh, dan separuhnya milik tiket 28.** Baris Tier 1 "Konfirmasi TPU Saat Duka" dibangun sebagai proyeksi murni dari `pengurusan.konfirmasiTpuTerbuka()` (order `diajukan`), dengan `deadline` = `konfirmasi_due_at` milik order itu sendiri — dua jam kerja di jam layanan TPU, dihitung `daytimeHoursDeadline` milik Lokasi (tiket 11) **saat pengajuan**, bukan saat baris dibaca. Baris menutup dirinya saat order dikonfirmasi atau ditolak. Yang **tidak** dibangun: Bertugas, alert 30/90 menit, dan alert 06:00 untuk baris malam — semuanya milik **tiket 28** (`ready-for-agent`). `tier: 1` membuat baris otomatis `alerts: true` lewat agregator, jadi tiket 28 punya hook-nya lewat konstanta `KONFIRMASI_TPU_SAAT_DUKA_TYPE` yang diekspor ke publik. **Angka 30/90 menit tidak diuji di sini dan tidak boleh diklaim terbukti.**

- 2026-09-28 — **AC 2 dibaca "nama dan kontak", dan Akun Staf tidak punya nama.** `identity_user.name` ada tapi tidak diisi wizard mana pun; satu-satunya yang bisa dibaca adalah Email Terverifikasi + nomor telepon. `queues.ambilPengurus` mengembalikan nama dengan fallback ke email (`name.trim() || email || accountId`), jadi keluarga tidak pernah melihat string kosong. Ini **read tanpa Actor** di modul queues (dokumentasi di method-nya): satu-satunya pembacanya adalah halaman order milik Pemesan itu sendiri, dan `lokasi.kontakSiagaOf` sudah jadi preseden untuk kontak staf yang tampil ke keluarga.

- 2026-09-28 — **AC 4: "the Operator bears the loss … chased per ticket 29" tidak bisa dipenuhi.** Tagihan terbit `pay_after` dengan `paymentWindowHours: 72` dan due 3×24 jam setelah pemakaman (terbukti test), jadi **tidak ada Pencairan** yang muncul dari TPU — itu konsekuensi pay-after di TPU, bukan kode tambahan. Tapi **pengejaran, pengingat H+3/7/14/30, Lewat Jatuh Tempo dan Tidak Tertagih adalah tiket 29** (`ready-for-agent`), jadi tidak ada satu pun dari itu di branch ini.

- 2026-09-28 — **AC 5 "unassigned atau overdue" dibaca sebagai "belum diambil tepat waktu".** `fieldwork_tugas.assignee_account_id` `NOT NULL` sejak tiket 15, jadi tidak ada Tugas tanpa assignee tanpa **contract migration** (menjatuhkan NOT NULL) yang harus jadi release terpisah dan bukan milik tiket ini. Yang dibangun: baris Tier 2 muncul selama Tugas `ditugaskan` ada, dengan `deadline` = akhir hari pemakaman, sehingga tugas yang lewat hari itu tampil lewat tenggat. Ambil-claim Antrean (yang sebenarnya "unassigned" di Antrean) sudah ada di `queues` sejak tiket 17 dan tidak diubah.

- 2026-09-28 — **Lokasi Setor Retribusi dipilih: modul `fieldwork`, bukan `pengurusan`.** Alasannya tiga dan semuanya pindah oleh fakta: (1) AC bilang "**any** Lunas Tagihan dengan baris Retribusi Pemda non-nol" — termasuk Tagihan filing-only (tiket 47) yang belum ada, jadi pemiliknya tidak boleh pengurusan; (2) "Setor Retribusi" adalah `tugasLapanganTypes` milik Field Work, dan bukti yang menutup baris **adalah upload milik Tugas itu**, jadi penulisan terjadi di transaksi yang sama dengan completion-nya; (3) Billing tidak pernah membaca file ini, jadi tidak ada siklus modul (fieldwork → billing; pengurusan → fieldwork). Tabel baru `fieldwork_setor_retribusi`, satu baris per Tagihan lewat unique index — satu daerah dibayar sekali. Admin Platform dan Petugas melewati `tulisSetor` yang sama.

- 2026-09-28 — **Tugas "Setor Retribusi" butuh kolom `tagihan_id` baru di `fieldwork_tugas`.** `form` jsonb ditimpa saat completion, jadi referensi Tagihan tidak bisa tinggal di sana. Kolomnya nullable (expand, aman untuk CI), dan `newTugasLapanganSchema` **menolak** `tagihanId` untuk tipe lain (`tagihan_tidak_relevan`) serta mewajibkannya untuk `setor_retribusi` (`tagihan_kosong`). Migrasi `0026_closed_galactus` create-only + `ADD COLUMN` nullable: tidak ada DROP/RENAME/SET NOT NULL, jadi tidak butuh komentar `-- contract:`.

- 2026-09-28 — **Harga tidak disimpan dua kali.** `harga` pada order berisi baris yang **sama** yang dibawa Tagihan (label dari `quoteLineLabel`, amount dari `quote()`), disalin saat konfirmasi supaya halaman keluarga mengutip angka yang sama dengan yang ditagihkan. Test membuktikannya dari dua sisi: `orderOf().harga` dan `billing.tagihan()`.

- 2026-09-28 — **Tes yang sudah hijau di `main` dan saya ubah, dengan alasannya.** (1) `pengurusan/saat-duka-tpu.test.ts`: `tagihanId: null` → `tagihan: null`, karena read order sekarang mengembalikan objek Tagihan penuh (total + due dibaca lewat `billing.tagihan()`, bukan dikarang) sejak konfirmasi bisa terjadi. (2) `billing/tagihan.test.ts`: daftar key interface menambah `tagihanRetribusiLunas`. (3) `identity/staff-access.test.ts` dan `pemulihan-akun.test.ts`: ekspektasi `StaffAccount` tambah `name: ""`. (4) `notifications/acara.test.ts`: `TEMPLATE_EMAIL` menambah `pengurusan_dikonfirmasi` beserta test waktu transaksionalnya. (5) `tests/support/queues.ts` disusun ulang agar queues punya modul Pengurusan-nya sendiri dengan recorder pesan; Pemesanan tetap memakai **notifications sungguhan** supaya tes Antrean Lokasi yang butuh pesan gagal tetap benar.

- 2026-09-28 — **Tidak terbukti / tidak ada testnya, jangan diklaim.** (a) Eskalasi Bertugas 30/90 menit dan alert 06:00 pagi — tiket 28, tanpa test. (b) Pengejaran pay-after / Tidak Tertagih — tiket 29, tanpa test. (c) **Tidak ada test e2e Playwright** untuk konfirmasi maupun Setor Retribusi: menambahkannya butuh seed TPU di `src/cli/seed-saat-duka-command.ts` dan Playwright tidak bisa dijalankan di sesi ini, jadi spec yang tak pernah dijalankan berisiko membuat `main` merah — follow-up, sama seperti tiket 44. (d) `Fieldwork.within(tx)` **tidak diuji langsung**; yang terbukti adalah konfirmasi membuat Tugas-nya dalam transaksi yang sama (lewat test idempoten: konfirmasi dua kali = satu Tugas), jadi rollback-nya terbukti secara tidak langsung. (e) `queues.ambilPengurus` diuji untuk nilai yang dikembalikan, tidak untuk penolakan pembaca non-Pemesan — ia memang tidak punya Actor, dan itu keputusan yang dicatat di atas, bukan sesuatu yang terbukti aman oleh test. (f) Halaman daftar `/staf/admin-platform/pengurusan` dan `konfirmasi-forms.tsx` **tidak punya test**; hanya route-nya yang `npm run build` buktikan ada. (g) Tampilan layar tidak diverifikasi browser — tidak ada stack lokal di sesi ini.

- 2026-09-28 — **Tidak dikerjakan, dan nomor pemiliknya.** (1) Alert/eskalasi Tier 1 — **tiket 28**. (2) Chasing + Tidak Tertagih pay-after TPU — **tiket 29**. (3) Setor Retribusi pada Tagihan filing-only — **tiket 47** (read Billing-nya sudah membaca Tagihan mana pun, jadi filing-only akan muncul tanpa perubahan kode). (4) "Catat Pemakaman" (order → Dimakamkan), upload dokumen pengajuan, Surat Kuasa, dan IPTM — **tiket 46**. (5) Pembatalan order + refund — **tiket 46**. (6) Hari-H Layanan oleh Mitra Jasa di TPU pada Tagihan ini — **tiket 56**: Tagihan sudah `saat_duka` jadi `LAYANAN_TAKE_MOMENT_DUE` sudah memuatnya, tetapi `KINDS_YANG_BISA_DITAGIH` **menolak** baris `layanan_dki` dengan sengaja, jadi 56 harus menambahkannya eksplisit bersama alasan keamanannya. (7) `Pengurusan IPTM` (filing-only) di spec module 8 — **tiket 47**.

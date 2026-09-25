# WhatsApp message templates for Makam.co.id v1

Status: draft, ready to submit to Meta through kirim.dev
Owner tickets: 05 (submission), 20 (event table), 62 (name and parameter mapping)
Sources: `../makam-v1/spec.md` (Domain modules 1, 6–12, 15; stories), `../../CONTEXT.md`, `../makam-v1/issues/19-notification-channels.md` and the build tickets listed per template.

WhatsApp Business Account: PT Jaya Korpora Prima. Display name: **Makam.co.id**. All templates use language `id`. There are 43 templates: 1 authentication and 42 utility (#43 `staf_undangan` added by ticket 09). None are marketing. WhatsApp is the only channel for the OTP.

## Summary table

"Rem." means a family reminder, sent only 08:00–20:00 WIB. "Any" means it can go out at any hour (transactional message or staff alert). Templates marked **(implied)** match a spec state the family must act on, but the spec never says in so many words that this state sends a WhatsApp message. See "Rules not mapped or ambiguous" at the end.

| # | Template name | Category | Lang | Trigger (spec reference) | Recipient | Variables | Time |
|---|---|---|---|---|---|---|---|
| 1 | `kode_verifikasi` | AUTHENTICATION | id | Every OTP: Masuk, Kirim in the wizards, Pemegang Hak OTP for Perpanjangan and for consent (§1 Identity & Access; §15 "OTP uses Meta's authentication template"; stories 26, 54, 58, 98; tickets 08, 35, 40) | Anyone logging in, or the Pemegang Hak | code | Any |
| 2 | `saat_duka_dikonfirmasi` | UTILITY | id | Admin Lokasi confirms a Saat Duka order, or a burial under an existing Hak Pakai (§6; story 29; issue 19 "order confirmations"; tickets 23, 35) | Pemesan | nama, almarhum, lokasi, nomor_pemesanan, petak, jendela_bayar; URL order, URL tagihan | Any |
| 3 | `tpu_saat_duka_dikonfirmasi` | UTILITY | id | Admin Platform confirms a Saat Duka TPU order (§8; story 73; ticket 45) | Pemesan | nama, almarhum, tpu, nomor_pemesanan, waktu_pemakaman; URL order, URL tagihan | Any |
| 4 | `pesanan_alternatif` **(implied)** | UTILITY | id | Tawarkan alternatif at a Lokasi Mitra, or another TPU offered (§6; stories 31, 145; tickets 24, 45) | Pemesan | nama, nomor_pemesanan, lokasi, alternatif; URL order | Any |
| 5 | `saat_duka_ditolak` | UTILITY | id | Saat Duka order Ditolak: rebook link plus a call within 2 h (§6; §14 Tier 1; stories 32, 33; ticket 24) | Pemesan | nama, lokasi, nomor_pemesanan, almarhum, alasan; URL rebook; phone CS | Any |
| 6 | `pesanan_ditolak` **(implied)** | UTILITY | id | Terencana Ditolak (story 49; ticket 37); burial under an existing Hak Pakai Ditolak, e.g. "Pemegang Hak tidak menyetujui" (§6; ticket 35) | Pemesan | nama, nomor_pemesanan, lokasi, alasan; URL order | Any |
| 7 | `terencana_dikonfirmasi` | UTILITY | id | Terencana confirmed: hold starts and the pay-first Tagihan is issued (§6; §10 due rules; story 46; ticket 37) | Pemesan | nama, nomor_pemesanan, lokasi, batas_tahan, nomor_tagihan, jumlah; URL tagihan, URL order | Any |
| 8 | `persetujuan_pemakaman` | UTILITY | id | Consent request for a burial under an existing Hak Pakai (§6 consent resolution; story 54; ticket 35) | Pemegang Hak | nama, pemohon, almarhum, lokasi, unit; URL consent | Any |
| 9 | `bukti_pemesanan_terbit` | UTILITY | id | Bukti Pemesanan issued on Lunas (§10 Documents; stories 36, 38; tickets 25, 37) | Pemesan | nama, nomor_pemesanan, nomor_bukti, lokasi; URL dokumen | Any |
| 10 | `tagihan_terbit` | UTILITY | id | Tagihan issued: Perpanjangan, filing-only Pengurusan, Perpanjangan TPU, standalone Layanan, Harga Khusus reissue (§15 schedule "on issue"; issue 19 "Tagihan: when sent"; ticket 20) | Tagihan addressee (Pemesan, or Pemegang Hak for a Perpanjangan) | nama, untuk, nomor_tagihan, jumlah, batas_bayar; URL tagihan | Rem. |
| 11 | `tagihan_pengingat` | UTILITY | id | Pay-first Tagihan H-1 and on the due day (§15 schedule row 1; ticket 20) | Tagihan addressee | nama, nomor_tagihan, untuk, jumlah, batas_bayar; URL tagihan | Rem. |
| 12 | `terencana_pengingat_bayar` | UTILITY | id | Terencana Tagihan, once about 4 h before the hold expires (§15 schedule row 2; story 46; ticket 37) | Pemesan | nama, lokasi, batas_tahan, nomor_tagihan, jumlah; URL tagihan | Rem. |
| 13 | `tagihan_lewat_jatuh_tempo` | UTILITY | id | Pay-after Tagihan H+3, H+7, H+14, H+30 (§10 Chasing; §15 schedule row 4; story 160; ticket 29) | Pemesan | nama, nomor_tagihan, almarhum, jumlah, batas_bayar; URL tagihan; phone CS | Rem. |
| 14 | `bukti_pembayaran_terbit` | UTILITY | id | Every payment issues one Bukti Pembayaran (§10 Payment, Documents; stories 36, 38; tickets 19, 20, 30) | Tagihan addressee | nama, nomor_tagihan, jumlah, waktu_bayar, nomor_bukti; URL dokumen | Any |
| 15 | `pengembalian_dana_isi_rekening` | UTILITY | id | Refund needs the destination bank account (§6 Pembatalan "to a bank account that Pemesan enters"; story 107; tickets 31, 38) | Pemesan who paid | nama, untuk, nomor_tagihan, jumlah; URL rekening | Any |
| 16 | `bukti_pengembalian_dana_terbit` | UTILITY | id | Refund transferred, Bukti Pengembalian Dana issued (§10 Refunds, Documents; story 161; ticket 31) | Pemesan who paid | nama, jumlah, nomor_tagihan, tanggal_transfer; URL dokumen | Any |
| 17 | `paket_tagihan_siklus` | UTILITY | id | Paket cycle Tagihan issued at H-7 (§9 Recurring cycles; §15 schedule row 3; story 88; ticket 54) | Pemesan (Paket account) | nama, paket, label_makam, periode, jumlah, batas_bayar; URL tagihan | Rem. |
| 18 | `paket_tagihan_siklus_tarif_baru` | UTILITY | id | The same H-7 message when a new tariff applies to the cycle: "the H-7 message says so" (§9; ticket 54) | Pemesan (Paket account) | as #17 plus tanggal_tarif | Rem. |
| 19 | `paket_pengingat_bayar` | UTILITY | id | Paket cycle Tagihan reminder at H-1 (§15 schedule row 3; ticket 54) | Pemesan (Paket account) | nama, paket, periode, jumlah, batas_bayar; URL tagihan | Rem. |
| 20 | `hak_pakai_akan_berakhir` | UTILITY | id | Hak Pakai end 60, 30 and 7 days before (§15 schedule row 5; story 57; ticket 42) | Pemegang Hak | nama, unit, lokasi, tanggal_berakhir; URL makam | Rem. |
| 21 | `hak_pakai_masa_tenggang` | UTILITY | id | Weekly during the Masa Tenggang (§15 schedule row 5; story 57; ticket 42) | Pemegang Hak | nama, unit, lokasi, tanggal_berakhir, akhir_tenggang; URL makam | Rem. |
| 22 | `perpanjangan_disetujui` **(implied)** | UTILITY | id | Manual-path Perpanjangan request Disetujui; applicant then picks terms (§7; stories 59–61, 67; ticket 41) | Applicant (Pemegang Hak / heir / claimant) | nama, unit, lokasi; URL permohonan | Any |
| 23 | `permintaan_perlu_perbaikan` | UTILITY | id | A request goes to Perlu Perbaikan: Perpanjangan manual path, Pembatalan, Pengembalian, Ganti Pemegang Hak, Perpanjangan TPU, fixable PTSP rejection (§6, §7, §8; stories 80, 82; tickets 38, 39, 41, 47, 48) | Requester | nama, jenis, subjek, catatan; URL permohonan | Any |
| 24 | `permintaan_disetujui` **(implied)** | UTILITY | id | Pengembalian Hak Pakai or Ganti Pemegang Hak request Disetujui (§6 request statuses; ticket 39) | Requester | nama, jenis, subjek; URL permohonan | Any |
| 25 | `permintaan_ditolak` **(implied except PTSP)** | UTILITY | id | Any of the requests in #23 Ditolak; final PTSP rejection "with the reason shown"; Perpanjangan TPU closed Ditolak past grace (§6, §7, §8; stories 81, 82; tickets 41, 47, 48) | Requester | nama, jenis, subjek, alasan; URL permohonan; phone CS | Any |
| 26 | `bukti_perpanjangan_terbit` | UTILITY | id | Perpanjangan paid, Bukti Perpanjangan issued (§7; §10 Documents; story 65; ticket 40) | Pemegang Hak | nama, unit, lokasi, tanggal_baru; URL dokumen | Any |
| 27 | `lokasi_berhenti_pemberitahuan` | UTILITY | id | Berhenti decision: "the families are told" (§3 Lokasi Berhenti; §9 Recurring cycles; ticket 59) | Pemegang Hak and Paket subscribers at that Lokasi | nama, lokasi, tanggal_efektif; URL makam | Rem. |
| 28 | `iptm_terbit` | UTILITY | id | IPTM Terbit: scan sent even if unpaid (§8; story 76; ticket 46; also 47, 48) | Pemesan and Pemegang Hak | nama, almarhum, makam_tpu, berlaku_sampai; URL dokumen | Any |
| 29 | `iptm_akan_berakhir` | UTILITY | id | IPTM expiry 3 months and 1 month before (§15 schedule row 6; story 79; ticket 48) | Pemegang Hak (Makam TPU) | nama, almarhum, makam_tpu, tanggal_berakhir; URL makam | Rem. |
| 30 | `layanan_selesai` | UTILITY | id | Proof shown to the Pemesan: Admin Lokasi upload or Admin Platform approval (§9 Pekerjaan Layanan; story 92; issue 19 "photo report"; tickets 50, 57) | Pemesan | nama, layanan, label_makam, tanggal_selesai; URL pekerjaan | Any |
| 31 | `layanan_pesan_baru` | UTILITY | id | New message in a Pekerjaan Layanan thread (§9 Message thread; story 96; ticket 52) | Pemesan | nama, pengirim, layanan, label_makam; URL thread | Any |
| 32 | `layanan_jadwal_berubah` | UTILITY | id | Target date moves after a Mitra Jasa is suspended or ended: "notified only if the target date moves" (§9 Mitra Jasa; ticket 55) | Pemesan | nama, layanan, label_makam, tanggal_baru; URL pekerjaan | Any |
| 33 | `wakaf_status_berubah` | UTILITY | id | Each Pengajuan Wakaf status change (§12; story 112; ticket 58) | Wakif | nama, lokasi_tanah, status; URL wakaf | Any |
| 34 | `staf_saat_duka_baru` | UTILITY | id | New Saat Duka order at a Lokasi Mitra, at any hour (§15; story 116; ticket 23) | Every Admin Lokasi of the Lokasi and the Kontak Siaga | lokasi, nomor_pemesanan, jenis_makam, rencana_pemakaman, batas_konfirmasi, kontak_siaga; URL staf | Any |
| 35 | `staf_saat_duka_belum_dikonfirmasi` | UTILITY | id | Re-alert when 1 h of Jam Operasional passes unconfirmed (§15; story 116; ticket 23) | Same as #34 | nomor_pemesanan, lokasi, batas_konfirmasi; URL staf | Any |
| 36 | `staf_antrean_mendesak` | UTILITY | id | New Tier 1 Antrean row (§14 Tier 1; story 142; tickets 28, 45) | Admin Platform who are Bertugas (all if none) | jenis_baris, subjek, batas_waktu; URL staf | Any |
| 37 | `staf_antrean_eskalasi` | UTILITY | id | Tier 1 row not taken at 30 min; Konfirmasi TPU Saat Duka unconfirmed at 90 min (§14; issue 19 amendment; ticket 28) | Every Admin Platform | jenis_baris, subjek, sejak; URL staf | Any |
| 38 | `staf_tugas_lapangan_baru` | UTILITY | id | Tugas Lapangan assigned (§13; issue 19 "Petugas ... alert for every job"; ticket 15) | Petugas Lapangan | jenis_tugas, tempat, tanggal_rencana; URL staf | Any |
| 39 | `mitra_jasa_pekerjaan_baru` | UTILITY | id | Pekerjaan Layanan assigned to a Mitra Jasa (§9 Mitra Jasa; story 176; ticket 56) | Mitra Jasa | layanan, tpu, tanggal_target, batas_jawab; URL staf | Any |
| 40 | `staf_hak_pakai_berakhir` | UTILITY | id | Hak Pakai end reminders to the Admin Lokasi, same schedule as #20/#21 (§15 schedule row 5; ticket 42) | Admin Lokasi of the Lokasi | unit, lokasi, tanggal_berakhir; URL staf | Rem. |
| 41 | `staf_calon_penghuni_diubah` | UTILITY | id | Pemegang Hak changes a Calon Penghuni label: "the Lokasi is notified, with no review" (§5 Inventory; story 105; ticket 39) | Admin Lokasi of the Lokasi | unit, lokasi; URL staf | Any |
| 42 | `pencairan_terkirim` | UTILITY | id | Pencairan transferred, Bukti Pencairan issued; "the recipient gets its link by message" (§11 Pencairan run; issue 19; ticket 32) | Lokasi Mitra (its Admin Lokasi) or Mitra Jasa | penerima, jumlah, tanggal_transfer, nomor_bukti; URL dokumen | Any |
| 43 | `staf_undangan` | UTILITY | id | Undangan Staf sent by Admin Platform (§1 Identity & Access; story 170; ticket 09) | The invited WhatsApp number | peran, tautan_masuk | Any |

## Conventions for every template

**Variables**
- Positional `{{1}}`, `{{2}}`, … in the order they appear. Samples are given per template, and Meta requires a sample for each one.
- No body starts or ends with a variable, and every body ends with a whole static sentence. No two variables are separated only by a space or a punctuation mark: each pair has at least one word between them. Every body has well over 3 words per variable plus one (the usual ratio threshold).
- At send time a value must not contain a newline, a tab or more than four consecutive spaces, or Meta rejects the send. Free-text values (`catatan`, `alasan`) are flattened to one line and cut at 200 characters, ending with "…".
- Formats: amounts `Rp 1.250.000`; dates `Senin, 12 Oktober 2026`; date and time `Senin, 12 Oktober 2026 pukul 14.00 WIB`; document numbers as in the spec (`TGH/2026/000123`, `BYR/…`, `RFD/…`, `BKP/…`, `BPM/…`, `BPP/…`, `MKM-2026-000123`).
- `unit` is a Petak Makam or a Kavling Keluarga, rendered as "Petak A-12" or "Kavling K-03".
- `label_makam` identifies the grave for a Layanan. It is "makam Almarhum <nama>" when a Pemakaman exists; otherwise it is the unit plus the place, e.g. "Petak B-07 di Taman Makam Al-Ikhlas" for an empty Terencana plot, or the TPU grave description.
- `nama` is the recipient's name as recorded. The app adds no honorific because the body already says "Bapak/Ibu".

**Links**
- Links are URL buttons with a dynamic suffix, never links in the body text. Each base URL is on makam.co.id, the Operator's own domain, with no URL shortener. The suffix is an unguessable token or a record ID, and it is the only variable in the URL (Meta allows one, at the end).
- Proposed routes, for ticket 20 to confirm against the app's real routes: `https://makam.co.id/tagihan/{{1}}` (public pay page of a Tagihan); `https://makam.co.id/dokumen/{{1}}` (Bukti documents and the IPTM scan, unguessable link); `https://makam.co.id/akun/pesanan/{{1}}`, `/akun/makam/{{1}}`, `/akun/permohonan/{{1}}`, `/akun/layanan/{{1}}`, `/akun/wakaf/{{1}}` (Akun Saya pages, login by OTP); `https://makam.co.id/persetujuan/{{1}}` (consent, OTP-gated); `https://makam.co.id/pesan/saat-duka/ulang/{{1}}` (rebook after a Tolak); `https://makam.co.id/staf/{{1}}` (staff pages).
- Button labels are at most 25 characters. A template has at most two URL buttons and one phone button.
- The "Hubungi CS" phone button carries the human CS WhatsApp number from ticket 06. If that number changes, the templates that use the button (#5, #13, #25) must be edited and re-approved.

**Header, footer and tone**
- Headers are static text of 60 characters or less, with no variables. Some templates have no header.
- Footer on every utility template: `Makam.co.id · Pesan otomatis` (28 chars).
- Register: formal Bahasa Indonesia with "Anda" and "Bapak/Ibu". No emoji, no exclamation marks, no prices other than the recipient's own Tagihan, no offers, no urgency words such as "segera!", "terbatas" or "promo". Terms are used exactly as in `CONTEXT.md`.
- The brand in body text is "Makam.co.id" only. The Operator's legal name appears on document headers, not in templates.

**Not a template**
- The inbound auto-reply pointing to the CS number is a free-form reply inside the 24-hour customer-service window the sender opened, so it needs no template (ticket 62).
- Admin Lokasi alerts for an overdue Tagihan (H+1, Tidak Tertagih) are web push only (§15 schedule row 7), so they have no template.

---

## Authentication

### 1. `kode_verifikasi`

Category AUTHENTICATION · language `id` · any hour · recipient: whoever requested the OTP

The body is Meta's fixed text and cannot be edited. Only the options below can be set. URLs, media and emoji are not allowed. Linked-device protection is on by default, so the code arrives only on the phone and not on WhatsApp Web or Desktop, which matches the spec.

Creation payload (through kirim.dev to `POST /<WABA_ID>/message_templates`):

```json
{
  "name": "kode_verifikasi",
  "language": "id",
  "category": "AUTHENTICATION",
  "components": [
    { "type": "BODY", "add_security_recommendation": true },
    { "type": "FOOTER", "code_expiration_minutes": 10 },
    { "type": "BUTTONS", "buttons": [ { "type": "OTP", "otp_type": "COPY_CODE", "text": "Salin kode" } ] }
  ]
}
```

What the recipient sees (Meta's `id` localisation; check the preview in WhatsApp Manager before relying on this wording):

```
*123456* adalah kode verifikasi Anda. Demi keamanan, jangan bagikan kode ini.
Kode ini kedaluwarsa dalam 10 menit.
[ Salin kode ]
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | the OTP, max 15 chars (copy-code value max 20) | `123456` |

`code_expiration_minutes: 10` is a placeholder. Ticket 08 has not yet chosen the OTP expiry, and the value here must match it (Meta allows 1–90). The same template serves Masuk, Kirim in every wizard, the Pemegang Hak OTP for Perpanjangan and the OTP in front of a consent. The OTP screen explains what the code is for, and Meta does not let the message say it.

---

## Pemesanan

### 2. `saat_duka_dikonfirmasi`

UTILITY · `id` · any hour · Pemesan · tickets 23, 35

**Header:** `Pesanan Dikonfirmasi`

**Body:**
```
Bapak/Ibu {{1}}, kami turut berduka cita. Pesanan makam untuk Almarhum {{2}} telah dikonfirmasi oleh {{3}}.

Nomor Pemesanan: {{4}}
Petak Makam: {{5}}

Pemakaman tetap berjalan tanpa menunggu pembayaran. Tagihan dapat dibayar hingga {{6}} setelah pemakaman. Dokumen boleh diunggah nanti atau dibawa pada hari pemakaman.

Kontak Admin Lokasi dan daftar dokumen ada di halaman pesanan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Rina Kusuma` |
| {{2}} | Almarhum name | `Ahmad Sudirman` |
| {{3}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |
| {{4}} | Nomor Pemesanan | `MKM-2026-000123` |
| {{5}} | Petak Makam (blok + Nomor Makam) | `Blok A, No. A-12` |
| {{6}} | the Lokasi's Saat Duka payment window | `3×24 jam` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:**
- URL "Lihat Pesanan": `https://makam.co.id/akun/pesanan/{{1}}`, sample `https://makam.co.id/akun/pesanan/MKM-2026-000123`
- URL "Lihat Tagihan": `https://makam.co.id/tagihan/{{1}}`, sample `https://makam.co.id/tagihan/q7Zk2mW9aP`

The template also serves a confirmed burial under an existing Hak Pakai: {{5}} is then the existing Petak. The body gives the payment window instead of a date because the clock runs from the **recorded** burial (§10), and planned burial time is optional. Because the Tagihan button is here, the Notifications table should not also send `tagihan_terbit` for this event (see Ambiguities).

### 3. `tpu_saat_duka_dikonfirmasi`

UTILITY · `id` · any hour · Pemesan · ticket 45

**Header:** `Pemakaman Telah Diatur`

**Body:**
```
Bapak/Ibu {{1}}, kami turut berduka cita. Pemakaman Almarhum {{2}} di {{3}} telah kami atur bersama pihak TPU.

Nomor Pemesanan: {{4}}
Waktu pemakaman: {{5}}

Pemakaman tetap berjalan tanpa menunggu pembayaran. Setelah pemakaman, mohon unggah dokumen pengurusan IPTM dalam 7 hari. Alamat TPU, kontak petugas, dan daftar dokumen ada di halaman pesanan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Rina Kusuma` |
| {{2}} | Almarhum name | `Ahmad Sudirman` |
| {{3}} | TPU name | `TPU Karet Bivak` |
| {{4}} | Nomor Pemesanan | `MKM-2026-000124` |
| {{5}} | agreed burial time | `Selasa, 13 Oktober 2026 pukul 10.00 WIB` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Pesanan" `https://makam.co.id/akun/pesanan/{{1}}`; URL "Lihat Tagihan" `https://makam.co.id/tagihan/{{1}}` (samples as #2)

### 4. `pesanan_alternatif` (implied)

UTILITY · `id` · any hour · Pemesan · tickets 24, 45

**Body:**
```
Bapak/Ibu {{1}}, pesanan {{2}} belum dapat dilayani di {{3}} persis seperti yang diajukan. Tersedia pilihan lain: {{4}}.

Silakan lihat total biaya yang baru, lalu terima atau tolak pilihan ini di halaman pesanan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Rina Kusuma` |
| {{2}} | Nomor Pemesanan | `MKM-2026-000123` |
| {{3}} | Lokasi Mitra or TPU originally chosen | `Taman Makam Al-Ikhlas` |
| {{4}} | the alternative (Jenis Makam, day or other TPU) | `Jenis Makam Keluarga Blok C pada hari yang sama` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Pilihan" `https://makam.co.id/akun/pesanan/{{1}}`

### 5. `saat_duka_ditolak`

UTILITY · `id` · any hour · Pemesan · ticket 24

**Body:**
```
Bapak/Ibu {{1}}, mohon maaf, {{2}} tidak dapat menerima pesanan {{3}} untuk Almarhum {{4}}. Alasan: {{5}}.

Kami sudah menyiapkan pilihan makam lain di kota Anda, termasuk TPU DKI, dengan data Anda yang sudah terisi. Tim kami juga akan menelepon Anda dalam 2 jam untuk membantu.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Rina Kusuma` |
| {{2}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |
| {{3}} | Nomor Pemesanan | `MKM-2026-000123` |
| {{4}} | Almarhum name | `Ahmad Sudirman` |
| {{5}} | Tolak reason from the fixed list | `petak untuk jenis makam ini sudah penuh` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:**
- URL "Lihat Pilihan Lain": `https://makam.co.id/pesan/saat-duka/ulang/{{1}}`, sample `https://makam.co.id/pesan/saat-duka/ulang/MKM-2026-000123`
- PHONE_NUMBER "Hubungi CS": the CS number (ticket 06)

### 6. `pesanan_ditolak` (implied)

UTILITY · `id` · any hour · Pemesan · tickets 35, 37

**Body:**
```
Bapak/Ibu {{1}}, mohon maaf, pesanan {{2}} di {{3}} tidak dapat dilanjutkan. Alasan: {{4}}.

Rincian dan langkah berikutnya ada di halaman pesanan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Rina Kusuma` |
| {{2}} | Nomor Pemesanan | `MKM-2026-000130` |
| {{3}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |
| {{4}} | reason | `Pemegang Hak tidak menyetujui` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Pesanan" `https://makam.co.id/akun/pesanan/{{1}}`

For a Terencana order, the order page takes the family back to the Lokasi step (story 49).

### 7. `terencana_dikonfirmasi`

UTILITY · `id` · any hour · Pemesan · ticket 37

**Header:** `Pesanan Dikonfirmasi`

**Body:**
```
Bapak/Ibu {{1}}, pesanan {{2}} di {{3}} telah dikonfirmasi. Petak yang Anda pilih kami tahan sampai {{4}}.

Tagihan {{5}} sebesar {{6}} perlu dibayar sebelum batas tersebut. Jika belum dibayar, pesanan batal dengan sendirinya dan petak dilepas.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Budi Santoso` |
| {{2}} | Nomor Pemesanan | `MKM-2026-000140` |
| {{3}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |
| {{4}} | hold expiry = Tagihan due | `Rabu, 14 Oktober 2026 pukul 15.30 WIB` |
| {{5}} | Nomor Tagihan | `TGH/2026/000210` |
| {{6}} | amount | `Rp 18.500.000` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Bayar Tagihan" `https://makam.co.id/tagihan/{{1}}`; URL "Lihat Pesanan" `https://makam.co.id/akun/pesanan/{{1}}`

This message stands in for `tagihan_terbit` on a Terencana order.

### 8. `persetujuan_pemakaman`

UTILITY · `id` · any hour (a burial is waiting) · Pemegang Hak · ticket 35

**Header:** `Permintaan Persetujuan`

**Body:**
```
Bapak/Ibu {{1}}, ada permintaan pemakaman di makam yang tercatat atas nama Anda sebagai Pemegang Hak.

Pemohon: {{2}}
Almarhum: {{3}}
Lokasi: {{4}}, {{5}}

Mohon berikan persetujuan atau penolakan Anda melalui tautan di bawah. Untuk keamanan, Anda akan diminta memasukkan kode verifikasi yang kami kirim ke nomor ini.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemegang Hak name | `Hj. Siti Aminah` |
| {{2}} | Pemesan name | `Rina Kusuma` |
| {{3}} | Almarhum name | `Ahmad Sudirman` |
| {{4}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |
| {{5}} | unit | `Petak A-12` |

{{4}} and {{5}} are separated only by ", ". If Meta flags them as adjacent, merge them into one value, `Taman Makam Al-Ikhlas, Petak A-12`, and drop {{5}}.

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Beri Tanggapan" `https://makam.co.id/persetujuan/{{1}}`, sample `https://makam.co.id/persetujuan/Hk83JdPq`

Setujui and Tolak are on the page, not quick-reply buttons, because each needs the OTP first (story 54).

### 9. `bukti_pemesanan_terbit`

UTILITY · `id` · any hour · Pemesan · tickets 25, 37

**Body:**
```
Bapak/Ibu {{1}}, pembayaran pesanan {{2}} telah kami terima. Bukti Pemesanan {{3}} untuk Hak Pakai di {{4}} sudah terbit.

Simpan dokumen ini sebagai bukti Hak Pakai. Dokumen juga selalu tersedia di Akun Saya.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Rina Kusuma` |
| {{2}} | Nomor Pemesanan | `MKM-2026-000123` |
| {{3}} | Bukti Pemesanan number | `BPM/2026/000045` |
| {{4}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Bukti Pemesanan" `https://makam.co.id/dokumen/{{1}}`, sample `https://makam.co.id/dokumen/Zx81LmQa4t`

---

## Tagihan and payments

### 10. `tagihan_terbit`

UTILITY · `id` · family reminder window · Tagihan addressee · ticket 20

**Header:** `Tagihan`

**Body:**
```
Bapak/Ibu {{1}}, tagihan untuk {{2}} telah terbit.

Nomor Tagihan: {{3}}
Jumlah: {{4}}
Batas pembayaran: {{5}}

Pembayaran dapat dilakukan melalui VA atau QRIS. Tautan pembayaran boleh diteruskan kepada anggota keluarga yang akan membayar.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | addressee name | `Hj. Siti Aminah` |
| {{2}} | what the Tagihan is for | `Perpanjangan Makam Petak A-12 di Taman Makam Al-Ikhlas` |
| {{3}} | Nomor Tagihan | `TGH/2026/000311` |
| {{4}} | amount | `Rp 2.750.000` |
| {{5}} | due date and time | `Jumat, 16 Oktober 2026 pukul 14.00 WIB` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Bayar Tagihan" `https://makam.co.id/tagihan/{{1}}`, sample `https://makam.co.id/tagihan/q7Zk2mW9aP`

### 11. `tagihan_pengingat`

UTILITY · `id` · family reminder window · Tagihan addressee · ticket 20

**Header:** `Pengingat Tagihan`

**Body:**
```
Bapak/Ibu {{1}}, tagihan {{2}} untuk {{3}} sebesar {{4}} belum dibayar. Batas pembayaran: {{5}}.

Jika belum dibayar sampai batas tersebut, tagihan ini batal dengan sendirinya. Abaikan pesan ini bila pembayaran sudah dilakukan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | addressee name | `Hj. Siti Aminah` |
| {{2}} | Nomor Tagihan | `TGH/2026/000311` |
| {{3}} | what it is for | `Perpanjangan Makam Petak A-12 di Taman Makam Al-Ikhlas` |
| {{4}} | amount | `Rp 2.750.000` |
| {{5}} | due date and time | `Jumat, 16 Oktober 2026 pukul 14.00 WIB` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Bayar Tagihan" `https://makam.co.id/tagihan/{{1}}`

Used for H-1 and for the due day of every pay-first Tagihan except Terencana (#12) and Paket (#19).

### 12. `terencana_pengingat_bayar`

UTILITY · `id` · family reminder window · Pemesan · ticket 37

**Header:** `Pengingat Tagihan`

**Body:**
```
Bapak/Ibu {{1}}, petak yang kami tahan untuk Anda di {{2}} akan dilepas pada {{3}} jika tagihan {{4}} sebesar {{5}} belum dibayar.

Abaikan pesan ini bila pembayaran sudah dilakukan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Budi Santoso` |
| {{2}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |
| {{3}} | hold expiry | `Rabu, 14 Oktober 2026 pukul 15.30 WIB` |
| {{4}} | Nomor Tagihan | `TGH/2026/000210` |
| {{5}} | amount | `Rp 18.500.000` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Bayar Tagihan" `https://makam.co.id/tagihan/{{1}}`

### 13. `tagihan_lewat_jatuh_tempo`

UTILITY · `id` · family reminder window · Pemesan · ticket 29

**Header:** `Informasi Tagihan`

**Body:**
```
Bapak/Ibu {{1}}, semoga Anda dan keluarga dalam keadaan baik. Tagihan {{2}} untuk pemakaman Almarhum {{3}} sebesar {{4}} belum kami terima. Batas pembayarannya adalah {{5}}.

Jika ada kendala dalam pembayaran, silakan hubungi CS kami. Abaikan pesan ini bila pembayaran sudah dilakukan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Rina Kusuma` |
| {{2}} | Nomor Tagihan | `TGH/2026/000199` |
| {{3}} | Almarhum name | `Ahmad Sudirman` |
| {{4}} | amount | `Rp 9.350.000` |
| {{5}} | the date the Tagihan fell due (recorded burial + window) | `Kamis, 15 Oktober 2026` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Bayar Tagihan" `https://makam.co.id/tagihan/{{1}}`; PHONE_NUMBER "Hubungi CS"

One template covers H+3, H+7, H+14 and H+30. It never threatens and never mentions Tidak Tertagih or ending the Hak Pakai.

### 14. `bukti_pembayaran_terbit`

UTILITY · `id` · any hour · Tagihan addressee · tickets 19, 20, 30

**Body:**
```
Bapak/Ibu {{1}}, pembayaran tagihan {{2}} sebesar {{3}} telah kami terima pada {{4}}. Bukti Pembayaran {{5}} dapat dilihat dan diunduh melalui tautan di bawah.

Terima kasih.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | addressee name | `Rina Kusuma` |
| {{2}} | Nomor Tagihan | `TGH/2026/000199` |
| {{3}} | amount | `Rp 9.350.000` |
| {{4}} | payment time | `Sabtu, 17 Oktober 2026 pukul 09.12 WIB` |
| {{5}} | Bukti Pembayaran number | `BYR/2026/000388` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Bukti Pembayaran" `https://makam.co.id/dokumen/{{1}}`

A Rp 0 Harga Khusus Tagihan sends the same template with {{3}} = `Rp 0`.

### 15. `pengembalian_dana_isi_rekening`

UTILITY · `id` · any hour · the Pemesan who paid · tickets 31, 38

**Header:** `Pengembalian Dana`

**Body:**
```
Bapak/Ibu {{1}}, ada pengembalian dana untuk {{2}} dari tagihan {{3}} sebesar {{4}}.

Agar dana dapat kami transfer, mohon isi rekening bank tujuan melalui tautan di bawah. Transfer dilakukan setelah pengembalian disetujui, dan Bukti Pengembalian Dana akan kami kirimkan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Budi Santoso` |
| {{2}} | reason / subject | `Pembatalan Pemesanan Terencana MKM-2026-000140` |
| {{3}} | Nomor Tagihan | `TGH/2026/000210` |
| {{4}} | refund amount | `Rp 17.000.000` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Isi Rekening" `https://makam.co.id/akun/permohonan/{{1}}`, sample `https://makam.co.id/akun/permohonan/RF8812`

### 16. `bukti_pengembalian_dana_terbit`

UTILITY · `id` · any hour · the Pemesan who paid · ticket 31

**Body:**
```
Bapak/Ibu {{1}}, pengembalian dana sebesar {{2}} untuk tagihan {{3}} telah kami transfer pada {{4}}. Bukti Pengembalian Dana beserta bukti transfernya dapat dilihat melalui tautan di bawah.

Terima kasih atas kesabaran Anda.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Budi Santoso` |
| {{2}} | amount | `Rp 17.000.000` |
| {{3}} | Nomor Tagihan | `TGH/2026/000210` |
| {{4}} | transfer date | `Senin, 19 Oktober 2026` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Bukti" `https://makam.co.id/dokumen/{{1}}`

---

## Paket Layanan

### 17. `paket_tagihan_siklus`

UTILITY · `id` · family reminder window · Pemesan (the account that ordered the Paket) · ticket 54

**Header:** `Tagihan Paket Layanan`

**Body:**
```
Bapak/Ibu {{1}}, tagihan Paket Layanan {{2}} untuk {{3}} periode {{4}} telah terbit.

Jumlah: {{5}}
Batas pembayaran: {{6}}

Pekerjaan periode ini dijadwalkan setelah tagihan dibayar. Jika belum dibayar sampai batas tersebut, periode ini dilewati dan tidak ditagihkan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Rina Kusuma` |
| {{2}} | Paket name | `Perawatan Bulanan` |
| {{3}} | label_makam | `makam Almarhum Ahmad Sudirman, Petak A-12` |
| {{4}} | cycle | `November 2026` |
| {{5}} | amount | `Rp 450.000` |
| {{6}} | due date (H-1) | `Sabtu, 31 Oktober 2026 pukul 23.59 WIB` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Bayar Tagihan" `https://makam.co.id/tagihan/{{1}}`

### 18. `paket_tagihan_siklus_tarif_baru`

UTILITY · `id` · family reminder window · Pemesan · ticket 54

**Header:** `Tagihan Paket Layanan`

**Body:**
```
Bapak/Ibu {{1}}, tagihan Paket Layanan {{2}} untuk {{3}} periode {{4}} telah terbit.

Jumlah: {{5}}
Batas pembayaran: {{6}}

Harga periode ini mengikuti tarif baru yang berlaku sejak {{7}}. Pekerjaan periode ini dijadwalkan setelah tagihan dibayar. Jika belum dibayar sampai batas tersebut, periode ini dilewati dan tidak ditagihkan.
```

Variables {{1}}–{{6}} are as in #17. {{7}} is the tariff effective date, sample `1 Oktober 2026`.

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Bayar Tagihan" `https://makam.co.id/tagihan/{{1}}`

Meta has no optional text, so the "the H-7 message says so" rule needs a second template.

### 19. `paket_pengingat_bayar`

UTILITY · `id` · family reminder window · Pemesan · ticket 54

**Header:** `Pengingat Tagihan`

**Body:**
```
Bapak/Ibu {{1}}, tagihan Paket Layanan {{2}} periode {{3}} sebesar {{4}} belum dibayar. Batas pembayaran: {{5}}.

Jika belum dibayar, pekerjaan periode ini tidak dijadwalkan dan periode dilewati tanpa biaya. Abaikan pesan ini bila pembayaran sudah dilakukan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Rina Kusuma` |
| {{2}} | Paket name | `Perawatan Bulanan` |
| {{3}} | cycle | `November 2026` |
| {{4}} | amount | `Rp 450.000` |
| {{5}} | due date | `hari ini, Sabtu, 31 Oktober 2026 pukul 23.59 WIB` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Bayar Tagihan" `https://makam.co.id/tagihan/{{1}}`

---

## Hak Pakai, Perpanjangan and requests

### 20. `hak_pakai_akan_berakhir`

UTILITY · `id` · family reminder window · Pemegang Hak · ticket 42

**Header:** `Masa Berlaku Hak Pakai`

**Body:**
```
Bapak/Ibu {{1}}, masa berlaku Hak Pakai atas nama Anda untuk {{2}} di {{3}} akan berakhir pada {{4}}.

Perpanjangan Makam dapat diajukan dari halaman makam di Akun Saya. Masa berlaku baru dihitung dari tanggal berakhir tersebut, bukan dari tanggal pembayaran.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemegang Hak name | `Hj. Siti Aminah` |
| {{2}} | unit | `Petak A-12` |
| {{3}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |
| {{4}} | end date | `Kamis, 10 Desember 2026` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Makam" `https://makam.co.id/akun/makam/{{1}}`, sample `https://makam.co.id/akun/makam/HP20931`

### 21. `hak_pakai_masa_tenggang`

UTILITY · `id` · family reminder window · Pemegang Hak · ticket 42

**Header:** `Masa Berlaku Hak Pakai`

**Body:**
```
Bapak/Ibu {{1}}, masa berlaku Hak Pakai atas nama Anda untuk {{2}} di {{3}} telah berakhir pada {{4}}. Perpanjangan Makam masih dapat diajukan dalam Masa Tenggang sampai {{5}}.

Setelah Masa Tenggang berakhir, pengelola makam dapat mengakhiri Hak Pakai ini. Rinciannya ada di halaman makam.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemegang Hak name | `Hj. Siti Aminah` |
| {{2}} | unit | `Petak A-12` |
| {{3}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |
| {{4}} | end date | `Kamis, 10 Desember 2026` |
| {{5}} | end of Masa Tenggang | `Rabu, 10 Maret 2027` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Makam" `https://makam.co.id/akun/makam/{{1}}`

### 22. `perpanjangan_disetujui` (implied)

UTILITY · `id` · any hour · applicant · ticket 41

**Body:**
```
Bapak/Ibu {{1}}, dokumen permohonan Perpanjangan Makam untuk {{2}} di {{3}} telah diperiksa dan disetujui.

Silakan pilih jangka waktu Perpanjangan dan lanjutkan ke pembayaran melalui tautan di bawah. Persetujuan ini berlaku selama 30 hari.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | applicant name | `Dedi Pratama` |
| {{2}} | unit | `Kavling K-03` |
| {{3}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lanjutkan Perpanjangan" `https://makam.co.id/akun/permohonan/{{1}}`

### 23. `permintaan_perlu_perbaikan`

UTILITY · `id` · any hour · requester · tickets 38, 39, 41, 47, 48

**Header:** `Dokumen Perlu Diperbaiki`

**Body:**
```
Bapak/Ibu {{1}}, permohonan {{2}} untuk {{3}} memerlukan perbaikan dokumen. Catatan dari petugas: {{4}}.

Silakan perbaiki atau unggah ulang dokumen melalui tautan di bawah. Permohonan akan diperiksa kembali setelah dokumen diperbarui, tanpa biaya tambahan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | requester name | `Dedi Pratama` |
| {{2}} | request kind: Perpanjangan Makam, Pembatalan, Pengembalian Hak Pakai, Ganti Pemegang Hak, Perpanjangan IPTM, Pengurusan IPTM | `Perpanjangan IPTM` |
| {{3}} | subject | `makam Almarhum Ahmad Sudirman di TPU Karet Bivak` |
| {{4}} | staff note (one line, max 200 chars) | `foto KTP kurang jelas, mohon unggah ulang` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Perbaiki Dokumen" `https://makam.co.id/akun/permohonan/{{1}}`

"Tanpa biaya tambahan" holds for every kind listed. None of these requests is billed in the Perlu Perbaikan state, and a PTSP refile is free (§8).

### 24. `permintaan_disetujui` (implied)

UTILITY · `id` · any hour · requester · ticket 39

**Body:**
```
Bapak/Ibu {{1}}, permohonan {{2}} untuk {{3}} telah disetujui.

Rincian dan status terbaru dapat dilihat di halaman permohonan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | requester name | `Hj. Siti Aminah` |
| {{2}} | request kind (Pengembalian Hak Pakai, Ganti Pemegang Hak) | `Ganti Pemegang Hak` |
| {{3}} | subject | `Petak A-12 di Taman Makam Al-Ikhlas` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Permohonan" `https://makam.co.id/akun/permohonan/{{1}}`

This body is short. With 3 variables it has 15 static words, above the ratio threshold. If Meta calls it too generic, add a sentence per kind or split it into two templates.

### 25. `permintaan_ditolak` (implied except PTSP)

UTILITY · `id` · any hour · requester · tickets 41, 47, 48

**Body:**
```
Bapak/Ibu {{1}}, mohon maaf, permohonan {{2}} untuk {{3}} tidak dapat disetujui. Alasan: {{4}}.

Jika ada biaya yang sudah dibayar, pengembalian dananya akan kami proses. Untuk pertanyaan, silakan hubungi CS kami.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | requester name | `Dedi Pratama` |
| {{2}} | request kind | `Pengurusan IPTM` |
| {{3}} | subject | `makam Almarhum Ahmad Sudirman di TPU Karet Bivak` |
| {{4}} | reason (one line, max 200 chars) | `PTSP menolak pengajuan karena data makam tidak ditemukan` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Permohonan" `https://makam.co.id/akun/permohonan/{{1}}`; PHONE_NUMBER "Hubungi CS"

### 26. `bukti_perpanjangan_terbit`

UTILITY · `id` · any hour · Pemegang Hak · ticket 40

**Body:**
```
Bapak/Ibu {{1}}, Perpanjangan Makam untuk {{2}} di {{3}} telah dibayar. Masa berlaku Hak Pakai kini sampai {{4}}.

Bukti Perpanjangan dapat dilihat dan diunduh melalui tautan di bawah.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemegang Hak name | `Hj. Siti Aminah` |
| {{2}} | unit | `Petak A-12` |
| {{3}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |
| {{4}} | new end date | `Minggu, 10 Desember 2028` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Bukti Perpanjangan" `https://makam.co.id/dokumen/{{1}}`

### 27. `lokasi_berhenti_pemberitahuan`

UTILITY · `id` · family reminder window · Pemegang Hak and Paket subscribers of the Lokasi · ticket 59

**Header:** `Pemberitahuan Lokasi Makam`

**Body:**
```
Bapak/Ibu {{1}}, kami memberitahukan bahwa kerja sama Makam.co.id dengan {{2}} berakhir mulai {{3}}.

Hak Pakai Anda tetap tercatat dan dokumennya tetap dapat diunduh di Akun Saya. Paket Layanan di lokasi ini tidak lagi ditagihkan, dan pekerjaan yang belum selesai sampai tanggal tersebut dibatalkan dengan pengembalian dana penuh. Untuk urusan makam selanjutnya, silakan hubungi pengelola makam secara langsung.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | recipient name | `Hj. Siti Aminah` |
| {{2}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |
| {{3}} | Berhenti effective date | `Senin, 30 November 2026` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Makam" `https://makam.co.id/akun/makam/{{1}}`

---

## TPU

### 28. `iptm_terbit`

UTILITY · `id` · any hour · Pemesan and Pemegang Hak · tickets 46, 47, 48

**Header:** `IPTM Telah Terbit`

**Body:**
```
Bapak/Ibu {{1}}, IPTM untuk makam Almarhum {{2}} di {{3}} telah terbit dan berlaku sampai {{4}}.

Salinan IPTM tersimpan di Akun Saya dan dapat dilihat melalui tautan di bawah.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | recipient name | `Rina Kusuma` |
| {{2}} | Almarhum name | `Ahmad Sudirman` |
| {{3}} | TPU + blok/nomor | `TPU Karet Bivak, Blok AA1 No. 123` |
| {{4}} | IPTM expiry | `12 Oktober 2029` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat IPTM" `https://makam.co.id/dokumen/{{1}}`

This goes out whatever the Tagihan status. It never mentions payment.

### 29. `iptm_akan_berakhir`

UTILITY · `id` · family reminder window · Pemegang Hak of the Makam TPU · ticket 48

**Header:** `Masa Berlaku IPTM`

**Body:**
```
Bapak/Ibu {{1}}, IPTM makam Almarhum {{2}} di {{3}} akan berakhir pada {{4}}.

IPTM perlu diperpanjang agar makam tetap tercatat atas nama keluarga. Perpanjangan dapat Anda ajukan sendiri ke PTSP tanpa biaya, atau kami bantu uruskan. Rinciannya ada di halaman makam.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemegang Hak name | `Rina Kusuma` |
| {{2}} | Almarhum name | `Ahmad Sudirman` |
| {{3}} | TPU + blok/nomor | `TPU Karet Bivak, Blok AA1 No. 123` |
| {{4}} | IPTM expiry | `12 Oktober 2029` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Makam" `https://makam.co.id/akun/makam/{{1}}`

The line about filing for free yourself follows the Cara Kami Bekerja claim ("the TPU permit is free, families may file it themselves"). It also keeps the message factual rather than a sales pitch.

---

## Layanan

### 30. `layanan_selesai`

UTILITY · `id` · any hour · Pemesan · tickets 50, 57

**Header:** `Layanan Selesai`

**Body:**
```
Bapak/Ibu {{1}}, pekerjaan {{2}} untuk {{3}} telah selesai pada {{4}}. Foto bukti pengerjaan dapat dilihat melalui tautan di bawah.

Jika hasilnya kurang sesuai, Anda dapat menyampaikan Keluhan dalam 3×24 jam sejak foto bukti ditampilkan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Rina Kusuma` |
| {{2}} | Layanan (+ variant) | `Pembersihan Makam` |
| {{3}} | label_makam | `makam Almarhum Ahmad Sudirman di TPU Karet Bivak` |
| {{4}} | completion date | `Sabtu, 7 November 2026` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Foto Bukti" `https://makam.co.id/akun/layanan/{{1}}`, sample `https://makam.co.id/akun/layanan/PL55120`

There is deliberately no Penilaian request. It is optional, lives on the page, and would make Meta more likely to treat the message as a feedback survey.

### 31. `layanan_pesan_baru`

UTILITY · `id` · any hour · Pemesan · ticket 52

**Body:**
```
Bapak/Ibu {{1}}, ada pesan baru dari {{2}} tentang pekerjaan {{3}} untuk {{4}}.

Isi pesan hanya dapat dibaca di aplikasi. Silakan buka tautan di bawah untuk membaca dan membalas.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Rina Kusuma` |
| {{2}} | sender: the Mitra Jasa's first name, "Admin Lokasi <Lokasi>" or "Tim Makam.co.id" | `Joko (Mitra Jasa)` |
| {{3}} | Layanan | `Pemasangan Batu Nisan` |
| {{4}} | label_makam | `makam Almarhum Ahmad Sudirman di TPU Karet Bivak` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Baca dan Balas" `https://makam.co.id/akun/layanan/{{1}}`

No message text or photo passes through WhatsApp (issue 19 Content).

### 32. `layanan_jadwal_berubah`

UTILITY · `id` · any hour · Pemesan · ticket 55

**Body:**
```
Bapak/Ibu {{1}}, jadwal pekerjaan {{2}} untuk {{3}} berubah. Tanggal pengerjaan yang baru adalah {{4}}.

Mohon maaf atas perubahan ini. Rinciannya ada di halaman pesanan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Pemesan name | `Rina Kusuma` |
| {{2}} | Layanan | `Pembersihan Makam` |
| {{3}} | label_makam | `makam Almarhum Ahmad Sudirman di TPU Karet Bivak` |
| {{4}} | new target date | `Selasa, 10 November 2026` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Pesanan" `https://makam.co.id/akun/layanan/{{1}}`

---

## Wakaf Tanah

### 33. `wakaf_status_berubah`

UTILITY · `id` · any hour · Wakif · ticket 58

**Header:** `Pengajuan Wakaf`

**Body:**
```
Bapak/Ibu {{1}}, status Pengajuan Wakaf Anda untuk tanah di {{2}} kini adalah {{3}}.

Catatan dari tim kami dan langkah berikutnya dapat dilihat di Akun Saya pada tab Wakaf.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Wakif name | `H. Mulyadi` |
| {{2}} | land kab/kota | `Kabupaten Bogor` |
| {{3}} | new status (Ditinjau, Survei Dijadwalkan, Menunggu Ikrar, Proses Sertipikat, Selesai, Ditolak, Dirujuk, Dibatalkan) | `Survei Dijadwalkan` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Pengajuan" `https://makam.co.id/akun/wakaf/{{1}}`

No money, land value or donation wording, in keeping with §12 "No money of any kind".

---

## Staff and partner alerts

All go out at any hour and also as web push (ticket 21). A failed staff alert is not escalated beyond web push and the queue.

### 34. `staf_saat_duka_baru`

UTILITY · `id` · every Admin Lokasi of the Lokasi and the Kontak Siaga · ticket 23

**Header:** `Pesanan Saat Duka Baru`

**Body:**
```
Pesanan Saat Duka baru masuk di {{1}}.

Nomor Pemesanan: {{2}}
Jenis Makam: {{3}}
Rencana pemakaman: {{4}}
Batas konfirmasi: {{5}}
Kontak Siaga saat ini: {{6}}

Buka Antrean Lokasi untuk menetapkan Petak Makam, menawarkan alternatif, atau menolak pesanan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |
| {{2}} | Nomor Pemesanan | `MKM-2026-000123` |
| {{3}} | Jenis Makam | `Standar` |
| {{4}} | planned burial, or "belum ditentukan" | `Senin, 12 Oktober 2026 pukul 14.00 WIB` |
| {{5}} | confirmation deadline | `Senin, 12 Oktober 2026 pukul 10.30 WIB` |
| {{6}} | Kontak Siaga name | `Pak Hasan` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Buka Pesanan" `https://makam.co.id/staf/{{1}}`, sample `https://makam.co.id/staf/pesanan/MKM-2026-000123`

### 35. `staf_saat_duka_belum_dikonfirmasi`

UTILITY · `id` · same recipients as #34 · ticket 23

**Header:** `Menunggu Konfirmasi`

**Body:**
```
Pesanan Saat Duka {{1}} di {{2}} belum dikonfirmasi setelah 1 jam Jam Operasional. Batas konfirmasi: {{3}}.

Keluarga sedang menunggu kabar. Mohon tetapkan Petak Makam, tawarkan alternatif, atau tolak pesanan dengan alasan.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Nomor Pemesanan | `MKM-2026-000123` |
| {{2}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |
| {{3}} | confirmation deadline | `Senin, 12 Oktober 2026 pukul 10.30 WIB` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Buka Pesanan" `https://makam.co.id/staf/{{1}}`

### 36. `staf_antrean_mendesak`

UTILITY · `id` · Admin Platform who are Bertugas (all if none) · tickets 28, 45

**Header:** `Antrean Tier 1`

**Body:**
```
Ada baris Tier 1 baru di Antrean: {{1}}.

Subjek: {{2}}
Batas waktu: {{3}}

Buka Antrean dan Ambil baris ini bila Anda menanganinya.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | row type: Konfirmasi TPU Saat Duka, Konfirmasi Lokasi terlambat, Saat Duka ditolak, Keluhan, Pekerjaan hari ini tanpa Mitra Jasa | `Konfirmasi TPU Saat Duka` |
| {{2}} | subject | `MKM-2026-000124, TPU Karet Bivak` |
| {{3}} | row deadline | `Senin, 12 Oktober 2026 pukul 08.00 WIB` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Buka Antrean" `https://makam.co.id/staf/{{1}}`, sample `https://makam.co.id/staf/antrean/r-8812`

Night TPU rows send this template at 06:00 (ticket 28).

### 37. `staf_antrean_eskalasi`

UTILITY · `id` · every Admin Platform · ticket 28

**Header:** `Eskalasi Antrean`

**Body:**
```
Baris Tier 1 {{1}} untuk {{2}} masih terbuka sejak {{3}}.

Pesan ini dikirim ke semua Admin Platform. Mohon periksa Antrean dan pastikan ada yang menangani.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | row type | `Konfirmasi TPU Saat Duka` |
| {{2}} | subject | `MKM-2026-000124, TPU Karet Bivak` |
| {{3}} | row created at | `pukul 06.00 WIB` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Buka Antrean" `https://makam.co.id/staf/{{1}}`

This template covers both the 30-minute "not taken" alert and the 90-minute "still unconfirmed" alert.

### 38. `staf_tugas_lapangan_baru`

UTILITY · `id` · Petugas Lapangan · ticket 15

**Header:** `Tugas Lapangan Baru`

**Body:**
```
Ada Tugas Lapangan baru untuk Anda: {{1}}.

Tempat: {{2}}
Tanggal rencana: {{3}}

Buka Tugas saya untuk melihat alamat, pin lokasi, dan formulir tugas.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | type: Ambil surat pengantar, Berkas IPTM, Kunjungan Verifikasi, Survei Wakaf, Cek Denah, Setor Retribusi | `Ambil surat pengantar` |
| {{2}} | place name | `TPU Karet Bivak` |
| {{3}} | planned date | `Selasa, 13 Oktober 2026` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Buka Tugas" `https://makam.co.id/staf/{{1}}`

### 39. `mitra_jasa_pekerjaan_baru`

UTILITY · `id` · Mitra Jasa · ticket 56

**Header:** `Pekerjaan Baru`

**Body:**
```
Ada pekerjaan baru untuk Anda: {{1}} di {{2}}.

Tanggal target: {{3}}
Mohon terima atau tolak di aplikasi sebelum {{4}}. Jika belum ada jawaban sampai batas itu, pekerjaan dianggap ditolak.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | Layanan | `Pembersihan Makam` |
| {{2}} | TPU | `TPU Karet Bivak` |
| {{3}} | target date | `Sabtu, 7 November 2026` |
| {{4}} | accept deadline | `Jumat, 6 November 2026 pukul 18.00 WIB` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Pekerjaan" `https://makam.co.id/staf/{{1}}`

This alert carries no family contact details (§9 Mitra Jasa).

### 40. `staf_hak_pakai_berakhir`

UTILITY · `id` · Admin Lokasi of the Lokasi, 08:00–20:00 · ticket 42

**Header:** `Masa Berlaku Hak Pakai`

**Body:**
```
Hak Pakai untuk {{1}} di {{2}} berakhir pada {{3}}. Pemegang Hak juga menerima pengingat ini.

Jika tanggal tersebut sudah lewat, Hak Pakai ini sedang dalam Masa Tenggang. Rinciannya ada di Antrean Lokasi.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | unit | `Petak A-12` |
| {{2}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |
| {{3}} | end date | `Kamis, 10 Desember 2026` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Buka Hak Pakai" `https://makam.co.id/staf/{{1}}`

### 41. `staf_calon_penghuni_diubah`

UTILITY · `id` · Admin Lokasi of the Lokasi · ticket 39

**Body:**
```
Label Calon Penghuni pada Hak Pakai untuk {{1}} di {{2}} telah diubah oleh Pemegang Hak.

Perubahan ini tidak memerlukan pemeriksaan. Rinciannya dapat dilihat di halaman Hak Pakai.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | unit | `Petak B-07` |
| {{2}} | Lokasi Mitra name | `Taman Makam Al-Ikhlas` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Buka Hak Pakai" `https://makam.co.id/staf/{{1}}`

### 42. `pencairan_terkirim`

UTILITY · `id` · Lokasi Mitra (its Admin Lokasi) or Mitra Jasa · ticket 32

**Header:** `Pencairan Ditransfer`

**Body:**
```
Pencairan untuk {{1}} sebesar {{2}} telah ditransfer pada {{3}}.

Bukti Pencairan {{4}} berisi rincian setiap pesanan atau pekerjaan yang tercakup. Silakan buka tautan di bawah untuk melihatnya.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | recipient (Lokasi Mitra or Mitra Jasa name) | `Taman Makam Al-Ikhlas` |
| {{2}} | net amount | `Rp 42.300.000` |
| {{3}} | transfer date | `Rabu, 21 Oktober 2026` |
| {{4}} | Bukti Pencairan number | `BKP/2026/000017` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** URL "Lihat Bukti Pencairan" `https://makam.co.id/dokumen/{{1}}`

The body says nothing about Potongan, because a Mitra Jasa never has any. The Lokasi Mitra version of the document lists them.

---

### 43. `staf_undangan`

UTILITY · `id` · the invited number · ticket 09 (added 2026-09-25; sent today by the identity module through WhatsAppSender, to move behind Notifications in ticket 20)

**Header:** `Undangan Staf`

**Body:**
```
Anda diundang sebagai {{1}} di Makam.co.id.

Masuk dalam 7 hari dengan nomor WhatsApp ini lewat {{2}}. Peran Anda aktif setelah Anda memasukkan kode verifikasi.

Bila Anda tidak mengenal undangan ini, abaikan pesan ini.
```

| Var | Meaning | Sample |
|---|---|---|
| {{1}} | role: Admin Platform, Admin Lokasi, Petugas Lapangan, Mitra Jasa | `Admin Lokasi` |
| {{2}} | the Masuk page of the environment that sent it (staging and production differ, so it is a body variable, not a static button) | `https://makam.co.id/masuk` |

**Footer:** `Makam.co.id · Pesan otomatis`
**Buttons:** none

## Meta approval risks

**How Meta classifies (checked 2026-09-25).** A utility template must be non-promotional **and** specific to the user's order, account or transaction (or critical to safety). Mixed content is classified as marketing, for example an order update carrying a promo or a feedback request carrying promotional content. Meta can move an approved utility template to marketing with one day's notice, and with no notice for a WABA flagged for abuse. It also rejects submissions with `INCORRECT_CATEGORY`. A category change can be appealed within 60 days. An authentication template must use Meta's preset body with a copy-code or one-tap button, and no URLs, media or emoji.

**Most likely to be reclassified as marketing**

1. **`hak_pakai_akan_berakhir`, `hak_pakai_masa_tenggang`, `iptm_akan_berakhir`.** Meta's account-update guidance forbids "renewal attempts". An expiry notice that pushes a paid Perpanjangan is the closest thing here to that. Mitigations in the drafts:
   - Each message states a fact about the recipient's own right: which grave, and the exact date it ends.
   - No price, discount or urgency words.
   - The button says "Lihat Makam", not "Perpanjang Sekarang".
   - Hak Pakai: the Perpanjangan line explains the rule (the new term counts from the end date) instead of selling it.
   - IPTM: the message says the family can file for free themselves.

   If Meta still reclassifies one, drop the Perpanjangan sentence and keep only the date and the consequence. Do not accept marketing, which the spec forbids.
2. **`saat_duka_ditolak`.** "Pilihan makam lain di kota Anda" could read as cross-selling. It stays specific: it names the declined order and the Almarhum, and the link continues that same order with its data carried over. No other price or offer is named.
3. **`paket_tagihan_siklus` / `paket_tagihan_siklus_tarif_baru`.** Recurring-billing notices are among Meta's own utility examples ("Your monthly payment for {{service}} will be billed on…"). The tariff-change line states the new price date only, so it avoids upsell wording such as "upgrade" or "lebih hemat".
4. **`layanan_selesai`.** A Penilaian request would turn this into a feedback survey, so it is left out. The Keluhan line is a service right tied to that job.
5. **`lokasi_berhenti_pemberitahuan`.** Keep it free of suggestions to move to another Lokasi. Any "pindah ke lokasi lain" wording would count as promotion.

**Other rejection risks and how the drafts avoid them**
- **Generic content.** The templates most exposed are those whose meaning sits mostly in a variable: `permintaan_disetujui`, `wakaf_status_berubah` and `staf_antrean_mendesak`. Each keeps a named subject (grave, land, row type) plus a static explanatory sentence. If one is rejected, split it by kind.
- **Leading, trailing or adjacent variables.** No body starts or ends with a variable. One pair is separated only by ", ": `persetujuan_pemakaman` {{4}}, {{5}}. Its fallback is noted in that template.
- **Samples.** Every variable has a realistic sample, and URL samples are full URLs on makam.co.id. No sample contains `#`, `$`, `%` or line breaks.
- **URLs.** All are on the Operator's own domain, with no shorteners and no link in the body text.
- **Authentication.** Use Meta's preset exactly, with only the security line, the expiry footer and the copy-code button. Do not add a header or custom text, or it will be rejected.
- **Tone and brand.** No emoji or capitals-for-emphasis. The display name, footer and body all say "Makam.co.id", which must match the verified business profile of PT Jaya Korpora Prima (ticket 05).
- **Quality rating.** Condolences appear only in the two first confirmation messages. Reminders stop the moment the Tagihan is Lunas, Dibatalkan or Tidak Tertagih. This limits blocks and reports, which would lower the number's quality rating and messaging limit.

---

## Rules not mapped or ambiguous

1. **OTP has no second channel.** With WhatsApp as the only OTP channel, a WhatsApp outage blocks every login. The earlier fallback decision in ADR 0003 and the spec and tickets that describe it need updating.
2. **OTP expiry** is not chosen (ticket 08). `code_expiration_minutes: 10` is a placeholder.
3. **Two messages at one event.**
   - Saat Duka and Terencana confirmation also issue the Tagihan, and "Tagihan: when sent" would add a second message. The drafts put the Tagihan link in #2, #3 and #7 and assume `tagihan_terbit` is suppressed for those events.
   - On Lunas, `bukti_pembayaran_terbit` and `bukti_pemesanan_terbit` (or `bukti_perpanjangan_terbit`) both go out. The spec wants both documents sent, so they stay two messages.
4. **Reminder window against deadlines.**
   - A Terencana hold expiring at night puts its "~4 h before" reminder outside 08:00–20:00. Deferring it to 08:00 could land after expiry, so it should be sent earlier instead.
   - `tagihan_terbit` is both "on issue" (a reminder, in the window) and a Tagihan being sent (transactional). Ticket 20 should choose. The table marks it Rem.
5. **Messages the spec implies but never states (marked implied).** `pesanan_alternatif` (story 31 describes the one-tap choice but no message); `pesanan_ditolak` for Terencana and for a further burial refused by the Pemegang Hak; `perpanjangan_disetujui`, `permintaan_disetujui` and `permintaan_ditolak` (the spec gives the request statuses and the Perlu tindakan strip only). `permintaan_perlu_perbaikan` rests on story 80 ("get Perlu Perbaikan") and the PTSP "reason shown". Drop any of these if Perlu tindakan alone is enough.
6. **No message rule, so no template:**
   - submission of any order (the Nomor Pemesanan is on screen only);
   - order cancelled, or Terencana lapsed "batas pembayaran lewat";
   - Paket paused after two skips;
   - Mitra Jasa proof rejected;
   - Terlambat "flagged to the fulfiller" (a row or a message?);
   - the "Ganti Pemegang Hak reminder" raised by heirship proof (to whom, and by which channel?);
   - reminders for missing filing documents within 7 days;
   - staff invites;
   - new Terencana, Perpanjangan-review or request rows for the Admin Lokasi (only Saat Duka alerts);
   - thread messages from the Pemesan to the fulfiller (only the Pemesan is notified).
7. **Declined alternative against Tolak.** A Pemesan who declines an alternative turns the order into a Tolak. Should they then receive `saat_duka_ditolak` ("tidak dapat menerima") and a call? Also, the Saat Duka TPU statuses have no Ditolak, so it is unclear what happens when the family declines another TPU.
8. **Pencairan notice recipient for a Lokasi Mitra.** Every Admin Lokasi, or one named contact? The same question applies to per-Hak-Pakai expiry messages to the Admin Lokasi, which could get costly at a large Lokasi. A digest would need a spec decision.
9. **Bukti Pemesanan recipient.** The Pemesan only, or also the Pemegang Hak when the two differ? The drafts send it to the Pemesan.
10. **Routes.** The URL bases are proposals. Ticket 20 must fix them before submission, because changing a URL button later means re-approval.

## Sources

- [Authentication templates (Meta)](https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates)
- [Template categorization (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization) and [category guidelines](https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines)
- [Template components and limits (Meta)](https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/components)
- [Template fundamentals (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)
- Variable placement and ratio rules as enforced in review: [BusinessChat on dangling parameters](https://help.businesschat.io/en/articles/12302864-fixing-whatsapp-template-rejections-caused-by-dangling-parameters), [Syniverse on parameter ratio](https://sdcsupport.syniverse.com/hc/en-us/articles/30569685832471-How-to-avoid-too-many-parameters-rejection-in-WhatsApp-Templates), [AWS End User Messaging rejection reasons](https://docs.aws.amazon.com/social-messaging/latest/userguide/managing-templates_rejection.html)

# Layanan Kedukaan dan Konsultasi Rencana Pemakaman

Status: ready-for-agent
Decision: ADR 0010 (`docs/adr/0010-layanan-kedukaan-dan-konsultasi.md`). Terms: `CONTEXT.md` (Layanan Kedukaan, Konsultasi Rencana Pemakaman, Permintaan Kedukaan). Owner's menu (dri, 2026-11-02): Jasa Pemakaman (Pesan Sekarang; Konsultasi Rencana Pemakaman), Layanan Kedukaan (Rumah Duka, Mobil Jenazah, Jasa Cargo Jenazah, Jasa Repatriasi Jenazah, Peti Jenazah, Bunga Duka Cita), Program Wakaf Tanah Pemakaman, Daftar Lokasi.

## Problem

A family that has just lost someone needs more than a grave: a hearse, a funeral home, a coffin, flowers, and sometimes moving the body to another city or bringing it home from abroad. A family planning ahead wants to talk to someone before booking. Makam offers neither, so families go elsewhere in the hours that matter most.

## Solution

Each Layanan Kedukaan and the Konsultasi Rencana Pemakaman get a public page (what it is, what to prepare, how it works, a button "Minta layanan ini") and one short request form. Filing needs a Kode Masuk, like a Pengajuan Wakaf. The Permintaan Kedukaan lands in the Antrean by urgency; Admin Platform contacts the family, arranges the service and records the outcome. The family follows it in Akun Saya and gets an email on every change. The site header and footer are organised in the owner's four groups.

## User stories

1. As a visitor, I see the four groups in the header and footer and reach every Layanan Kedukaan page and the Konsultasi page from them.
2. As a family member, I open a Layanan Kedukaan page and read what it covers and what I will be asked, without photos of graves.
3. As a family member, I file a Permintaan Kedukaan for one Layanan Kedukaan with my name, phone, the city, and the facts it needs, and get a Nomor Permintaan and a confirmation email.
4. As a family member, I file a Konsultasi Rencana Pemakaman with my name, phone, city, an optional Lokasi Makam of interest and a preferred time to be called.
5. As a family member, I see my Permintaan Kedukaan and their status in Akun Saya, and can cancel one that is still Diajukan.
6. As Admin Platform, I see each new Permintaan Kedukaan in the Antrean at its tier, open it, and mark it Dihubungi, Selesai, or Dibatalkan with a reason; each change emails the family.

## Rules

- Jenis (closed list): `rumah_duka`, `mobil_jenazah`, `cargo_jenazah`, `repatriasi_jenazah`, `peti_jenazah`, `bunga_duka_cita`, `konsultasi`.
- Fields every Permintaan has: nama, telepon (+62, normalised as elsewhere), kab/kota, catatan (optional, ≤ 1000 chars). Per jenis:
  - mobil_jenazah, cargo_jenazah: asal (kota), tujuan (kota), tanggal dibutuhkan.
  - repatriasi_jenazah: negara asal, kota tujuan, tanggal perkiraan.
  - rumah_duka, peti_jenazah, bunga_duka_cita: tanggal dibutuhkan; bunga also "teks ucapan" (optional, ≤ 200 chars).
  - konsultasi: waktu dihubungi (pagi / siang / sore), Lokasi Makam diminati (optional, free text).
- Status: Diajukan → Dihubungi → Selesai; Diajukan or Dihubungi → Dibatalkan. Dibatalkan by Admin Platform needs a reason; the family may cancel only while Diajukan. Selesai and Dibatalkan are final.
- Antrean: mobil_jenazah, cargo_jenazah, repatriasi_jenazah, rumah_duka are Tier 1 with a 30-minute first-contact deadline; peti_jenazah, bunga_duka_cita Tier 2 with 2 hours; konsultasi Tier 3 with one Hari Kerja. The row closes when the Permintaan leaves Diajukan.
- Nomor Permintaan: `KDK-<year>-<6 digits>`.
- Every Admin Platform status change is a staff write with an Entri Audit.

## Out of scope

Prices and online payment; Lokasi Mitra or vendor accounts fulfilling a Permintaan; tracking the vehicle; repatriation paperwork beyond the first contact.

## Implementation decisions

- New module `src/domain/kedukaan/` owning `kedukaan_permintaan` (and its status history), with a client-safe `skema.ts` (jenis list, Zod form schema) the form may deep-import.
- Server Actions mirror `src/app/(site)/wakaf-tanah/actions.ts` (Kode Masuk at Kirim). Admin Platform pages under `/staf/admin-platform/kedukaan`.
- Messages through Notifications templates; Antrean row types registered in `src/domain/queues/registry.ts`.
- Routes added to `peraturanRute` in `src/lib/rilis-peta.ts`.

## Formulir Pesan Sekarang (dri, 2026-11-02)

The Saat Duka form at a Lokasi Mitra ("Pesan Sekarang") changes with the menu:

- "Data Anda" is "Data Pemesan".
- "Almarhum" is "Data Mendiang" with "Nama mendiang", a required Jenis kelamin (Laki-laki / Perempuan) and an optional Alamat rumah duka (where the body lies now, ≤ 500 chars). Both reach the Admin Lokasi's order page. Orders placed before keep both empty.
- "Layanan hari-H" is "Layanan Tambahan", opt-in: closed until the family ticks "Saya ingin menambah layanan"; nothing is sent while closed.
- A Lokasi Mitra marked **Paket Lengkap** by Admin Platform (Kebijakan) shows no Layanan Tambahan, and `placeSaatDuka` refuses Layanan there (`layanan_tidak_tersedia`).
- Expand-only migration: `pemesanan_makam.almarhum_jenis_kelamin`, `pemesanan_makam.alamat_rumah_duka` (nullable); the flag lives in the Lokasi's `flags` JSON and is absent (off) on older rows.

Ticket: `issues/05-formulir-pesan-sekarang.md`.

## Tickets

`issues/01-permintaan-kedukaan-domain.md`, `issues/02-halaman-dan-formulir.md`, `issues/03-antrean-dan-staf.md`, `issues/04-navigasi-empat-grup.md`.

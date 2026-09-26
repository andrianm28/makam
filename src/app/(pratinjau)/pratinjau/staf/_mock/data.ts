/**
 * PROTOTYPE mock data for the staff UI preview. No database, nothing is saved.
 * Names and numbers are invented.
 */
import type { StatusKey } from "@/components/makam/status-badge";

export type LokasiStatus = "belum_tayang" | "terverifikasi" | "ditangguhkan" | "berhenti";

export interface MockLokasi {
  id: string;
  name: string;
  kota: string;
  pengelola: string;
  status: LokasiStatus;
  jamOperasional: boolean;
  tarifDiperiksa: boolean;
  adminLokasi: number;
  petak: number;
  diubah: string;
}

export const lokasiMitra: MockLokasi[] = [
  { id: "al-ikhlas", name: "Taman Makam Wakaf Al-Ikhlas", kota: "Jakarta Selatan", pengelola: "Yayasan Al-Ikhlas Cilandak", status: "terverifikasi", jamOperasional: true, tarifDiperiksa: true, adminLokasi: 3, petak: 1240, diubah: "24 Sep 2026" },
  { id: "nurul-huda", name: "Pemakaman Masjid Nurul Huda", kota: "Depok", pengelola: "DKM Nurul Huda", status: "terverifikasi", jamOperasional: true, tarifDiperiksa: true, adminLokasi: 2, petak: 610, diubah: "22 Sep 2026" },
  { id: "bukit-teduh", name: "Bukit Teduh Memorial Park", kota: "Bogor", pengelola: "PT Bukit Teduh Lestari", status: "terverifikasi", jamOperasional: true, tarifDiperiksa: true, adminLokasi: 4, petak: 3820, diubah: "21 Sep 2026" },
  { id: "baitul-makmur", name: "Makam Wakaf Baitul Makmur", kota: "Tangerang Selatan", pengelola: "Nazhir Baitul Makmur", status: "belum_tayang", jamOperasional: false, tarifDiperiksa: false, adminLokasi: 1, petak: 0, diubah: "25 Sep 2026" },
  { id: "kenanga", name: "Pemakaman Keluarga Kenanga", kota: "Bekasi", pengelola: "Yayasan Kenanga Sejahtera", status: "ditangguhkan", jamOperasional: true, tarifDiperiksa: true, adminLokasi: 2, petak: 480, diubah: "19 Sep 2026" },
  { id: "al-falah", name: "Taman Pemakaman Al-Falah", kota: "Jakarta Timur", pengelola: "Yayasan Al-Falah", status: "terverifikasi", jamOperasional: true, tarifDiperiksa: true, adminLokasi: 2, petak: 890, diubah: "18 Sep 2026" },
  { id: "sirnaraga", name: "Makam Sirnaraga Indah", kota: "Bogor", pengelola: "PT Sirnaraga Abadi", status: "belum_tayang", jamOperasional: true, tarifDiperiksa: false, adminLokasi: 1, petak: 120, diubah: "17 Sep 2026" },
  { id: "darussalam", name: "Pemakaman Wakaf Darussalam", kota: "Depok", pengelola: "Nazhir Darussalam", status: "terverifikasi", jamOperasional: false, tarifDiperiksa: true, adminLokasi: 1, petak: 340, diubah: "15 Sep 2026" },
  { id: "melati", name: "Taman Makam Melati Putih", kota: "Tangerang", pengelola: "Yayasan Melati Putih", status: "berhenti", jamOperasional: true, tarifDiperiksa: true, adminLokasi: 0, petak: 720, diubah: "2 Sep 2026" },
  { id: "at-taqwa", name: "Makam Masjid At-Taqwa", kota: "Jakarta Barat", pengelola: "DKM At-Taqwa", status: "terverifikasi", jamOperasional: true, tarifDiperiksa: true, adminLokasi: 2, petak: 260, diubah: "30 Agu 2026" },
  { id: "pondok-rangon", name: "Taman Wakaf Pondok Rangon", kota: "Jakarta Timur", pengelola: "Yayasan Rangon Mulia", status: "terverifikasi", jamOperasional: true, tarifDiperiksa: true, adminLokasi: 3, petak: 1530, diubah: "28 Agu 2026" },
  { id: "cibubur", name: "Cibubur Garden Memorial", kota: "Bekasi", pengelola: "PT Garden Memorial", status: "terverifikasi", jamOperasional: true, tarifDiperiksa: true, adminLokasi: 2, petak: 2100, diubah: "20 Agu 2026" },
  { id: "al-hidayah", name: "Pemakaman Al-Hidayah", kota: "Tangerang Selatan", pengelola: "Yayasan Al-Hidayah", status: "belum_tayang", jamOperasional: false, tarifDiperiksa: false, adminLokasi: 0, petak: 0, diubah: "26 Sep 2026" },
  { id: "rawa-kopi", name: "Makam Wakaf Rawa Kopi", kota: "Jakarta Selatan", pengelola: "Nazhir Rawa Kopi", status: "terverifikasi", jamOperasional: true, tarifDiperiksa: true, adminLokasi: 1, petak: 300, diubah: "12 Agu 2026" },
];

export const lokasiById = (id: string) => lokasiMitra.find((item) => item.id === id);

export interface AntreanRow {
  id: string;
  title: string;
  subject: string;
  lokasi: string;
  /** Minutes left until the row's deadline; negative when past. */
  sisaMenit: number;
  /** The row's full window in minutes, for the deadline bar. */
  jendelaMenit: number;
  diambil?: string;
}

export const antrean: AntreanRow[] = [
  { id: "a1", title: "Konfirmasi Pemesanan Saat Duka belum dijawab Admin Lokasi", subject: "MKM-2026-000418", lokasi: "Bukit Teduh Memorial Park", sisaMenit: -12, jendelaMenit: 60 },
  { id: "a2", title: "Telepon Pemesan: Tagihan Saat Duka lewat jatuh tempo", subject: "MKM-2026-000391", lokasi: "Pemakaman Masjid Nurul Huda", sisaMenit: 35, jendelaMenit: 240, diambil: "Rina" },
  { id: "a3", title: "Periksa Surat Kuasa untuk Pengurusan IPTM", subject: "MKM-2026-000402", lokasi: "TPU Karet Bivak", sisaMenit: 95, jendelaMenit: 480 },
  { id: "a4", title: "Setujui pengembalian dana Pembatalan", subject: "MKM-2026-000377", lokasi: "Taman Makam Wakaf Al-Ikhlas", sisaMenit: 260, jendelaMenit: 480 },
  { id: "a5", title: "Tarif belum diperiksa sebelum tayang", subject: "Belum Tayang sejak 17 Sep", lokasi: "Makam Sirnaraga Indah", sisaMenit: 1900, jendelaMenit: 4320 },
  { id: "a6", title: "Keluhan Pemesan atas Pekerjaan Layanan", subject: "Tabur bunga, Blok C-14", lokasi: "TPU Tanah Kusir", sisaMenit: 2600, jendelaMenit: 4320, diambil: "Dimas" },
];

export interface PekerjaanRow {
  id: string;
  layanan: string;
  tempat: string;
  nomorMakam: string;
  tanggal: string;
  status: StatusKey;
  catatan?: string;
}

export const pekerjaanMitraJasa: PekerjaanRow[] = [
  { id: "p1", layanan: "Bersihkan makam", tempat: "TPU Karet Bivak", nomorMakam: "Blok AA1, No. 142", tanggal: "Terlambat 2 hari", status: "terlambat", catatan: "Unggah foto sebelum dan sesudah" },
  { id: "p2", layanan: "Tabur bunga", tempat: "TPU Tanah Kusir", nomorMakam: "Blok C, No. 14", tanggal: "Hari ini, sebelum 16.00", status: "dikonfirmasi" },
  { id: "p3", layanan: "Potong rumput", tempat: "TPU Menteng Pulo", nomorMakam: "Blok B2, No. 88", tanggal: "Hari ini", status: "dikonfirmasi" },
  { id: "p4", layanan: "Cat ulang nisan", tempat: "TPU Karet Bivak", nomorMakam: "Blok AA2, No. 31", tanggal: "Besok, 27 Sep", status: "diajukan", catatan: "Terima sebelum 20.00 hari ini" },
  { id: "p5", layanan: "Laporan foto", tempat: "TPU Pondok Kelapa", nomorMakam: "Blok 5, No. 210", tanggal: "Senin, 28 Sep", status: "diajukan", catatan: "Terima sebelum 12.00 besok" },
];

export const tugasLapangan: PekerjaanRow[] = [
  { id: "t1", layanan: "Kunjungan Verifikasi", tempat: "Makam Wakaf Baitul Makmur", nomorMakam: "Tangerang Selatan", tanggal: "Hari ini, 10.00", status: "dikonfirmasi", catatan: "Foto fasilitas, titik peta, alamat" },
  { id: "t2", layanan: "Ambil surat pengantar", tempat: "Kelurahan Cilandak Barat", nomorMakam: "MKM-2026-000402", tanggal: "Hari ini, 13.00", status: "dikonfirmasi" },
  { id: "t3", layanan: "Cek Denah", tempat: "Makam Sirnaraga Indah", nomorMakam: "Bogor", tanggal: "Selasa, 29 Sep", status: "diajukan" },
];

export const pekerjaanTerlambat = [
  { id: "l1", layanan: "Bersihkan makam", tempat: "TPU Karet Bivak", oleh: "CV Bunga Kamboja", hari: 2 },
  { id: "l2", layanan: "Tabur bunga", tempat: "Taman Makam Wakaf Al-Ikhlas", oleh: "Admin Lokasi", hari: 3 },
  { id: "l3", layanan: "Laporan foto", tempat: "TPU Tanah Kusir", oleh: "Pak Slamet (Mitra Jasa)", hari: 2 },
];

export const tarifJenisMakam = [
  { jenis: "Petak tunggal", harga: "Rp 12.500.000", masa: "Selamanya", perpanjangan: "–" },
  { jenis: "Petak tunggal, 5 tahun", harga: "Rp 4.000.000", masa: "5 tahun", perpanjangan: "Rp 2.750.000" },
  { jenis: "Kavling Keluarga (4 petak)", harga: "Rp 46.000.000", masa: "Selamanya", perpanjangan: "–" },
  { jenis: "Petak anak", harga: "Rp 6.000.000", masa: "Selamanya", perpanjangan: "–" },
];

export const jamOperasional = [
  { hari: "Senin", jam: "07.00–17.00" },
  { hari: "Selasa", jam: "07.00–17.00" },
  { hari: "Rabu", jam: "07.00–17.00" },
  { hari: "Kamis", jam: "07.00–17.00" },
  { hari: "Jumat", jam: "07.00–11.00, 13.30–17.00" },
  { hari: "Sabtu", jam: "08.00–15.00" },
  { hari: "Minggu", jam: "Tutup" },
];

export const adminLokasi = [
  { nama: "Hj. Siti Rahmawati", telepon: "0812-8801-2231", email: "siti@al-ikhlas.or.id", kontakSiaga: true },
  { nama: "Ahmad Fauzi", telepon: "0813-1122-4590", email: "fauzi@al-ikhlas.or.id", kontakSiaga: false },
  { nama: "Nur Aini", telepon: "0857-7788-0012", email: "Belum ada email", kontakSiaga: false },
];

export const auditLog = [
  { waktu: "24 Sep 2026, 14.12", staf: "Rina Kartika", peran: "Admin Platform", aksi: "tarif.tandai_diperiksa", alasan: "Cocok dengan perjanjian halaman 4" },
  { waktu: "24 Sep 2026, 13.58", staf: "Rina Kartika", peran: "Admin Platform", aksi: "tarif.ubah_jenis_makam", alasan: "Harga baru mulai 1 Oktober 2026" },
  { waktu: "20 Sep 2026, 09.30", staf: "Hj. Siti Rahmawati", peran: "Admin Lokasi", aksi: "lokasi.pilih_kontak_siaga", alasan: "" },
  { waktu: "20 Sep 2026, 09.21", staf: "Hj. Siti Rahmawati", peran: "Admin Lokasi", aksi: "lokasi.ubah_jam_operasional", alasan: "Jumat tutup saat salat Jumat" },
  { waktu: "12 Sep 2026, 16.40", staf: "Dimas Prasetyo", peran: "Admin Platform", aksi: "lokasi.unggah_perjanjian", alasan: "" },
  { waktu: "12 Sep 2026, 16.02", staf: "Dimas Prasetyo", peran: "Admin Platform", aksi: "lokasi.buat", alasan: "" },
] as const;

export const peringatanStaf = [
  { id: "n1", judul: "Pemesanan Saat Duka baru menunggu konfirmasi", waktu: "3 menit lalu", baru: true },
  { id: "n2", judul: "Baris Antrean lewat tenggat: MKM-2026-000418", waktu: "12 menit lalu", baru: true },
  { id: "n3", judul: "Pekerjaan Layanan Terlambat di TPU Karet Bivak", waktu: "1 jam lalu", baru: false },
];

export const lokasiAdminLokasi = [
  { id: "al-ikhlas", name: "Taman Makam Wakaf Al-Ikhlas", kota: "Jakarta Selatan" },
  { id: "rawa-kopi", name: "Makam Wakaf Rawa Kopi", kota: "Jakarta Selatan" },
  { id: "darussalam", name: "Pemakaman Wakaf Darussalam", kota: "Depok" },
];

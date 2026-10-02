import type { BerkasWakafInput } from "@/domain/wakaf/skema";

/** Every reason the Wakaf module can refuse a write, in Bahasa Indonesia: one map for the three action files. */
const pesanAlasan: Record<string, string> = {
  tidak_berwenang: "Anda tidak berwenang melakukan ini.",
  perlu_totp: "Masukkan kode dari aplikasi authenticator Anda dulu.",
  input_tidak_valid: "Periksa lagi isian Anda.",
  nomor_telepon_tidak_valid: "Nomor telepon tidak valid. Tulis nomor Indonesia, misalnya 0812 3456 7890.",
  pengajuan_tidak_ditemukan: "Pengajuan Wakaf ini tidak ditemukan.",
  nazhir_tidak_ditemukan: "Nazhir ini tidak ditemukan.",
  transisi_tidak_valid: "Status itu tidak bisa dipilih dari status sekarang.",
  tanggal_wajib: "Isi tanggalnya: tanggal survei untuk Survei Dijadwalkan, tanggal ikrar untuk Menunggu Ikrar.",
  petugas_wajib: "Pilih Petugas Lapangan yang melakukan survei.",
  petugas_tidak_valid: "Akun yang dipilih bukan Petugas Lapangan aktif.",
  alasan_wajib: "Isi alasannya; Wakif akan membacanya.",
  hasil_wajib: "Unggah scan AIW atau sertipikat untuk menyelesaikan Pengajuan.",
  tidak_dapat_dibatalkan: "Pengajuan sudah melewati tahap yang bisa dibatalkan.",
  pengajuan_sudah_ditutup: "Pengajuan ini sudah selesai atau ditutup.",
  berkas_tidak_didukung: "Berkas harus PDF, JPG atau PNG, paling besar 8 MB.",
  penyimpanan_belum_tersedia: "Penyimpanan berkas belum tersedia. Coba lagi nanti.",
};

/** The words for a refusal reason; an unknown one reads as "Periksa lagi isian Anda." */
export function pesanWakaf(alasan: string): string {
  return pesanAlasan[alasan] ?? pesanAlasan.input_tidak_valid!;
}

/** The staff detail page of one Pengajuan Wakaf. */
export function pathPengajuanWakaf(id: string): string {
  return `/staf/admin-platform/wakaf/${id}`;
}

/** What a document is when the form does not say (the scan Admin Platform attaches to Selesai). */
export const KUNCI_BERKAS_LAINNYA = "lainnya" as const;

/** A document an upload form picked, as the Wakaf module takes it. */
export async function berkasDariFile(file: File, kunci: BerkasWakafInput["kunci"] = KUNCI_BERKAS_LAINNYA): Promise<BerkasWakafInput> {
  return { kunci, body: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
}

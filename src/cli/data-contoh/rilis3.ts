/**
 * The Rilis 2/3 set of Data Contoh (ticket 111): what `tanam --set rilis3` puts beside the Rilis 1 set so that production can
 * open level 3 during the beta without the owner's real TPU prices. These constants are the table the owner approves (ticket
 * 111, "Amounts"): change one here and it changes there.
 *
 * - The DKI price a family pays for a Layanan variant at any TPU DKI, and the rate the Operator pays a Mitra Jasa for it, one
 *   amount per kind of Layanan for every variant of it, and Admin Platform's "boleh di TPU DKI" mark on every variant.
 *   Every amount is a multiple of Rp 25.000, and a Mitra Jasa is paid less than the family pays. The DKI prices differ from
 *   the Lokasi prices of the Rilis 1 set on purpose: a test or a UAT that reads the wrong price book then sees the difference.
 * - Three Mitra Jasa (Contoh), Aktif, each with a coverage of its own, so the assignment picker's hard filter has something
 *   to filter. They have no Akun and no login (an address on the reserved `.invalid` TLD that nothing is ever sent to).
 * - Two Nazhir (Contoh) for the Pengajuan Wakaf form.
 * - The Rilis 2 rules (Masa Tenggang, the most terms of a Perpanjangan, the Ganti Pemegang Hak by sale and its fee) on two of
 *   the Lokasi (Contoh) of the Rilis 1 set; the rest of their rules stay as that set left them (tumpang is already on).
 * - The Retribusi Pemda of an IPTM at Rp 0, which is NOT contoh: the owner confirmed Rp 0 as the real value from switch day.
 */
import type { JenisLayanan } from "@/domain/layanan";
import type { Nazhir } from "@/domain/wakaf";

/** The DKI price of a Layanan variant, by the kind of Layanan: one amount for every variant of it. */
export const HARGA_DKI_DATA_CONTOH: Record<JenisLayanan, number> = {
  bunga: 150_000,
  nisan: 1_500_000,
  pembersihan: 250_000,
  perawatan: 350_000,
  laporan: 75_000,
};

/** What the Operator pays a Mitra Jasa for a Layanan variant, by the kind of Layanan: never shown to a family. */
export const TARIF_MITRA_JASA_DATA_CONTOH: Record<JenisLayanan, number> = {
  bunga: 100_000,
  nisan: 1_000_000,
  pembersihan: 150_000,
  perawatan: 200_000,
  laporan: 50_000,
};

/** The Retribusi Pemda of an IPTM: the real value, from the owner's decision. */
export const RETRIBUSI_PEMDA_IPTM_ASLI = 0;

/** Which Layanan variants and DKI TPU an example Mitra Jasa covers. */
export type CakupanMitraJasa = "semua" | "tanpa_nisan" | "separuh_tpu";

export interface MitraJasaContoh {
  slug: string;
  namaLengkap: string;
  email: string;
  /** A 16-digit NIK no person has (it starts with the province code 00), unique like every NIK. */
  nik: string;
  area: string;
  cakupan: CakupanMitraJasa;
}

/**
 * Three Mitra Jasa (Contoh): one covers every TPU and every variant, one every TPU but no Batu Nisan, one only the first half
 * of the TPU by name, so the picker offers a different set for different jobs.
 */
export const MITRA_JASA_DATA_CONTOH: MitraJasaContoh[] = [
  { slug: "agus-pratama", namaLengkap: "Agus Pratama (Contoh)", email: "mitra-jasa.agus-pratama@contoh.makam.invalid", nik: "0000000000000001", area: "Jakarta Selatan (Contoh)", cakupan: "semua" },
  { slug: "siti-rahayu", namaLengkap: "Siti Rahayu (Contoh)", email: "mitra-jasa.siti-rahayu@contoh.makam.invalid", nik: "0000000000000002", area: "Jakarta Timur (Contoh)", cakupan: "tanpa_nisan" },
  { slug: "bambang-wijaya", namaLengkap: "Bambang Wijaya (Contoh)", email: "mitra-jasa.bambang-wijaya@contoh.makam.invalid", nik: "0000000000000003", area: "Jakarta Barat (Contoh)", cakupan: "separuh_tpu" },
];

/** What a Mitra Jasa's coverage is, out of the TPU (by name) and the variants (with the kind of their Layanan) the stack has. */
export function cakupanMitraJasa(
  cakupan: CakupanMitraJasa,
  tpuDkiIds: string[],
  varian: { id: string; jenis: JenisLayanan }[],
): { tpuDkiIds: string[]; layananVariantIds: string[] } {
  const tpu = cakupan === "separuh_tpu" ? tpuDkiIds.slice(0, Math.ceil(tpuDkiIds.length / 2)) : tpuDkiIds;
  const layanan = cakupan === "tanpa_nisan" ? varian.filter((satu) => satu.jenis !== "nisan") : varian;
  return { tpuDkiIds: tpu, layananVariantIds: layanan.map((satu) => satu.id) };
}

export interface NazhirContoh {
  slug: string;
  nama: string;
  jenis: Nazhir["jenis"];
  kabKota: string;
  kontak: string;
  nomorBwi: string;
}

export const NAZHIR_DATA_CONTOH: NazhirContoh[] = [
  {
    slug: "wakaf-sejahtera",
    nama: "Nazhir Wakaf Sejahtera (Contoh)",
    jenis: "badan_hukum",
    kabKota: "Kota Jakarta Selatan",
    kontak: "021-5550101 / nazhir.sejahtera@contoh.makam.invalid",
    nomorBwi: "BWI-CONTOH-001",
  },
  {
    slug: "amanah-umat",
    nama: "Nazhir Amanah Umat (Contoh)",
    jenis: "organisasi",
    kabKota: "Kota Bogor",
    kontak: "0251-5550102 / nazhir.amanah@contoh.makam.invalid",
    nomorBwi: "BWI-CONTOH-002",
  },
];

/** The Rilis 2 rules one Lokasi (Contoh) is given: only these four rules, the others are left as they are. */
export interface AturanRilis2 {
  /** The Lokasi Mitra of the Rilis 1 set, by its name before the "(Contoh)" mark. */
  lokasi: string;
  masaTenggangMonths: number;
  maxPerpanjanganTerms: number;
  gantiPemegangHakFee: number;
  saleTransfersAllowed: boolean;
}

/**
 * The Rilis 2 rules on two Lokasi (Contoh) with a Hak Pakai berjangka, so Perpanjangan, the masa tenggang and the Ganti
 * Pemegang Hak by sale have a Lokasi that allows them; the other three Lokasi (Contoh) keep the defaults (sale forbidden), so a
 * refused sale can be tried too. Perpanjangan Makam Taman at the first, three terms, is Rp 9.000.000: with the contoh Biaya
 * Layanan Platform it stays under the Rp 10.000.000 QRIS cap.
 */
export const ATURAN_RILIS2_DATA_CONTOH: AturanRilis2[] = [
  { lokasi: "Taman Makam Firdaus", masaTenggangMonths: 3, maxPerpanjanganTerms: 3, gantiPemegangHakFee: 500_000, saleTransfersAllowed: true },
  { lokasi: "Makam Masjid Nurul Huda", masaTenggangMonths: 6, maxPerpanjanganTerms: 2, gantiPemegangHakFee: 250_000, saleTransfersAllowed: true },
];

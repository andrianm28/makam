import "server-only";
import { z } from "zod";
import { targetPalingDini } from "@/domain/layanan";
import { proofLabels } from "@/lib/layanan-labels";
import { serverRuntime } from "@/server/runtime";

/**
 * The Layanan order checkout's own read: what the page shows, composed from the
 * Layanan module's public reads. The page renders this and nothing else, so the
 * payload a family is handed is exactly what the page has in hand.
 *
 * The price shown is the price of the *set* the family has chosen, from
 * `hargaPesananLayanan` — the same `quote()` the Tagihan is issued from — never
 * a per-variant total, because a Tagihan carries one Biaya Layanan Platform
 * however many Layanan it holds.
 */

export interface VarianTawarkan {
  id: string;
  name: string;
  /** That place's price for this variant alone, in whole rupiah. */
  harga: number;
  inForceSince: string;
}

export interface LayananTawarkan {
  /** The whole catalog entry's facts, so the form can ask for what it needs. */
  id: string;
  name: string;
  description: string;
  leadTimeDays: number;
  teksLabel: string | null;
  /** What the work has to show, in the fulfiller's and the family's words. */
  proof: string;
  /** The earliest target date this Layanan may be asked for: today plus its lead time (WIB). */
  targetPalingDini: string;
  varian: VarianTawarkan[];
}

export interface HargaPesananTerbaca {
  total: number;
  platformFee: number;
  /** One line per part, in the order the Tagihan issues them. */
  parts: { label: string; amount: number }[];
  inForceSince: string;
}

export interface TampilanPesananLayanan {
  status: "siap" | "lokasi_tidak_terbuka" | "grave_tidak_ditemukan" | "hak_pakai_berakhir";
  lokasi: { id: string; name: string } | null;
  petak: { id: string; nomor: string; perluVerifikasi: boolean } | null;
  layanan: LayananTawarkan[];
  /** The chosen set's price, or null while the family has chosen nothing (or something unpriceable). */
  harga: HargaPesananTerbaca | null;
  /** The signed-in Akun, whose email is prefilled and whose Kode Masuk is skipped. */
  pemesan: { nama: string; email: string; telepon: string } | null;
}

const querySchema = z.object({ lokasi: z.string().optional(), petak: z.string().optional() });

/** One offer screen, for the grave the hub's lookup named. */
export async function tampilanPesananLayanan(
  params: unknown,
  pemesan: { nama: string; email: string; telepon: string } | null,
): Promise<TampilanPesananLayanan> {
  const parsed = querySchema.safeParse(params);
  const query = parsed.success ? parsed.data : {};
  const now = serverRuntime().adapters.clock.now();
  const { layanan, lokasi, inventory } = serverRuntime();

  const kosong: TampilanPesananLayanan = { status: "siap", lokasi: null, petak: null, layanan: [], harga: null, pemesan };
  if (!query.lokasi || !query.petak) return kosong;

  if (!(await lokasi.isTerverifikasi(query.lokasi))) return { ...kosong, status: "lokasi_tidak_terbuka", lokasi: { id: query.lokasi, name: "" } };
  const hakPakai = await inventory.hakPakaiOfUnit({ petakId: query.petak });
  if (!hakPakai || hakPakai.lokasiId !== query.lokasi) return { ...kosong, status: "grave_tidak_ditemukan" };
  if (hakPakai.status === "berakhir" || hakPakai.status === "dibatalkan") return { ...kosong, status: "hak_pakai_berakhir" };

  if (hakPakai.nomor === null) return { ...kosong, status: "grave_tidak_ditemukan" };
  const profil = await lokasi.publicLokasiMitra(query.lokasi);
  if (!profil) return { ...kosong, status: "lokasi_tidak_terbuka" };

  const penawaran = await layanan.penawaranUntukPesanan(query.lokasi);
  return {
    status: "siap",
    lokasi: { id: query.lokasi, name: profil.name },
    petak: { id: query.petak, nomor: hakPakai.nomor, perluVerifikasi: hakPakai.perluVerifikasi },
    layanan: penawaran.map((grup) => ({
      id: grup.layanan.id,
      name: grup.layanan.name,
      description: grup.layanan.description,
      leadTimeDays: grup.layanan.leadTimeDays,
      teksLabel: grup.layanan.teksLabel,
      proof: proofLabels(grup.layanan.proof),
      targetPalingDini: targetPalingDini(grup.layanan.leadTimeDays, now),
      varian: grup.varian,
    })),
    harga: null,
    pemesan,
  };
}

/** The chosen set's all-in price, recomputed as the family changes it: the Tagihan's own total. */
export async function hargaPilihan(
  lokasiId: string,
  layananVariantIds: readonly string[],
): Promise<HargaPesananTerbaca | null> {
  const hasil = await serverRuntime().layanan.hargaPesananLayanan(lokasiId, layananVariantIds);
  if (!hasil) return null;
  return { total: hasil.total, platformFee: hasil.platformFee, parts: hasil.parts.map((baris) => ({ label: baris.label, amount: baris.amount })), inForceSince: hasil.inForceSince };
}

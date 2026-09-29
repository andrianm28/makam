import "server-only";
import { z } from "zod";
import { targetPalingDini } from "@/domain/layanan";
import { proofLabels } from "@/lib/layanan-labels";
import { serverRuntime } from "@/server/runtime";

/**
 * The TPU Layanan checkout's own read (spec, Layanan > Order; story 85): what the page
 * shows, composed from the Layanan and Lokasi modules' public reads, so the payload a
 * family is handed is exactly what the page has in hand.
 *
 * The grave is **described** here, not looked up: a DKI TPU has no Denah. Ordering from
 * a Makam TPU (ticket 46's record) opens this page with the grave's own words in the
 * query (`tpu`, `blok`, `almarhum`), which prefill the form; nothing in the query is
 * trusted, since the module checks every field again at Kirim.
 */

export interface VarianTpuTawarkan {
  id: string;
  name: string;
  /** The DKI price of this variant, in whole rupiah: also its total, since a TPU Tagihan carries no platform fee. */
  harga: number;
}

export interface LayananTpuTawarkan {
  id: string;
  name: string;
  description: string;
  leadTimeDays: number;
  teksLabel: string | null;
  proof: string;
  /** The earliest target date this Layanan may be asked for: today plus its lead time (WIB). */
  targetPalingDini: string;
  varian: VarianTpuTawarkan[];
}

export interface TampilanPesananTpu {
  tpu: { id: string; name: string; address: string }[];
  layanan: LayananTpuTawarkan[];
  /** What the query prefilled: a TPU and the grave's words, or nothing. */
  awal: { tpuId: string; blokNomor: string; almarhumName: string };
  /** The signed-in Akun, whose email is prefilled and whose Kode Masuk is skipped. */
  pemesan: { nama: string; email: string; telepon: string } | null;
}

const querySchema = z.object({
  tpu: z.string().optional(),
  blok: z.string().max(200).optional(),
  almarhum: z.string().max(200).optional(),
});

/** One offer screen for a described grave at a DKI TPU. */
export async function tampilanPesananTpu(params: unknown, pemesan: TampilanPesananTpu["pemesan"]): Promise<TampilanPesananTpu> {
  const parsed = querySchema.safeParse(params);
  const query = parsed.success ? parsed.data : {};
  const runtime = serverRuntime();
  const now = runtime.adapters.clock.now();
  const [daftarTpu, penawaran] = await Promise.all([runtime.lokasi.publicTpuDkiList(), runtime.layanan.penawaranTpuUntukPesanan()]);
  const tpuId = daftarTpu.some((satu) => satu.id === query.tpu) ? (query.tpu ?? "") : "";
  return {
    tpu: daftarTpu.map((satu) => ({ id: satu.id, name: satu.name, address: satu.address })),
    layanan: penawaran.map((grup) => ({
      id: grup.layanan.id,
      name: grup.layanan.name,
      description: grup.layanan.description,
      leadTimeDays: grup.layanan.leadTimeDays,
      teksLabel: grup.layanan.teksLabel,
      proof: proofLabels(grup.layanan.proof),
      targetPalingDini: targetPalingDini(grup.layanan.leadTimeDays, now),
      varian: grup.varian.map((varian) => ({ id: varian.id, name: varian.name, harga: varian.harga })),
    })),
    awal: { tpuId, blokNomor: query.blok ?? "", almarhumName: query.almarhum ?? "" },
    pemesan,
  };
}

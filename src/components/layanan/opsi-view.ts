import type { LayananUntukPesanan } from "@/domain/layanan";
import type { OpsiTambahLayanan } from "./tambah-layanan-perpanjangan";

/** A Layanan the module offers, as the plain value a Client Component is handed (its price and lead time, no catalog internals). */
export function opsiLayananView(grup: LayananUntukPesanan & { tanggalPalingDini: string }): OpsiTambahLayanan {
  return {
    id: grup.layanan.id,
    name: grup.layanan.name,
    teksLabel: grup.layanan.teksLabel,
    leadTimeDays: grup.layanan.leadTimeDays,
    tanggalPalingDini: grup.tanggalPalingDini,
    varian: grup.varian.map((varian) => ({ id: varian.id, name: varian.name, harga: varian.harga })),
  };
}

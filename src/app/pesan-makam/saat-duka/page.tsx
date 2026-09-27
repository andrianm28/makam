import type { Metadata } from "next";
import { PilihMakam } from "./pilih-makam";
import { layarPilihMakam } from "./daftar";
import { grupView } from "./tampilan";
import { kartuAwal } from "@/domain/pemesanan";
import { satuNilai } from "@/lib/search-param";
import { serverRuntime } from "@/server/runtime";

export const metadata: Metadata = {
  title: "Pesan Makam Saat Duka | Makam.co.id",
};

/**
 * Screen 1 of the Saat Duka wizard, "Pilih makam" (spec, stories 17–20; the
 * public booking wizard): the Lokasi Mitra the visitor came from preselects
 * itself, the list is filtered by the city they last chose (or the deep-linked
 * Lokasi's own city), and each card carries its all-in total, its Tersedia
 * count and when it will be confirmed.
 */
export default async function PilihMakamPage({ searchParams }: PageProps<"/pesan-makam/saat-duka">) {
  const { lokasiId, kota } = await searchParams;
  const { operatorSettings } = serverRuntime();
  const [layar, pengaturan] = await Promise.all([
    layarPilihMakam({ kota: satuNilai(kota), lokasiId: satuNilai(lokasiId) }),
    operatorSettings.current(),
  ]);

  return (
    <PilihMakam
      grup={layar.grup.map(grupView)}
      semuaKota={layar.semuaKota}
      kota={layar.kota}
      kembali={layar.asal ? `/pesan-makam/saat-duka?lokasiId=${encodeURIComponent(layar.asal.id)}` : "/pesan-makam/saat-duka"}
      preselect={layar.asal?.id ?? null}
      awal={kartuAwal(layar.grup, layar.asal?.id ?? null)}
      csContact={pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null}
    />
  );
}

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
 * Screen 1 of the Saat Duka wizard, "Pilih makam" (spec, stories 17–20): the
 * Lokasi Mitra the visitor came from preselects itself, the list is filtered by
 * the city they last chose (or the deep-linked Lokasi's own city), each card
 * carries its all-in total, its Tersedia count and when it will be confirmed —
 * and below them the TPU section (story 19: "dimakamkan lewat Pengurusan",
 * only the TPUs taking new plots), with the type chip over the combined list.
 */
export default async function PilihMakamPage({ searchParams }: PageProps<"/pesan-makam/saat-duka">) {
  const { lokasiId, kota, jenis } = await searchParams;
  const { operatorSettings } = serverRuntime();
  const [layar, pengaturan] = await Promise.all([
    layarPilihMakam({ kota: satuNilai(kota), lokasiId: satuNilai(lokasiId), jenis: satuNilai(jenis) }),
    operatorSettings.current(),
  ]);

  return (
    <PilihMakam
      grup={layar.grup.map((satu) => grupView(satu, layar.foto[satu.lokasi.id] ?? null))}
      tpu={layar.tpu}
      semuaKota={layar.semuaKota}
      kota={layar.kota}
      jenis={layar.jenis}
      kembali={layar.asal ? `/pesan-makam/saat-duka?lokasiId=${encodeURIComponent(layar.asal.id)}` : "/pesan-makam/saat-duka"}
      preselect={layar.asal?.id ?? null}
      awal={kartuAwal(layar.grup, layar.asal?.id ?? null)}
      csContact={pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null}
    />
  );
}

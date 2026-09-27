import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PilihMakam } from "./pilih-makam";
import { grupView } from "./tampilan";
import { KOTA_PILIHAN } from "./draft";
import { satuNilai } from "@/lib/search-param";
import { serverRuntime } from "@/server/runtime";

export const metadata: Metadata = {
  title: "Pesan Makam Saat Duka | Makam.co.id",
};

/**
 * Screen 1 of the Saat Duka wizard, "Pilih makam" (spec, stories 17–20; the
 * public booking wizard): the Lokasi Mitra the visitor came from preselects
 * itself, the city filter is prefilled from their last choice, and each card
 * carries its all-in total, its Tersedia count and when it will be confirmed.
 */
export default async function PilihMakamPage({ searchParams }: PageProps<"/pesan-makam/saat-duka">) {
  const { lokasiId, kota } = await searchParams;
  const { pemesanan, lokasi, operatorSettings } = serverRuntime();

  const [daftar, semuaKota, pengaturan, cookiesSeen, asal] = await Promise.all([
    pemesanan.pilihanSaatDuka(kota ? { city: satuNilai(kota) } : {}),
    lokasi.publicLokasiMitraCities(),
    operatorSettings.current(),
    cookies(),
    lokasiId ? lokasi.publicLokasiMitra(satuNilai(lokasiId)) : null,
  ]);

  return (
    <PilihMakam
      grup={daftar.map(grupView)}
      semuaKota={semuaKota}
      kota={satuNilai(kota) || asal?.city || cookiesSeen.get(KOTA_PILIHAN)?.value || null}
      kembali={asal ? `/pesan-makam/saat-duka?lokasiId=${encodeURIComponent(asal.id)}` : "/pesan-makam/saat-duka"}
      preselect={asal?.id ?? null}
      csContact={pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null}
    />
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DataKirim } from "./data-kirim";
import { kartuView } from "../tampilan";
import { kirimKodeMasuk } from "@/app/masuk/actions";
import { satuNilai } from "@/lib/search-param";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";

export const metadata: Metadata = {
  title: "Data & kirim | Pesan Makam Saat Duka | Makam.co.id",
  robots: { index: false, follow: false },
};

/**
 * Screen 2 of the Saat Duka wizard, "Data & kirim" (spec, stories 21–28): the
 * chosen Lokasi Mitra × Jenis Makam with its all-in total, the family's data,
 * the Almarhum, the Pemegang Hak, the note that nothing is paid now, and the
 * Kode Masuk that proves the email at Kirim (skipped for a signed-in Pemesan).
 */
export default async function DataKirimPage({ searchParams }: PageProps<"/pesan-makam/saat-duka/data">) {
  const { lokasiId, jenisMakamId } = await searchParams;
  const { pemesanan, operatorSettings } = serverRuntime();
  const actor = await currentActor();

  // The one card is priced again by the module, so the total a family reads on
  // this screen is the one its order will carry. A URL without both ids names no
  // card at all, rather than the first one the list happens to have.
  const [daftar, pengaturan] = await Promise.all([
    satuNilai(lokasiId) && satuNilai(jenisMakamId)
      ? pemesanan.pilihanSaatDuka({ lokasiId: satuNilai(lokasiId), jenisMakamId: satuNilai(jenisMakamId) })
      : Promise.resolve([]),
    operatorSettings.current(),
  ]);
  const grup = daftar[0];
  const kartu = grup?.pilihan[0];
  if (!grup || !kartu) notFound();

  return (
    <DataKirim
      draft={{ lokasiId: grup.lokasi.id, jenisMakamId: kartu.jenisMakamId, email: actor?.email ?? "", pemesanName: "", phoneNumber: "" }}
      kartu={kartuView(kartu)}
      lokasi={{ id: grup.lokasi.id, name: grup.lokasi.name, city: grup.lokasi.city }}
      sudahMasuk={actor !== null}
      mintaKodeMasuk={kirimKodeMasuk}
      csContact={pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null}
    />
  );
}

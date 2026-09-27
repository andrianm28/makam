import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PilihMakam } from "./pilih-makam";
import { layarPilihMakam } from "./daftar";
import { grupView } from "./tampilan";
import { authorize, pemesananResource } from "@/domain/identity";
import { kartuAwal } from "@/domain/pemesanan";
import { satuNilai } from "@/lib/search-param";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";

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
  const { lokasiId, kota, dari } = await searchParams;
  const { operatorSettings } = serverRuntime();
  const [layar, pengaturan] = await Promise.all([
    layarPilihMakam({ kota: satuNilai(kota), lokasiId: satuNilai(lokasiId), dari: satuNilai(dari), pemesan: await pemesanDari(satuNilai(dari)) }),
    operatorSettings.current(),
  ]);

  return (
    <PilihMakam
      grup={layar.grup.map(grupView)}
      semuaKota={layar.semuaKota}
      kota={layar.kota}
      kembali={layar.asal ? `/pesan-makam/saat-duka?lokasiId=${encodeURIComponent(layar.asal.id)}` : "/pesan-makam/saat-duka"}
      pemesanUlang={layar.pemesanUlang}
      preselect={layar.asal?.id ?? null}
      awal={kartuAwal(layar.grup, layar.asal?.id ?? null)}
      csContact={pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null}
    />
  );
}

/**
 * Who the `dari` link's family is. The prefilled data is a phone number, an email
 * and a dead relative's name, so it is read as the signed-in Akun's own order and
 * nobody else's — the same rule as the order page. A visitor with no session is
 * sent to Masuk: the Kode Masuk that placed the order is the one that signs them
 * in, and their own order carries the link again. Another Akun's number is no
 * family, and the list opens plainly with no banner.
 */
async function pemesanDari(dari: string | undefined): Promise<{ accountId: string } | null> {
  if (!dari) return null;
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  return authorize(actor, "pemesanan.lihat", pemesananResource(actor.accountId)).allowed ? { accountId: actor.accountId } : null;
}

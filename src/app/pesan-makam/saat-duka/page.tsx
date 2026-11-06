import { rilisTerbuka } from "@/lib/rilis";
import type { Metadata } from "next";
import { PilihMakam } from "./pilih-makam";
import { layarPilihMakam } from "./daftar";
import { dariDari } from "./dari";
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
 * Screen 1 of the Saat Duka wizard, "Pilih makam" (rapat Ira, 6 Nov 2026,
 * Opsi A): the grid of big Lokasi Mitra cards under their city headings with
 * the agama filter, then, at `?lokasiId=`, that Lokasi Mitra's Pilih Tipe
 * Kavling step with each tipe's all-in total, Tersedia count and when it will
 * be confirmed; the TPU section below the grid while TPU DKI is open.
 */
export default async function PilihMakamPage({ searchParams }: PageProps<"/pesan-makam/saat-duka">) {
  const { lokasiId, jenis, dari } = await searchParams;
  const { operatorSettings } = serverRuntime();
  const [layar, pengaturan] = await Promise.all([
    layarPilihMakam({
      lokasiId: satuNilai(lokasiId),
      jenis: satuNilai(jenis),
      dari: dariDari(satuNilai(dari)),
      pemesan: await pemesanDari(dariDari(satuNilai(dari))),
    }),
    operatorSettings.current(),
  ]);

  return (
    <PilihMakam
      grup={layar.grup.map((satu) => grupView(satu, layar.foto[satu.lokasi.id] ?? null))}
      tpu={rilisTerbuka("tpu") ? layar.tpu : []}
      tpuTerbuka={rilisTerbuka("tpu")}
      jenis={rilisTerbuka("tpu") ? layar.jenis : "semua"}
      kembali={kembaliKe(layar.asal?.id ?? null, layar.dari)}
      dari={layar.dari}
      banner={
        layar.pemesanUlang
          ? { nomor: layar.pemesanUlang.nomor, lokasiName: layar.pemesanUlang.banner.lokasi.name, alasan: layar.pemesanUlang.banner.alasan }
          : null
      }
      preselect={layar.asal?.id ?? null}
      awal={kartuAwal(layar.grup, layar.asal?.id ?? null)}
      csContact={pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null}
    />
  );
}

/**
 * The URL this screen comes back to, keeping the deep-linked Lokasi and the Tolak
 * it was opened from: the type chip and the city filter are built from it, so a
 * click on either never drops the banner or the exclusion.
 */
function kembaliKe(lokasiId: string | null, dari: string | null): string {
  const query = new URLSearchParams();
  if (lokasiId) query.set("lokasiId", lokasiId);
  if (dari) query.set("dari", dari);
  const suffix = query.toString();
  return suffix === "" ? "/pesan-makam/saat-duka" : `/pesan-makam/saat-duka?${suffix}`;
}

/**
 * Who the `dari` link's family is. The prefilled data is a phone number, an email
 * and a dead relative's name, so it is read as the signed-in Akun's own order and
 * nobody else's, the same rule as the order page. A visitor with no session, or
 * another Akun's number, is no family: the list opens plainly with no banner.
 */
async function pemesanDari(dari: string): Promise<{ accountId: string } | null> {
  if (!dari) return null;
  const actor = await currentActor();
  // No session is no family: the plain list, no banner, no redirect and no return URL.
  if (!actor) return null;
  return authorize(actor, "pemesanan.lihat", pemesananResource(actor.accountId)).allowed ? { accountId: actor.accountId } : null;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { kirimKodeMasuk } from "@/app/(site)/masuk/actions";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { DataKirimTumpang } from "./data-kirim-tumpang";

export const metadata: Metadata = { title: "Makamkan di sini" };

/**
 * "Makamkan di sini" from the Makam keluarga hub (ticket 35): a further burial under an existing Hak Pakai. The grave is
 * the one the hub found, so the screen asks only for the Almarhum and the Pemesan. The kind of request follows from the
 * grave: a Kavling Keluarga's next plot, a plot nobody is buried in yet (a Calon Penghuni's), or a tumpang.
 */
export default async function MakamkanDiSiniPage({ params }: PageProps<"/pesan-makam/makamkan-di-sini/[hakPakaiId]">) {
  const id = z.uuid().safeParse((await params).hakPakaiId);
  if (!id.success) notFound();
  const hak = await serverRuntime().inventory.hakPakaiUntukTumpang(id.data);
  if (!hak) notFound();
  const actor = await currentActor();
  const jenis = hak.kavling ? "kavling_berikutnya" : hak.layers > 0 ? "tumpang" : "calon_penghuni";
  const lokasi = await serverRuntime().lokasi.publicLokasiMitra(hak.lokasiId);
  if (!lokasi) notFound();
  const pengaturan = await serverRuntime().operatorSettings.current();
  return (
    <DataKirimTumpang
      awal={{ lokasiId: hak.lokasiId, hakPakaiId: hak.hakPakaiId, jenis }}
      namaLokasi={lokasi.name}
      nomorMakam={hak.kavling ? `Kavling Keluarga ${hak.kavling.nomorKavling}` : `Petak ${hak.petak?.nomorMakam ?? ""}`}
      anggota={hak.kavling?.petak.map((petak) => ({ id: petak.id, nomorMakam: petak.nomorMakam })) ?? []}
      emailAwal={actor?.email ?? ""}
      sudahMasuk={actor !== null}
      mintaKodeMasuk={kirimKodeMasuk}
      csContact={pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null}
    />
  );
}

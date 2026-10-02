import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/site/content-page";
import { kabKotaJabodetabek, PETUNJUK_DIRUJUK } from "@/domain/wakaf/skema";
import { kirimKodeMasuk } from "../masuk/actions";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { FormWakaf } from "./form";

export const metadata: Metadata = {
  title: "Wakaf Tanah — Makam.co.id",
  description: "Ajukan wakaf tanah untuk pemakaman. Kami menghubungkan Anda dengan Nazhir; tanah dan uang tidak pernah melewati Makam.co.id.",
};

const langkah = [
  "Anda mengisi satu halaman: tanah, bukti kepemilikan dan tujuan wakaf. Dokumen boleh menyusul.",
  "Tim kami meninjau pengajuan dan menghubungi Anda, lalu mencocokkan Anda dengan Nazhir.",
  "Petugas kami mensurvei tanahnya.",
  "Ikrar wakaf dilakukan di Kantor Urusan Agama (KUA), lalu sertipikat wakaf diproses.",
  "Selesai: salinan Akta Ikrar Wakaf (AIW) atau sertipikat tampil di Akun Saya.",
];

/**
 * Wakaf Tanah: how the process goes, the line that Makam.co.id never holds land or money, and the
 * one-page Pengajuan Wakaf. A visitor with no session proves their email with a Kode Masuk at Kirim.
 */
export default async function WakafTanahPage({ searchParams }: { searchParams: Promise<{ nomor?: string }> }) {
  const { nomor } = await searchParams;
  const { wakaf, operatorSettings } = serverRuntime();
  const actor = await currentActor();

  if (nomor && actor) {
    const saya = await wakaf.pengajuanSaya({ accountId: actor.accountId, email: actor.email });
    const pengajuan = saya.find((satu) => satu.nomor === nomor);
    if (pengajuan) {
      return (
        <ContentPage title="Pengajuan wakaf diterima" lead={`Nomor Pengajuan Anda ${pengajuan.nomor}.`}>
          {pengajuan.status === "dirujuk" ? (
            <p className="text-body-lg">{pengajuan.alasan ?? PETUNJUK_DIRUJUK}</p>
          ) : (
            <p className="text-body-lg">Kami mengirim kabar ke {actor.email} setiap kali statusnya berubah. Tim kami menghubungi Anda dalam 3 hari kerja.</p>
          )}
          <Link href="/akun/wakaf" className="font-semibold text-primary underline underline-offset-2">
            Lihat di Akun Saya, tab Wakaf
          </Link>
        </ContentPage>
      );
    }
  }

  const [nazhir, pengaturan] = await Promise.all([wakaf.nazhirUntukPilihan(), operatorSettings.current()]);
  return (
    <ContentPage title="Wakaf Tanah" lead="Ajukan wakaf tanah untuk pemakaman. Kami hubungkan Anda dengan Nazhir yang mengurusnya.">
      <p className="rounded-2xl bg-brand-soft px-4 py-3 text-body-lg text-brand-soft-foreground">
        Makam.co.id hanya memfasilitasi. Tanah dan uang tidak pernah kami terima atau pegang.
      </p>
      <section aria-labelledby="proses" className="flex flex-col gap-3">
        <h2 id="proses" className="font-serif text-title-2 font-semibold">
          Prosesnya
        </h2>
        <ol className="flex list-decimal flex-col gap-2 pl-6 text-body-lg">
          {langkah.map((satu) => (
            <li key={satu}>{satu}</li>
          ))}
        </ol>
        <p className="text-body">
          Layanan ini baru untuk tanah di Jabodetabek. Untuk tanah di tempat lain: {PETUNJUK_DIRUJUK}
        </p>
      </section>
      <section aria-labelledby="ajukan" className="flex flex-col gap-4">
        <h2 id="ajukan" className="font-serif text-title-2 font-semibold">
          Ajukan wakaf
        </h2>
        <FormWakaf
          nazhir={nazhir}
          kabKota={[...kabKotaJabodetabek]}
          sudahMasuk={actor !== null}
          emailMasuk={actor?.email ?? ""}
          mintaKodeMasuk={kirimKodeMasuk}
          csContact={pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null}
        />
      </section>
    </ContentPage>
  );
}

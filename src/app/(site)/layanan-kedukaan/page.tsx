import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Eyebrow, PageHero } from "@/components/site/content-page";
import { judulBagian, pilGaris, pilUtama } from "@/components/site/gaya";
import { IkonKedukaanBulat } from "@/components/site/ikon-kedukaan";
import { KartuCs } from "@/components/site/kartu-cs";
import { hrefKedukaan, kedukaanTampil, tampilKedukaan } from "@/lib/kedukaan-konten";
import { serverRuntime } from "@/server/runtime";

export const metadata: Metadata = {
  title: "Layanan Kedukaan — Makam.co.id",
  description: "Rumah duka mitra Makam.co.id; jasa cargo, repatriasi jenazah dan bunga duka cita segera hadir.",
};

/**
 * The Layanan Kedukaan offered as white icon cards under the light title band (ADR 0010; dri, 6 Nov 2026): one not yet
 * available says "Segera hadir" and links nowhere.
 */
export default async function LayananKedukaanPage() {
  const settings = await serverRuntime().operatorSettings.current();
  const contact = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;
  return (
    <main className="flex w-full flex-1 flex-col">
      <PageHero
        eyebrow="Pendamping keluarga"
        title="Layanan Kedukaan"
        lead="Kami bantu keluarga mengurus kebutuhan di hari-hari duka, dari penjemputan jenazah sampai bunga duka cita."
        poin={["Satu tim yang menelepon dan mengatur untuk Anda", "Biaya disampaikan sebelum apa pun diatur", "Kabarnya tampil di Akun Saya"]}
        samping={<KartuCs contact={contact} />}
      >
        <Link href="/pesan-makam/saat-duka" className={pilUtama}>
          Pesan Makam Sekarang
        </Link>
        <Link href={hrefKedukaan("konsultasi")} className={pilGaris}>
          Konsultasi Rencana
        </Link>
      </PageHero>
      <section aria-labelledby="pilihan" className="mx-auto flex w-full max-w-(--page-max-width) flex-col gap-8 px-(--page-gutter) py-14 md:py-20">
        <div className="flex flex-col gap-3">
          <Eyebrow>Pilih layanan</Eyebrow>
          <h2 id="pilihan" className={judulBagian}>
            Apa yang keluarga butuhkan?
          </h2>
        </div>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {kedukaanTampil().map((konten) => {
            const segera = konten.jenis !== "konsultasi" && tampilKedukaan[konten.jenis] === "segera";
            const isi = (
              <>
                <IkonKedukaanBulat nama={konten.ikon} besar />
                <span className="font-heading text-2xl font-extrabold tracking-tight text-foreground">{konten.judul}</span>
                <span className="text-lg text-muted-foreground">{konten.ringkas}</span>
                {segera ? (
                  <span className="mt-auto inline-flex w-fit rounded-full bg-muted px-4 py-1.5 text-body font-bold text-muted-foreground">Segera hadir</span>
                ) : (
                  <span className="mt-auto inline-flex items-center gap-2 text-lg font-bold text-forest">
                    Lihat layanan <ArrowRightIcon className="size-5" aria-hidden />
                  </span>
                )}
              </>
            );
            return (
              <li key={konten.jenis}>
                {segera ? (
                  <div className="flex h-full flex-col gap-4 rounded-3xl border border-border bg-card p-7 opacity-80 shadow-sm">{isi}</div>
                ) : (
                  <Link
                    href={hrefKedukaan(konten.jenis)}
                    className="flex h-full flex-col gap-4 rounded-3xl border border-border bg-card p-7 shadow-md transition-shadow hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {isi}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}

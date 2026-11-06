import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/site/content-page";
import { IkonKedukaanBulat } from "@/components/site/ikon-kedukaan";
import { hrefKedukaan, kedukaanTampil, tampilKedukaan } from "@/lib/kedukaan-konten";

export const metadata: Metadata = {
  title: "Layanan Kedukaan — Makam.co.id",
  description: "Rumah duka mitra Makam.co.id; jasa cargo, repatriasi jenazah dan bunga duka cita segera hadir.",
};

/** The Layanan Kedukaan offered as icon cards (ADR 0010; rapat Ira, 6 Nov 2026): one not yet available says "Segera hadir" and links nowhere. */
export default function LayananKedukaanPage() {
  return (
    <ContentPage title="Layanan Kedukaan" lead="Kami bantu keluarga mengurus kebutuhan di hari-hari duka, dari penjemputan jenazah sampai bunga duka cita.">
      <ul className="grid gap-5 sm:grid-cols-2">
        {kedukaanTampil().map((konten) => {
          const isi = (
            <>
              <IkonKedukaanBulat nama={konten.ikon} />
              <span className="flex flex-col gap-2">
                <span className="font-heading text-2xl font-extrabold tracking-tight">{konten.judul}</span>
                <span className="text-lg text-ivory/85">{konten.ringkas}</span>
              </span>
            </>
          );
          const segera = konten.jenis !== "konsultasi" && tampilKedukaan[konten.jenis] === "segera";
          return (
            <li key={konten.jenis}>
              {segera ? (
                <div className="relative flex h-full items-start gap-5 rounded-2xl bg-forest p-7 text-ivory opacity-80">
                  {isi}
                  <span className="absolute top-4 right-4 rounded-full bg-sand px-3 py-1 text-small font-bold text-forest">
                    Segera hadir
                  </span>
                </div>
              ) : (
                <Link href={hrefKedukaan(konten.jenis)} className="flex h-full items-start gap-5 rounded-2xl bg-forest p-7 text-ivory transition-colors hover:bg-forest/90 focus-visible:ring-3 focus-visible:ring-ring/50">
                  {isi}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xl">
        Merencanakan lebih awal?{" "}
        <Link href={hrefKedukaan("konsultasi")} className="font-bold text-primary underline underline-offset-4">
          Minta Konsultasi Rencana Pemakaman
        </Link>
        .
      </p>
    </ContentPage>
  );
}

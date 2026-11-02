import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/site/content-page";
import { IkonKedukaanBulat } from "@/components/site/ikon-kedukaan";
import { layananKedukaanValues } from "@/domain/kedukaan/skema";
import { hrefKedukaan, kontenKedukaan } from "@/lib/kedukaan-konten";

export const metadata: Metadata = {
  title: "Layanan Kedukaan — Makam.co.id",
  description: "Rumah duka, mobil jenazah, cargo dan repatriasi jenazah, peti jenazah, dan bunga duka cita, diatur oleh tim Makam.co.id.",
};

/** The six Layanan Kedukaan as icon cards (ADR 0010): no photographs of graves or cemetery grounds. */
export default function LayananKedukaanPage() {
  return (
    <ContentPage title="Layanan Kedukaan" lead="Kami bantu keluarga mengurus kebutuhan di hari-hari duka, dari penjemputan jenazah sampai bunga duka cita.">
      <ul className="grid gap-4 sm:grid-cols-2">
        {layananKedukaanValues.map((jenis) => {
          const konten = kontenKedukaan[jenis];
          return (
            <li key={jenis}>
              <Link href={hrefKedukaan(jenis)} className="flex h-full items-start gap-4 rounded-2xl border bg-card p-5 hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50">
                <IkonKedukaanBulat nama={konten.ikon} />
                <span className="flex flex-col gap-1">
                  <span className="text-title-3 font-semibold">{konten.judul}</span>
                  <span className="text-body text-muted-foreground">{konten.ringkas}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-body-lg">
        Merencanakan lebih awal?{" "}
        <Link href={hrefKedukaan("konsultasi")} className="font-semibold text-primary underline underline-offset-2">
          Minta Konsultasi Rencana Pemakaman
        </Link>
        .
      </p>
    </ContentPage>
  );
}

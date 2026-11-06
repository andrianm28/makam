import Link from "next/link";
import { ContentPage, Eyebrow, PageHero } from "@/components/site/content-page";
import { judulBagian, pilUtama } from "@/components/site/gaya";
import { KartuCs } from "@/components/site/kartu-cs";
import { cn } from "@/lib/utils";
import { IkonKedukaanBulat } from "@/components/site/ikon-kedukaan";
import { labelStatusKedukaan } from "@/domain/kedukaan/skema";
import { hrefKedukaan, type KontenKedukaan } from "@/lib/kedukaan-konten";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { kirimKodeMasuk } from "../masuk/actions";
import { FormKedukaan } from "./form";

/**
 * One Layanan Kedukaan's page, or the Konsultasi Rencana Pemakaman's (ADR 0010): what it covers, what we
 * ask, how it goes, and the request form. With `?nomor=` the family's own Permintaan is confirmed.
 */
export async function HalamanKedukaan({ konten, nomor }: { konten: KontenKedukaan; nomor?: string }) {
  const { kedukaan, operatorSettings } = serverRuntime();
  const actor = await currentActor();
  const halaman = hrefKedukaan(konten.jenis);

  if (nomor && actor) {
    const permintaan = (await kedukaan.milikSaya(actor.accountId)).find((satu) => satu.nomor === nomor);
    if (permintaan) {
      return (
        <ContentPage title="Permintaan diterima" lead={`Nomor Permintaan Anda ${permintaan.nomor}.`}>
          <p className="text-xl">
            <span className="font-bold">Status: {labelStatusKedukaan[permintaan.status]}.</span>{" "}
            {konten.jenis === "konsultasi"
              ? "Tim kami menelepon Anda pada waktu yang Anda pilih, paling lambat satu hari kerja."
              : "Tim kami segera menelepon Anda untuk mengatur layanan dan menyampaikan biayanya."}
          </p>
          <p className="text-xl">Kami mengirim kabar ke {actor.email} setiap kali statusnya berubah.</p>
          <Link href="/akun/kedukaan" className={cn(pilUtama, "w-fit")}>
            Lihat di Akun Saya
          </Link>
        </ContentPage>
      );
    }
  }

  const pengaturan = await operatorSettings.current();
  const csContact = pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null;
  const langkah = [
    `Isi permintaan di bawah. Yang kami tanyakan: ${konten.ditanyakan.join(", ").toLowerCase()}.`,
    "Tim kami menelepon Anda, memastikan kebutuhan, dan menyampaikan biayanya sebelum apa pun diatur.",
    "Setelah Anda setuju, kami atur layanannya dan kabarnya tampil di Akun Saya.",
  ];
  return (
    <main className="flex w-full flex-1 flex-col">
      <PageHero
        eyebrow={konten.jenis === "konsultasi" ? "Rencanakan lebih awal" : "Layanan Kedukaan"}
        title={konten.judul}
        lead={konten.lead}
        poin={konten.cakupan}
        samping={<KartuCs contact={csContact} />}
      >
        <a href="#minta" className={pilUtama}>
          {konten.jenis === "konsultasi" ? "Minta dihubungi" : "Minta layanan ini"}
        </a>
      </PageHero>
      <div className="mx-auto flex w-full max-w-(--page-max-width) flex-col gap-16 px-(--page-gutter) py-14 md:py-20">
        <section aria-labelledby="cara" className="flex flex-col gap-8">
          <div className="flex items-center gap-5">
            <IkonKedukaanBulat nama={konten.ikon} besar />
            <div className="flex flex-col gap-2">
              <Eyebrow>Langkahnya</Eyebrow>
              <h2 id="cara" className={judulBagian}>
                Caranya
              </h2>
            </div>
          </div>
          <ol className="grid gap-6 md:grid-cols-3">
            {langkah.map((satu, index) => (
              <li key={satu} className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-7 shadow-md">
                <span className="inline-flex size-12 items-center justify-center rounded-full bg-brand-soft font-heading text-xl font-extrabold text-forest" aria-hidden>
                  {index + 1}
                </span>
                <p className="text-lg text-foreground">{satu}</p>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="minta-judul" id="minta" className="mx-auto flex w-full max-w-3xl scroll-mt-28 flex-col gap-6 rounded-3xl border border-border bg-card p-7 shadow-lg md:p-10">
          <div className="flex flex-col gap-2">
            <Eyebrow>Permintaan</Eyebrow>
            <h2 id="minta-judul" className={judulBagian}>
              {konten.jenis === "konsultasi" ? "Minta dihubungi" : "Minta layanan ini"}
            </h2>
          </div>
          <FormKedukaan
            jenis={konten.jenis}
            halaman={halaman}
            sudahMasuk={actor !== null}
            emailMasuk={actor?.email ?? ""}
            mintaKodeMasuk={kirimKodeMasuk}
            csContact={csContact}
          />
        </section>
      </div>
    </main>
  );
}

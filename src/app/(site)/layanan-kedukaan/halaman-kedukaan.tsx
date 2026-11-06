import Link from "next/link";
import { ContentPage } from "@/components/site/content-page";
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
          <Link href="/akun/kedukaan" className="inline-flex h-14 w-fit items-center rounded-xl bg-primary px-8 text-lg font-bold text-primary-foreground hover:bg-primary/90">
            Lihat di Akun Saya
          </Link>
        </ContentPage>
      );
    }
  }

  const pengaturan = await operatorSettings.current();
  return (
    <ContentPage title={konten.judul} lead={konten.lead}>
      <div className="flex items-start gap-5 rounded-2xl bg-forest p-7 text-ivory md:p-9">
        <IkonKedukaanBulat nama={konten.ikon} besar />
        <ul className="flex list-disc flex-col gap-2 pl-5 text-lg font-medium md:text-xl">
          {konten.cakupan.map((satu) => (
            <li key={satu}>{satu}</li>
          ))}
        </ul>
      </div>
      <section aria-labelledby="cara" className="flex flex-col gap-3">
        <h2 id="cara" className="font-heading text-3xl font-extrabold tracking-tight text-forest md:text-5xl">
          Caranya
        </h2>
        <ol className="flex list-decimal flex-col gap-3 pl-6 text-lg">
          <li>Isi permintaan di bawah. Yang kami tanyakan: {konten.ditanyakan.join(", ").toLowerCase()}.</li>
          <li>Tim kami menelepon Anda, memastikan kebutuhan, dan menyampaikan biayanya sebelum apa pun diatur.</li>
          <li>Setelah Anda setuju, kami atur layanannya dan kabarnya tampil di Akun Saya.</li>
        </ol>
        {pengaturan ? (
          <p className="text-lg font-semibold">
            Butuh bantuan segera? Hubungi kami lewat WhatsApp {pengaturan.csWhatsApp}.
          </p>
        ) : null}
      </section>
      <section aria-labelledby="minta" className="flex flex-col gap-4">
        <h2 id="minta" className="font-heading text-3xl font-extrabold tracking-tight text-forest md:text-5xl">
          {konten.jenis === "konsultasi" ? "Minta dihubungi" : "Minta layanan ini"}
        </h2>
        <FormKedukaan
          jenis={konten.jenis}
          halaman={halaman}
          sudahMasuk={actor !== null}
          emailMasuk={actor?.email ?? ""}
          mintaKodeMasuk={kirimKodeMasuk}
          csContact={pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null}
        />
      </section>
    </ContentPage>
  );
}

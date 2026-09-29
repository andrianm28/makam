import type { Metadata } from "next";
import Link from "next/link";
import { kirimKodeMasuk } from "@/app/(site)/masuk/actions";
import { CsLink } from "@/components/site/cs-link";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { FormPesananTpu } from "./form-tpu";
import { tampilanPesananTpu } from "./tampilan";

// Per request: the offers and their DKI prices come from the database at that moment, and a build must never need one.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pesan Layanan di TPU DKI | Makam.co.id",
  description: "Pesan bunga, batu nisan, pembersihan dan perawatan untuk makam di TPU DKI, dengan harga TPU DKI dan Mitra Jasa yang mengerjakannya.",
  robots: { index: false, follow: true },
};

/**
 * The TPU Layanan checkout (spec, Layanan > Order; story 85): a family describes a
 * grave at a DKI TPU — which block and number, whose it is, an optional photo and pin —
 * and orders Layanan for it at the DKI prices, pay first. A Mitra Jasa does the work.
 * Anyone may order for a grave somebody else holds, so nothing here asks whose it is.
 */
export default async function PesanLayananTpuPage() {
  const actor = await currentActor();
  const pengaturan = await serverRuntime().operatorSettings.current();
  const tampilan = await tampilanPesananTpu(actor ? { nama: "", email: actor.email, telepon: actor.phoneNumber ?? "" } : null);
  const contact = pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-(--page-gutter) py-10 md:py-14">
      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-title-1 font-semibold tracking-tight text-balance">Pesan Layanan di TPU DKI</h1>
        <p className="text-body-lg text-muted-foreground">
          Ceritakan makamnya, pilih layanan dan tanggal targetnya, lalu bayar. Mitra Jasa kami mengerjakannya dan Anda menerima foto buktinya.
        </p>
        <p className="text-small text-muted-foreground">
          Makam di Lokasi Mitra?{" "}
          <Link href="/layanan" className="font-medium text-brand underline underline-offset-4">
            Pesan lewat pencarian makam
          </Link>
        </p>
      </header>

      {tampilan.layanan.length > 0 ? (
        <FormPesananTpu tampilan={tampilan} sudahMasuk={actor !== null} mintaKodeMasuk={kirimKodeMasuk} csContact={contact} />
      ) : (
        <p className="rounded-lg bg-warning-soft p-3 text-body text-warning-soft-foreground">
          Layanan di TPU DKI belum tersedia. <CsLink contact={contact} className="underline" label="Tanya CS" />
        </p>
      )}
    </main>
  );
}

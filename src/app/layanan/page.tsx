import type { Metadata } from "next";
import Link from "next/link";
import { kirimKodeMasuk } from "@/app/(site)/masuk/actions";
import { CsLink } from "@/components/site/cs-link";
import { HUB_PATH } from "@/lib/makam-keluarga-content";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { FormPesananLayanan } from "./form-pesanan";
import { tampilanPesananLayanan } from "./tampilan";

// Per request: the offers, their prices and the grave's state come from the database at
// that moment, and a build must never need one.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pesan Layanan Makam | Makam.co.id",
  description: "Pesan bunga, batu nisan, pembersihan dan perawatan makam di Lokasi Mitra, untuk petak mana pun yang sudah Anda ketahui.",
  robots: { index: false, follow: true },
};

/**
 * The order Layanan checkout (spec, Layanan > Order; the Makam keluarga hub's
 * "Layanan Makam" branch, which reaches it with the grave the lookup named).
 *
 * The family arrives here from the hub, so the grave is already chosen; the page
 * says what the order is for and offers the Layanan that Lokasi Mitra actually
 * sells. Anyone may order for a grave somebody else holds, so nothing here asks
 * whose Hak Pakai it is.
 */
export default async function PesanLayananPage({ searchParams }: PageProps<"/layanan">) {
  const params = await searchParams;
  const actor = await currentActor();
  const pengaturan = await serverRuntime().operatorSettings.current();
  const tampilan = await tampilanPesananLayanan(
    params,
    actor ? { nama: "", email: actor.email, telepon: actor.phoneNumber ?? "" } : null,
  );
  const contact = pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-(--page-gutter) py-10 md:py-14">
      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-title-1 font-semibold tracking-tight text-balance">Pesan Layanan Makam</h1>
        <p className="text-body-lg text-muted-foreground">
          Pilih layanan untuk petak ini, tentukan tanggal targetnya, lalu bayar. Lokasi Mitra mengerjakannya.
        </p>
      </header>

      {tampilan.lokasi && tampilan.petak ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-body text-muted-foreground">Untuk</p>
          <p className="text-body font-semibold">
            {tampilan.lokasi.name} · Petak {tampilan.petak.nomor}
          </p>
          {tampilan.petak.perluVerifikasi ? (
            <p className="mt-2 rounded-lg bg-warning-soft p-3 text-body text-warning-soft-foreground">
              Data Hak Pakai di petak ini belum dilengkapi Lokasi Mitra. Pesanan tetap bisa dibuat, tapi pekerjaan baru dijadwalkan setelah Lokasi Mitra
              melengkapinya.
            </p>
          ) : null}
        </div>
      ) : null}

      {tampilan.status === "lokasi_tidak_terbuka" ? (
        <p className="rounded-lg bg-warning-soft p-3 text-body text-warning-soft-foreground">
          Lokasi Mitra ini sedang tidak menerima pesanan layanan.{" "}
          <CsLink contact={contact} className="underline" label="Tanya CS" />
        </p>
      ) : null}
      {tampilan.status === "grave_tidak_ditemukan" || tampilan.status === "hak_pakai_berakhir" ? (
        <p className="rounded-lg bg-warning-soft p-3 text-body text-warning-soft-foreground">
          {tampilan.status === "hak_pakai_berakhir"
            ? "Hak Pakai di petak ini sudah berakhir atau sudah dikembalikan, jadi layanan tidak bisa dipesan. Hubungi pengelola Lokasi Mitra."
            : "Makam ini tidak ditemukan. "}
          <Link href={HUB_PATH} className="font-medium underline underline-offset-4">
            Cari ulang lewat Makam Keluarga
          </Link>
        </p>
      ) : null}

      {tampilan.status === "siap" && !tampilan.lokasi ? (
        <section className="flex flex-col gap-3">
          <p className="text-body text-muted-foreground">
            Cari dulu di mana makamnya, lalu pesan layanan untuk petak itu.{" "}
            <Link href={`${HUB_PATH}?aksi=layanan`} className="font-medium text-brand underline underline-offset-4">
              Buka Makam Keluarga
            </Link>
          </p>
        </section>
      ) : null}

      {tampilan.lokasi && tampilan.petak && tampilan.layanan.length > 0 ? (
        <FormPesananLayanan
          tampilan={tampilan}
          sudahMasuk={actor !== null}
          mintaKodeMasuk={kirimKodeMasuk}
          csContact={contact}
        />
      ) : null}

      {tampilan.lokasi && tampilan.petak && tampilan.layanan.length === 0 ? (
        <p className="rounded-lg bg-warning-soft p-3 text-body text-warning-soft-foreground">
          Lokasi Mitra ini belum menawarkan layanan apa pun.{" "}
          <CsLink contact={contact} className="underline" label="Tanya CS" />
        </p>
      ) : null}
    </main>
  );
}

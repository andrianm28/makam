import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CsLink } from "@/components/site/cs-link";
import { BERKAS_PERMOHONAN_MAX_BYTES, berkasUntukJalur, jalurManual } from "@/domain/perpanjangan";
import { catatanPerpanjanganText } from "@/lib/perpanjangan-labels";
import { jalurJudul, jalurPenjelasan } from "@/lib/permohonan-labels";
import { cn } from "@/lib/utils";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { BerkasForm } from "./berkas-form";

export const metadata: Metadata = {
  title: "Perpanjang lewat berkas · Makam.co.id",
  // The address names one Hak Pakai: never indexed, never followed.
  robots: { index: false, follow: false },
};

const paramsSchema = z.object({ hakPakaiId: z.uuid() });
const querySchema = z.object({ jalur: z.enum(jalurManual).optional() });

const catatanLabel = {
  ktp: "Catatan untuk Admin Lokasi (boleh dikosongkan)",
  ahli_waris: "Hubungan Anda dengan Pemegang Hak dan Almarhum",
  klaim: "Hubungan Anda dengan Almarhum",
} as const;

/**
 * The manual paths into a Perpanjangan (spec, domain module 7): a KTP, an heir's
 * combined request or a claim, each collecting its own documents for the Admin
 * Lokasi of the Lokasi Mitra to check. Which paths fit this Hak Pakai, and
 * whether it can be extended at all, is the Perpanjangan module's to say.
 */
export default async function BerkasPerpanjanganPage({ params, searchParams }: PageProps<"/perpanjangan/[hakPakaiId]/berkas">) {
  const id = paramsSchema.safeParse(await params);
  if (!id.success) notFound();
  const query = querySchema.catch({}).parse(await searchParams);
  const { perpanjangan, operatorSettings } = serverRuntime();
  const actor = await currentActor();
  const status = await perpanjangan.statusManual(id.data.hakPakaiId);
  const settings = await operatorSettings.current();
  const contact = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;
  const kembali = `/perpanjangan/${id.data.hakPakaiId}`;

  if (!status.boleh) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-(--page-gutter) py-10 md:py-14">
        <h1 className="font-serif text-title-1 font-semibold tracking-tight text-balance">Perpanjang lewat berkas</h1>
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <p className="text-body">{catatanPerpanjanganText(status.catatan)}</p>
          <CsLink contact={contact} className="text-body" label="Tanya CS" />
        </section>
      </main>
    );
  }

  const jalur = query.jalur && status.jalurTersedia.includes(query.jalur) ? query.jalur : status.jalurTersedia[0]!;
  const permohonanSaya = actor ? (await perpanjangan.permohonanSaya({ accountId: actor.accountId })).filter((satu) => satu.hakPakaiId === status.hakPakaiId) : [];
  const berjalan = permohonanSaya.find((satu) => satu.status === "diajukan" || satu.status === "perlu_perbaikan" || satu.dapatDipesan);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-(--page-gutter) py-10 md:py-14">
      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-title-1 font-semibold tracking-tight text-balance">Perpanjang lewat berkas</h1>
        <p className="text-body-lg text-muted-foreground">
          {status.lokasiName} · {status.petakNomor}
        </p>
      </header>

      {berjalan ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <p className="text-body">Anda sudah punya permohonan untuk Hak Pakai ini.</p>
          <Link href={`/perpanjangan/permohonan/${berjalan.id}`} className="font-medium text-brand underline underline-offset-4">
            Lihat permohonan
          </Link>
        </section>
      ) : !actor ? (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <p className="text-body">
            Masuk dulu dengan Kode Masuk ke email Anda. Email itulah yang dicatat pada Hak Pakai ini bila permohonan disetujui, dan tempat Tagihan dikirim.
          </p>
          <Link href="/masuk" className="font-medium text-brand underline underline-offset-4">
            Masuk dengan Kode Masuk
          </Link>
        </section>
      ) : (
        <>
          {status.jalurTersedia.length > 1 ? (
            <nav aria-label="Jalur permohonan" className="flex flex-wrap gap-2">
              {status.jalurTersedia.map((satu) => (
                <Link
                  key={satu}
                  href={`${kembali}/berkas?jalur=${satu}`}
                  aria-current={satu === jalur ? "page" : undefined}
                  className={cn("rounded-lg border px-3 py-2 text-sm font-medium", satu === jalur ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted-foreground")}
                >
                  {jalurJudul[satu]}
                </Link>
              ))}
            </nav>
          ) : null}
          <p className="text-body text-muted-foreground">{jalurPenjelasan[jalur]}</p>
          <BerkasForm
            key={jalur}
            hakPakaiId={status.hakPakaiId}
            jalur={jalur}
            berkas={[...berkasUntukJalur(jalur)]}
            batasMb={BERKAS_PERMOHONAN_MAX_BYTES / (1024 * 1024)}
            catatanLabel={catatanLabel[jalur]}
            namaAwal=""
          />
        </>
      )}
      <Link href={kembali} className="text-body text-muted-foreground underline underline-offset-4">
        Kembali ke Perpanjang Makam
      </Link>
    </main>
  );
}

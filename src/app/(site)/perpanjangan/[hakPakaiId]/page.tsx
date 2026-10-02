import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { opsiLayananView } from "@/components/layanan/opsi-view";
import { TambahLayananPerpanjangan, type OpsiTambahLayanan } from "@/components/layanan/tambah-layanan-perpanjangan";
import { CsLink } from "@/components/site/cs-link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OpsiMasa, StatusPerpanjangan } from "@/domain/perpanjangan";
import { documentPagePath } from "@/lib/document-links";
import { catatanPerpanjanganText } from "@/lib/perpanjangan-labels";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal } from "@/lib/time/jakarta";
import { currentActor } from "@/server/session";
import { serverRuntime } from "@/server/runtime";
import { kirimKodePerpanjangan, pesanPerpanjangan, verifikasiKodePerpanjangan } from "./actions";

export const metadata: Metadata = {
  title: "Perpanjang Makam · Makam.co.id",
  // The address names one Hak Pakai: never indexed, never followed.
  robots: { index: false, follow: false },
};

const paramsSchema = z.object({ hakPakaiId: z.uuid() });
const querySchema = z.object({ kode: z.literal("terkirim").optional(), galat: z.string().max(400).optional() });

/**
 * Perpanjangan of one Hak Pakai at a Lokasi Mitra (spec, domain module 7): the
 * note that replaces the button when it cannot be ordered, otherwise the way to
 * prove the holder (a code to the email recorded on the Hak Pakai, skipped for
 * the Akun holding that Email Terverifikasi), the choice of 1..K terms with the
 * price, and on to the Tagihan. Everything it says was decided by the
 * Perpanjangan module; the recorded email is never on this page, only masked.
 */
export default async function PerpanjanganPage({ params, searchParams }: PageProps<"/perpanjangan/[hakPakaiId]">) {
  const id = paramsSchema.safeParse(await params);
  if (!id.success) notFound();
  const query = querySchema.catch({}).parse(await searchParams);
  const { perpanjangan, operatorSettings } = serverRuntime();
  const actor = await currentActor();
  const dengan = actor ? { accountId: actor.accountId, email: actor.email } : null;
  const status = await perpanjangan.status(id.data.hakPakaiId, dengan);
  const tawaran = status.boleh && !status.tagihanTerbuka && status.jalur !== "tanpa_email" ? await perpanjangan.tawaran(id.data.hakPakaiId) : null;
  const layananTawaran = tawaran && tawaran.ok ? await perpanjangan.penawaranLayanan(id.data.hakPakaiId) : null;
  const settings = await operatorSettings.current();
  const contact = settings ? { whatsApp: settings.csWhatsApp, replyHours: settings.csReplyHours } : null;
  // A request the family already filed on this Hak Pakai (KTP, heir or claim), still open or approved and unspent.
  const permohonan = dengan ? (await perpanjangan.permohonanSaya(dengan)).find((satu) => satu.hakPakaiId === id.data.hakPakaiId && (satu.status === "diajukan" || satu.status === "perlu_perbaikan" || satu.dapatDipesan)) : undefined;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-(--page-gutter) py-10 md:py-14">
      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-title-1 font-semibold tracking-tight text-balance">Perpanjang Makam</h1>
        {status.boleh ? (
          <p className="text-body-lg text-muted-foreground">
            {status.lokasiName} · {status.petakNomor} · berlaku sampai {formatTanggal(status.endDate)}
          </p>
        ) : null}
      </header>

      {query.galat ? (
        <p role="alert" className="rounded-lg border border-destructive/40 px-4 py-3 text-body text-destructive">
          {query.galat}
        </p>
      ) : null}

      {permohonan ? (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <p className="text-body">Anda sudah mengajukan permohonan lewat berkas untuk Hak Pakai ini.</p>
          <Link href={`/perpanjangan/permohonan/${permohonan.id}`} className="font-medium text-brand underline underline-offset-4">
            Lihat permohonan
          </Link>
        </section>
      ) : null}

      {status.boleh ? (
        <Buka
          status={status}
          opsi={tawaran && tawaran.ok ? tawaran.opsi : []}
          opsiLayanan={layananTawaran && layananTawaran.ok ? layananTawaran.opsi.map(opsiLayananView) : []}
          tawaranDitolak={tawaran !== null && !tawaran.ok}
          masuk={actor !== null}
          kodeTerkirim={query.kode === "terkirim"}
          contact={contact}
        />
      ) : (
        <Catatan status={status} contact={contact} hakPakaiId={id.data.hakPakaiId} />
      )}
    </main>
  );
}

/** The note that replaces the button, with a pay link when an overdue Tagihan is what blocks it. */
function Catatan({
  status,
  contact,
  hakPakaiId,
}: {
  status: Extract<StatusPerpanjangan, { boleh: false }>;
  contact: { whatsApp: string; replyHours: string } | null;
  hakPakaiId: string;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <p className="text-body">{catatanPerpanjanganText(status.catatan)}</p>
      {status.catatan.kind === "lunasi_tagihan" ? (
        <Link href={documentPagePath(status.catatan.link)} className="font-medium text-brand underline underline-offset-4">
          Buka Tagihan untuk dibayar
        </Link>
      ) : null}
      {status.catatan.kind === "hubungi_admin_lokasi" && status.catatan.sebab === "perlu_verifikasi" ? (
        // A Hak Pakai the Admin Lokasi still has to complete is exactly what a claim by documents resolves.
        <Link href={`/perpanjangan/${hakPakaiId}/berkas`} className="font-medium text-brand underline underline-offset-4">
          Ajukan lewat berkas
        </Link>
      ) : null}
      <CsLink contact={contact} className="text-body" label="Tanya CS" />
    </section>
  );
}

function Buka({
  status,
  opsi,
  opsiLayanan,
  tawaranDitolak,
  masuk,
  kodeTerkirim,
  contact,
}: {
  status: Extract<StatusPerpanjangan, { boleh: true }>;
  opsi: OpsiMasa[];
  opsiLayanan: OpsiTambahLayanan[];
  tawaranDitolak: boolean;
  masuk: boolean;
  kodeTerkirim: boolean;
  contact: { whatsApp: string; replyHours: string } | null;
}) {
  if (status.tagihanTerbuka) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <p className="text-body">
          Perpanjangan ini sudah punya Tagihan {status.tagihanTerbuka.nomorTagihan}, jatuh tempo {formatTanggal(status.tagihanTerbuka.dueAt.toISOString().slice(0, 10))}. Siapa pun boleh
          membayarnya untuk Pemegang Hak.
        </p>
        <Link href={documentPagePath(status.tagihanTerbuka.link)} className="font-medium text-brand underline underline-offset-4">
          Buka Tagihan
        </Link>
      </section>
    );
  }
  if (status.jalur === "tanpa_email") {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <p className="text-body">
          Hak Pakai ini tidak punya email tercatat, jadi kodenya tidak bisa dikirim. Perpanjangan diajukan lewat berkas (KTP, atau bukti ahli waris) yang diperiksa Admin Lokasi.
        </p>
        <Link href={`/perpanjangan/${status.hakPakaiId}/berkas`} className={buttonVariants({ size: "lg" })}>
          Ajukan lewat berkas
        </Link>
        <CsLink contact={contact} className="text-body" label="Minta bantuan CS" />
      </section>
    );
  }
  if (tawaranDitolak || opsi.length === 0) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <p className="text-body">Perpanjangan ini belum bisa dipesan lewat situs. Silakan hubungi CS.</p>
        <CsLink contact={contact} className="text-body" label="Tanya CS" />
      </section>
    );
  }
  const pilihan = (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Jumlah masa ({status.tenureYears} tahun per masa)</legend>
      {opsi.map((satu, index) => (
        <label key={satu.terms} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
          <input type="radio" name="terms" value={satu.terms} defaultChecked={index === 0} className="mt-1" />
          <span className="flex flex-col">
            <span className="font-medium">
              {satu.terms} masa · {formatRupiah(satu.total)}
            </span>
            <span className="text-muted-foreground">Berlaku sampai {formatTanggal(satu.endDateBaru)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );

  if (status.jalur === "sudah_masuk" && masuk) {
    return (
      <form action={pesanPerpanjangan} className="flex flex-col gap-4">
        <input type="hidden" name="hakPakaiId" value={status.hakPakaiId} />
        {pilihan}
        <TambahLayananPerpanjangan opsi={opsiLayanan} />
        <Button type="submit" size="lg">
          Lanjut ke Tagihan
        </Button>
        <p className="text-small text-muted-foreground">Tagihan dibayar sebelum jatuh tempo (3 x 24 jam); bila tidak, Tagihan batal dengan sendirinya. Masa berlaku dihitung dari tanggal berakhir sekarang.</p>
      </form>
    );
  }
  if (!kodeTerkirim) {
    return (
      <form action={kirimKodePerpanjangan} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <input type="hidden" name="hakPakaiId" value={status.hakPakaiId} />
        <p className="text-body">
          Untuk memastikan Anda Pemegang Hak, kami kirim kode 6 angka ke email yang tercatat pada Hak Pakai ini ({status.emailDisamarkan}).
        </p>
        <Button type="submit" size="lg">
          Kirim kode
        </Button>
        <Link href={`/perpanjangan/${status.hakPakaiId}/berkas`} className="font-medium text-brand underline underline-offset-4">
          Email sudah tidak dipakai? Ajukan lewat KTP atau berkas lain
        </Link>
        <CsLink contact={contact} className="text-body" label="Atau minta bantuan CS" />
      </form>
    );
  }
  return (
    <form action={verifikasiKodePerpanjangan} className="flex flex-col gap-4">
      <input type="hidden" name="hakPakaiId" value={status.hakPakaiId} />
      <p className="text-body">Kode sudah dikirim ke {status.emailDisamarkan}. Masukkan kode itu; setelah itu Anda memilih jumlah masa dan melanjutkan ke Tagihan.</p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Kode 6 angka
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="h-11 px-3" />
      </label>
      <Button type="submit" size="lg">
        Masukkan kode
      </Button>
    </form>
  );
}

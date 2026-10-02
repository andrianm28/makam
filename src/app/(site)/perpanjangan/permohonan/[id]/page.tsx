import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { StatusBadge } from "@/components/makam/status-badge";
import { berkasUntukJalur, JALUR_LABEL } from "@/domain/perpanjangan";
import { documentPagePath } from "@/lib/document-links";
import { jalurPenjelasan, statusPermohonanText } from "@/lib/permohonan-labels";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal, formatTanggalJam, wibDateOf } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { opsiLayananView } from "@/components/layanan/opsi-view";
import { BatalkanForm, PerbaikiForm, PesanForm } from "./permohonan-forms";

export const metadata: Metadata = {
  title: "Permohonan Perpanjangan · Makam.co.id",
  // One family's request with its documents: never indexed, never followed.
  robots: { index: false, follow: false },
};

const paramsSchema = z.object({ id: z.uuid() });

/**
 * One manual Perpanjangan request (KTP, heir or claim), for the Akun that filed it and
 * nobody else: where it stands, what the Admin Lokasi asked to fix, and, once approved,
 * the choice of terms that leads to the Tagihan (valid 30 days from the approval).
 */
export default async function PermohonanPerpanjanganPage({ params }: PageProps<"/perpanjangan/permohonan/[id]">) {
  const id = paramsSchema.safeParse(await params);
  if (!id.success) notFound();
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  const { perpanjangan } = serverRuntime();
  const pemohon = { accountId: actor.accountId, email: actor.email };
  const permohonan = await perpanjangan.permohonanOf(pemohon, id.data.id);
  if (!permohonan) notFound();

  const menunggu = permohonan.status === "diajukan";
  const perluPerbaikan = permohonan.status === "perlu_perbaikan";
  const tawaran = permohonan.dapatDipesan ? await perpanjangan.tawaran(permohonan.hakPakaiId) : null;
  const layananTawaran = tawaran && tawaran.ok ? await perpanjangan.penawaranLayanan(permohonan.hakPakaiId) : { ok: false as const };
  const status = permohonan.dapatDipesan ? await perpanjangan.status(permohonan.hakPakaiId, pemohon) : null;
  const tagihanTerbuka = status && status.boleh ? status.tagihanTerbuka : null;
  const kedaluwarsa = permohonan.masaPersetujuan === "kedaluwarsa";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-(--page-gutter) py-10 md:py-14">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-title-1 font-semibold tracking-tight text-balance">Permohonan Perpanjangan</h1>
          <StatusBadge status={permohonan.status} />
        </div>
        <p className="text-body-lg text-muted-foreground">
          {permohonan.lokasiName} · {permohonan.petakNomor} · {JALUR_LABEL[permohonan.jalur]}
        </p>
        <p className="text-body">{statusPermohonanText[permohonan.status]}</p>
      </header>

      {permohonan.alasan && (perluPerbaikan || permohonan.status === "ditolak") ? (
        <section className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
          <h2 className="text-body font-semibold">{perluPerbaikan ? "Yang perlu diperbaiki" : "Alasan penolakan"}</h2>
          <p className="text-body" data-testid="alasan-permohonan">
            {permohonan.alasan}
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <h2 className="text-body font-semibold">Yang Anda ajukan</h2>
        <p className="text-body">
          {permohonan.nama} · {permohonan.nomorTelepon}
        </p>
        <p className="text-small text-muted-foreground">{jalurPenjelasan[permohonan.jalur]}</p>
        <ul className="flex flex-col gap-1 text-body">
          {permohonan.berkas.map((satu) => (
            <li key={satu.kunci}>
              {satu.label} · diunggah {formatTanggalJam(satu.diunggahPada)}
            </li>
          ))}
        </ul>
        {menunggu && permohonan.tenggatPada ? <p className="text-small text-muted-foreground">Admin Lokasi memeriksa paling lambat {formatTanggalJam(permohonan.tenggatPada)}.</p> : null}
      </section>

      {perluPerbaikan ? (
        <section className="flex flex-col gap-4">
          <PerbaikiForm permohonanId={permohonan.id} berkas={berkasUntukJalur(permohonan.jalur).map((satu) => ({ kunci: satu.kunci, label: satu.label }))} />
          <BatalkanForm permohonanId={permohonan.id} />
        </section>
      ) : null}
      {menunggu ? <BatalkanForm permohonanId={permohonan.id} /> : null}

      {permohonan.dapatDipesan && permohonan.berlakuSampai ? (
        <section className="flex flex-col gap-4">
          <p className="text-body">Persetujuan berlaku sampai {formatTanggal(wibDateOf(permohonan.berlakuSampai))}. Dalam waktu itu Anda tidak perlu mengunggah ulang bila Tagihan pertama batal.</p>
          {tagihanTerbuka ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
              <p className="text-body">
                Tagihan {tagihanTerbuka.nomorTagihan} menunggu pembayaran, jatuh tempo {formatTanggalJam(tagihanTerbuka.dueAt)}. Siapa pun boleh membayarnya untuk Pemegang Hak.
              </p>
              <Link href={documentPagePath(tagihanTerbuka.link)} className="font-medium text-brand underline underline-offset-4">
                Buka Tagihan
              </Link>
            </div>
          ) : tawaran && tawaran.ok ? (
            <PesanForm
              permohonanId={permohonan.id}
              opsiLayanan={layananTawaran.ok ? layananTawaran.opsi.map(opsiLayananView) : []}
              opsi={tawaran.opsi.map((satu) => ({
                terms: satu.terms,
                judul: `${satu.terms} masa · ${formatRupiah(satu.total)}`,
                keterangan: `Berlaku sampai ${formatTanggal(satu.endDateBaru)}`,
              }))}
            />
          ) : (
            <p className="text-body">Perpanjangan ini belum bisa dipesan lewat situs sekarang. Silakan hubungi Admin Lokasi.</p>
          )}
        </section>
      ) : null}

      {kedaluwarsa ? (
        <p className="text-body">
          Persetujuan ini sudah lewat 30 hari.{" "}
          <Link href={`/perpanjangan/${permohonan.hakPakaiId}/berkas`} className="font-medium text-brand underline underline-offset-4">
            Ajukan permohonan baru
          </Link>
        </p>
      ) : null}
      {permohonan.masaPersetujuan === "terpakai" ? <p className="text-body">Persetujuan ini sudah dipakai: Perpanjangannya sudah dibayar.</p> : null}
      {permohonan.status === "ditolak" || permohonan.status === "dibatalkan" ? (
        <Link href={`/perpanjangan/${permohonan.hakPakaiId}`} className="text-body text-muted-foreground underline underline-offset-4">
          Kembali ke Perpanjang Makam
        </Link>
      ) : null}
    </main>
  );
}

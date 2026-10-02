import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { keluhanStatusLabels, labelBuktiPekerjaan } from "@/lib/layanan-labels";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { PutuskanKeluhanTpuForm } from "./keluhan-tpu-forms";

export const metadata: Metadata = {
  title: "Keluhan pekerjaan TPU | Makam.co.id",
  robots: { index: false, follow: false },
};

/**
 * One Keluhan on a TPU job, the page the Antrean's Tier 1 "Keluhan pekerjaan TPU" row links to (spec, Layanan;
 * story 158; ticket 57): what the Pemesan wrote, the proof they were shown and when, their contact, and the one
 * decision Admin Platform makes, reject it or have it redone. The page decides nothing: the module does.
 */
export default async function KeluhanTpuPage({ params }: PageProps<"/staf/admin-platform/keluhan-tpu/[keluhanId]">) {
  const actor = await staffMenuActor("admin_platform");
  const { keluhanId } = await params;
  const hasil = await serverRuntime().layanan.keluhanTpuUntukPlatform(actor, keluhanId);
  if (!hasil.ok) notFound();
  const { keluhan, pekerjaan, bukti, ditunjukkanAt, jendelaBerakhirAt, calon } = hasil;

  return (
    <>
      <PageHeader title={`Keluhan · ${pekerjaan.label}`} description={`${pekerjaan.tpuName} · pesanan ${pekerjaan.nomor}`}>
        <p className="text-small text-muted-foreground">
          {keluhanStatusLabels[keluhan.status]} · diajukan {formatTanggalJam(keluhan.diajukanAt)} · respons pertama paling lambat {formatTanggalJam(keluhan.responPertamaDueAt)}
        </p>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Yang dikeluhkan</CardTitle>
          <CardDescription>
            Bukti ditunjukkan ke pemesan {ditunjukkanAt ? formatTanggalJam(ditunjukkanAt) : "belum"}
            {jendelaBerakhirAt ? `; batas keluhan ${formatTanggalJam(jendelaBerakhirAt)}` : ""}. Target pekerjaan {formatTanggal(pekerjaan.targetDate)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-body">&ldquo;{keluhan.alasan}&rdquo;</p>
          <p className="text-body text-muted-foreground">
            Pemesan: {pekerjaan.pemesanName}
            {pekerjaan.pemesanPhone ? ` · ${pekerjaan.pemesanPhone}` : ""}
            {pekerjaan.pemesanEmail ? ` · ${pekerjaan.pemesanEmail}` : ""}
          </p>
          {bukti.length > 0 ? (
            <ul className="flex flex-wrap gap-3">
              {bukti.map((satu) => (
                <li key={`${satu.kind}-${satu.takenAt.toISOString()}`} className="flex flex-col gap-1 text-small text-muted-foreground">
                  {satu.url && satu.kind === "video" ? (
                    <video src={satu.url} controls playsInline className="max-h-64 rounded-lg" />
                  ) : satu.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL of a private file
                    <img src={satu.url} alt={labelBuktiPekerjaan(satu.kind)} className="max-h-64 w-auto rounded-lg border border-border object-cover" />
                  ) : (
                    <span>Berkas belum bisa dibuka.</span>
                  )}
                  {labelBuktiPekerjaan(satu.kind)} · {formatTanggalJam(satu.takenAt)}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-small text-muted-foreground">
            <Link href={`/staf/admin-platform/pekerjaan-tpu/${pekerjaan.id}`} className="font-medium text-brand underline underline-offset-4">
              Buka halaman pekerjaan TPU
            </Link>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keputusan</CardTitle>
          <CardDescription>
            {keluhan.status === "terbuka"
              ? "Tolak keluhan, atau minta pekerjaan dikerjakan ulang."
              : `Keputusan: ${keluhanStatusLabels[keluhan.status]}${keluhan.diputuskanAt ? ` (${formatTanggalJam(keluhan.diputuskanAt)})` : ""}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {keluhan.status === "terbuka" ? (
            <PutuskanKeluhanTpuForm keluhanId={keluhan.id} calon={calon.map((satu) => ({ id: satu.id, namaLengkap: satu.namaLengkap }))} />
          ) : keluhan.catatanKeputusan ? (
            <p className="text-body text-muted-foreground">Catatan: {keluhan.catatanKeputusan}</p>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/makam/page-header";
import { StatusBadge } from "@/components/makam/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { keluhanStatusLabels, labelBuktiPekerjaan } from "@/lib/layanan-labels";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { PutuskanKeluhanForm, SesuaikanPencairanForm } from "./keluhan-forms";

export const metadata: Metadata = {
  title: "Keluhan | Makam.co.id",
  robots: { index: false, follow: false },
};

/**
 * One Keluhan, the page the Antrean's Tier 1 "Keluhan" row links to (spec, Layanan; story 158): what the
 * Pemesan wrote, the proof they were shown and when, their contact, their Penilaian if they gave one, and
 * the two things Admin Platform does — decide (rejected, a redo, or a refund) and, with a note, override what
 * the job pays its fulfiller. Admin Platform only.
 */
export default async function KeluhanPage({ params }: PageProps<"/staf/admin-platform/keluhan/[keluhanId]">) {
  const actor = await staffMenuActor("admin_platform");
  const { keluhanId } = await params;
  const hasil = await serverRuntime().layanan.keluhanUntukPlatform(actor, keluhanId);
  if (!hasil.ok) notFound();
  const { keluhan, pekerjaan, lokasi, petak, pesanan, pemesan, bukti, penilaian, pencairan, ditunjukkanAt, jendelaBerakhirAt } = hasil.keluhan;
  const terbuka = keluhan.status === "terbuka";

  return (
    <>
      <PageHeader
        title={`Keluhan · ${pekerjaan.label}`}
        description={`${lokasi.name} · Petak ${petak.nomor} · pesanan ${pesanan.nomor}`}
        status={<StatusBadge status={keluhan.status === "terbuka" ? "keluhan" : pekerjaan.status} />}
      >
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
            Pemesan: {pemesan.name} · {pemesan.phoneNumber} · {pemesan.email}
          </p>
          {bukti.length > 0 ? (
            <ul className="flex flex-wrap gap-3">
              {bukti.map((satu) => (
                <li key={satu.kind}>
                  {satu.url ? (
                    <a href={satu.url} target="_blank" rel="noopener" className="text-body font-medium text-brand underline underline-offset-4">
                      {labelBuktiPekerjaan(satu.kind)}
                    </a>
                  ) : (
                    <span className="text-body text-muted-foreground">{labelBuktiPekerjaan(satu.kind)} (belum bisa dibuka)</span>
                  )}
                  <span className="ml-1 text-small text-muted-foreground">{formatTanggalJam(satu.takenAt)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {pekerjaan.teks ? <p className="text-small text-muted-foreground">Catatan dari pemesan saat memesan: &ldquo;{pekerjaan.teks}&rdquo;</p> : null}
          <p className="text-small text-muted-foreground">
            <Link href={`/staf/admin-lokasi/${lokasi.id}/pekerjaan/${pekerjaan.id}`} className="font-medium text-brand underline underline-offset-4">
              Buka halaman pekerjaan di Lokasi Mitra
            </Link>
          </p>
        </CardContent>
      </Card>

      {penilaian ? (
        <Card>
          <CardHeader>
            <CardTitle>Penilaian pemesan</CardTitle>
            <CardDescription>Hanya terlihat oleh Admin Platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-body font-medium">{penilaian.bintang} dari 5 bintang</p>
            {penilaian.komentar ? <p className="text-body text-muted-foreground">&ldquo;{penilaian.komentar}&rdquo;</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Keputusan</CardTitle>
          <CardDescription>
            {terbuka
              ? "Kerjakan ulang, kembalikan dana untuk pekerjaan ini, atau tolak keluhan."
              : `Keputusan: ${keluhanStatusLabels[keluhan.status]}${keluhan.diputuskanAt ? ` (${formatTanggalJam(keluhan.diputuskanAt)})` : ""}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {terbuka ? (
            <PutuskanKeluhanForm keluhanId={keluhan.id} />
          ) : keluhan.catatanKeputusan ? (
            <p className="text-body text-muted-foreground">Catatan: {keluhan.catatanKeputusan}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pencairan pekerjaan ini</CardTitle>
          <CardDescription>
            {pencairan
              ? `Dibayarkan ${formatRupiah(pencairan.amount)} dari tarif ${formatRupiah(pencairan.amountAwal)}${pencairan.catatan ? `; catatan penyesuaian: ${pencairan.catatan}` : ""}.`
              : "Pencairan untuk pekerjaan ini belum tercatat, jadi belum bisa disesuaikan."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pencairan && (pencairan.status === "belum_jatuh_tempo" || pencairan.status === "jatuh_tempo") ? (
            <SesuaikanPencairanForm keluhanId={keluhan.id} tarif={pencairan.amountAwal} />
          ) : pencairan ? (
            <p className="text-body text-muted-foreground">Pencairan ini sudah {pencairan.status === "dicairkan" ? "ditransfer" : "dibatalkan"}, jadi tidak bisa disesuaikan.</p>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

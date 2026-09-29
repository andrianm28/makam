import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/makam/page-header";
import { StatusBadge } from "@/components/makam/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JALUR_LABEL } from "@/domain/perpanjangan";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope } from "../../../scope";
import { PutuskanForm, SetujuiForm } from "./permohonan-forms";

export const metadata: Metadata = { title: "Periksa dokumen Perpanjangan · Area Staf" };

const idSchema = z.uuid();

/**
 * One manual Perpanjangan request (KTP, heir or claim) at the Admin Lokasi's own Lokasi
 * Mitra: the applicant, the documents through short-lived links, what an approval will
 * change on the Hak Pakai, and the three ways to decide it. Another Lokasi's request is
 * nothing found here.
 */
export default async function PermohonanPerpanjanganLokasiPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/perpanjangan/[id]">) {
  const { lokasiId, id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) notFound();
  const { actor, current } = await adminLokasiScope(lokasiId);
  const permohonan = await serverRuntime().perpanjangan.permohonanUntukStaf(actor, parsed.data);
  if (!permohonan || permohonan.lokasiId !== current.id) notFound();

  const menunggu = permohonan.status === "diajukan";
  const hak = permohonan.hakPakai;
  const perluTanggal = Boolean(hak?.perluVerifikasi && hak.endDate === null);

  return (
    <>
      <PageHeader
        title="Periksa dokumen Perpanjangan"
        status={<StatusBadge status={permohonan.status} />}
        description={`${JALUR_LABEL[permohonan.jalur]} · Petak ${permohonan.petakNomor}`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Pemohon</CardTitle>
          <CardDescription>Nomor ini dan email Akun pemohon dicatat pada Hak Pakai bila permohonan disetujui.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2 text-body">
            <Baris label="Nama" value={permohonan.nama} />
            <Baris label="Telepon" value={permohonan.nomorTelepon} />
            <Baris label="Diajukan" value={formatTanggalJam(permohonan.diajukanPada)} />
            {permohonan.tenggatPada ? <Baris label="Diperiksa paling lambat" value={formatTanggalJam(permohonan.tenggatPada)} /> : null}
            {permohonan.catatan ? <Baris label="Catatan pemohon" value={permohonan.catatan} /> : null}
            {hak ? <Baris label="Pemegang Hak tercatat" value={hak.pemegangNama ?? "Belum ada"} /> : null}
            {hak ? <Baris label="Berakhir" value={hak.endDate ? formatTanggal(hak.endDate) : "Belum tercatat"} /> : null}
            {hak?.perluVerifikasi ? <Baris label="Hak Pakai" value="Perlu Verifikasi: dilengkapi dalam pemeriksaan ini" /> : null}
            {permohonan.alasan ? <Baris label="Catatan Admin Lokasi" value={permohonan.alasan} /> : null}
            {permohonan.berlakuSampai ? <Baris label="Persetujuan berlaku sampai" value={formatTanggalJam(permohonan.berlakuSampai)} /> : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dokumen</CardTitle>
          <CardDescription>Tautan berlaku beberapa menit. Buka ulang halaman ini untuk tautan baru.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-body">
            {permohonan.berkas.map((satu) => (
              <li key={satu.kunci} className="flex flex-wrap justify-between gap-2">
                <span>{satu.label}</span>
                {satu.url ? (
                  <Link href={satu.url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4">
                    Buka berkas
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Berkas tidak bisa dibuka</span>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {menunggu ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Setujui</CardTitle>
            </CardHeader>
            <CardContent>
              <SetujuiForm
                lokasiId={current.id}
                permohonanId={permohonan.id}
                ubahPemegang={permohonan.jalur === "ktp" ? "email dan nomor telepon pemohon sebagai kontak Pemegang Hak" : "pemohon sebagai Pemegang Hak baru (Pemegang Hak sebelumnya tetap tercatat di riwayat)"}
                perluTanggal={perluTanggal}
                namaAwal={permohonan.nama}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Minta perbaikan atau tolak</CardTitle>
              <CardDescription>Perbaikan mengembalikan permohonan ke pemohon; setelah diperbaiki ia muncul lagi di daftar Anda. Penolakan mengakhirinya.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <PutuskanForm lokasiId={current.id} permohonanId={permohonan.id} jenis="perbaikan" />
              <PutuskanForm lokasiId={current.id} permohonanId={permohonan.id} jenis="tolak" />
            </CardContent>
          </Card>
        </>
      ) : null}
    </>
  );
}

function Baris({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/makam/page-header";
import { StatusBadge } from "@/components/makam/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { artiStatusPermintaanHakPakai, namaPermintaanHakPakai, statusPermintaanHakPakaiBadge } from "@/lib/permintaan-hak-pakai-labels";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { currentActor } from "@/server/session";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope } from "../../../scope";
import { PerbaikanForm, SetujuiForm, TolakForm } from "./permintaan-forms";

export const metadata: Metadata = { title: "Pengembalian / Ganti Pemegang Hak · Area Staf" };

const idSchema = z.uuid();

/**
 * One Pengembalian Hak Pakai or Ganti Pemegang Hak request at the Admin Lokasi's own Lokasi Mitra (spec, Work
 * Queues; ticket 39), reached from the Antrean row: who asks, the new holder and documents of a Ganti, and the three
 * answers (setuju, tolak, kirim kembali). Another Lokasi's request is nothing found.
 */
export default async function PermintaanHakPakaiStafPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/permintaan/[id]">) {
  const { lokasiId, id } = await params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) notFound();
  const { current } = await adminLokasiScope(lokasiId);
  const actor = await currentActor();
  if (!actor) notFound();
  const permintaan = await serverRuntime().pemesanan.permintaanHakPakaiUntukStaf(actor, parsed.data);
  if (!permintaan || permintaan.lokasiId !== current.id) notFound();
  const ganti = permintaan.jenis === "ganti_pemegang_hak";
  const bisaDijawab = permintaan.status === "diajukan";

  return (
    <>
      <PageHeader title={`${namaPermintaanHakPakai(permintaan.jenis)} · ${permintaan.unitNomor}`} description={artiStatusPermintaanHakPakai(permintaan.jenis, permintaan.status)} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Permintaan <StatusBadge status={statusPermintaanHakPakaiBadge[permintaan.status]} />
          </CardTitle>
          <CardDescription>
            {permintaan.jenis === "pengembalian"
              ? "Setujui hanya bila belum ada pemakaman di petak ini. Kompensasi disepakati langsung dengan Pemegang Hak; tidak ada uang yang lewat Makam.co.id."
              : "Periksa dokumen, lalu setujui. Pemegang Hak lama tetap tercatat di riwayat dan Hak Pakai pindah ke Makam Keluarga Pemegang Hak baru."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2 text-body">
            <Baris label="Diajukan" value={formatTanggalJam(permintaan.diajukanPada)} />
            {permintaan.tenggatPada ? <Baris label="Dijawab paling lambat" value={formatTanggalJam(permintaan.tenggatPada)} /> : null}
            {permintaan.catatanPemohon ? <Baris label="Catatan Pemegang Hak" value={permintaan.catatanPemohon} /> : null}
            {permintaan.pemegangBaru ? (
              <>
                <Baris label="Pemegang Hak baru" value={permintaan.pemegangBaru.name} />
                <Baris label="Telepon" value={permintaan.pemegangBaru.phoneNumber} />
                <Baris label="Email" value={permintaan.pemegangBaru.email ?? "Belum diketahui"} />
                <Baris label="Sebab" value={permintaan.sebab === "jual" ? "Jual" : "Waris"} />
              </>
            ) : null}
            {permintaan.biayaGantiOffline !== null ? <Baris label="Biaya dipungut di luar sistem" value={formatRupiah(permintaan.biayaGantiOffline)} /> : null}
            {permintaan.alasanKeputusan ? <Baris label="Catatan keputusan" value={permintaan.alasanKeputusan} /> : null}
          </dl>
          {permintaan.dokumen.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1">
              {permintaan.dokumen.map((dokumen, indeks) => (
                <li key={dokumen.kunci}>
                  <a href={dokumen.url} target="_blank" rel="noreferrer" className="text-small underline">
                    Dokumen {indeks + 1}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {bisaDijawab ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Setujui</CardTitle>
            </CardHeader>
            <CardContent>
              <SetujuiForm lokasiId={current.id} id={permintaan.id} ganti={ganti} biayaBawaan={permintaan.aturan?.gantiPemegangHakFee ?? 0} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Kirim kembali untuk diperbaiki</CardTitle>
            </CardHeader>
            <CardContent>
              <PerbaikanForm lokasiId={current.id} id={permintaan.id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tolak</CardTitle>
            </CardHeader>
            <CardContent>
              <TolakForm lokasiId={current.id} id={permintaan.id} />
            </CardContent>
          </Card>
        </>
      ) : null}

      <Link href={`/staf/admin-lokasi/${current.id}/antrean`} className="text-small underline">
        Kembali ke Antrean
      </Link>
    </>
  );
}

function Baris({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <dt className="w-52 text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

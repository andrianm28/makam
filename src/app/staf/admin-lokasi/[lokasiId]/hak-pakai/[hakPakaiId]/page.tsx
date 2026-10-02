import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTanggal, formatTanggalJam, wibDateOf } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope } from "../../../scope";
import { AkhiriForm, PembongkaranForm } from "./forms";

export const metadata: Metadata = { title: "Hak Pakai · Area Staf" };

const idSchema = z.uuid();

const STATUS_LABEL = { aktif: "Aktif", kedaluwarsa: "Kedaluwarsa", berakhir: "Berakhir", dibatalkan: "Dibatalkan" } as const;

/**
 * One Hak Pakai at the Admin Lokasi's own Lokasi Mitra: its dates and state, and the two things the
 * Admin Lokasi alone does at its end (ending it by hand, recording the Pembongkaran). Reached from
 * the Denah's Petak and from the Antrean's "Hak Pakai dalam masa tenggang" row. Another Lokasi's
 * Hak Pakai is nothing found here.
 */
export default async function HakPakaiLokasiPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/hak-pakai/[hakPakaiId]">) {
  const { lokasiId, hakPakaiId } = await params;
  const parsed = idSchema.safeParse(hakPakaiId);
  if (!parsed.success) notFound();
  const { current } = await adminLokasiScope(lokasiId);
  const inventory = serverRuntime().inventory;
  const [hak, rincian] = await Promise.all([inventory.hakPakaiById(parsed.data), inventory.hakPakaiUntukPerpanjangan(parsed.data)]);
  if (!hak || !rincian || hak.lokasiId !== current.id) notFound();

  const unit = rincian.nomorKavling ? `Kavling ${rincian.nomorKavling}` : `Petak ${rincian.petakNomor.join(", ")}`;
  const bisaAkhiri = hak.status === "aktif" || hak.status === "kedaluwarsa";
  const bisaBongkar = hak.status === "berakhir" && !hak.pembongkaranAt;

  return (
    <>
      <PageHeader title={`Hak Pakai ${unit}`} description={`${STATUS_LABEL[hak.status]}${hak.perluVerifikasi ? " · Perlu Verifikasi" : ""}`} />
      <Card>
        <CardHeader>
          <CardTitle>Masa berlaku</CardTitle>
          <CardDescription>Setelah tanggal berakhir, Hak Pakai Kedaluwarsa dan masuk masa tenggang. Petak tetap Terisi sampai Pembongkaran dicatat.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2 text-body">
            <Baris label="Pemegang Hak" value={hak.pemegangHak?.name ?? "Belum ada"} />
            <Baris label="Berlaku" value={hak.tenureYears ? `${hak.tenureYears} tahun` : "Selamanya"} />
            <Baris label="Berakhir" value={hak.endDate ? formatTanggal(wibDateOf(hak.endDate)) : "Belum tercatat"} />
            <Baris label="Status" value={STATUS_LABEL[hak.status]} />
            {hak.endReason ? <Baris label="Alasan berakhir" value={hak.endReason} /> : null}
            {hak.pembongkaranAt ? <Baris label="Pembongkaran dicatat" value={formatTanggalJam(hak.pembongkaranAt)} /> : null}
          </dl>
        </CardContent>
      </Card>

      {bisaAkhiri ? (
        <Card>
          <CardHeader>
            <CardTitle>Akhiri Hak Pakai</CardTitle>
          </CardHeader>
          <CardContent>
            <AkhiriForm lokasiId={current.id} hakPakaiId={hak.id} />
          </CardContent>
        </Card>
      ) : null}

      {bisaBongkar ? (
        <Card>
          <CardHeader>
            <CardTitle>Pembongkaran</CardTitle>
          </CardHeader>
          <CardContent>
            <PembongkaranForm lokasiId={current.id} hakPakaiId={hak.id} />
          </CardContent>
        </Card>
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
      <dt className="w-44 text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

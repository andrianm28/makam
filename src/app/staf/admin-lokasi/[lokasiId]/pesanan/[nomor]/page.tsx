import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { StatusBadge } from "@/components/makam/status-badge";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTanggal, formatTanggalJam, wibDateTimeLocal } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope } from "../../../scope";
import { CentangDokumenForm, KonfirmasiForm } from "./pesanan-forms";

const nomorSchema = z.string().trim().regex(/^MKM-\d{4}-\d{6}$/);

export async function generateMetadata({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/pesanan/[nomor]">): Promise<Metadata> {
  const { nomor } = await params;
  const parsed = nomorSchema.safeParse(nomor);
  return { title: parsed.success ? `Pesanan ${nomor} · Area Staf` : "Pesanan tidak ditemukan · Area Staf" };
}

/**
 * One Saat Duka order at the Admin Lokasi's own Lokasi Mitra (spec, story 139: the
 * family's name, phone, email, the Almarhum and the documents, for its own
 * Lokasi's orders only): everything needed to confirm it, and the checklist to
 * tick as the documents arrive.
 */
export default async function PesananLokasiPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/pesanan/[nomor]">) {
  const { lokasiId, nomor } = await params;
  const parsed = nomorSchema.safeParse(nomor);
  if (!parsed.success) notFound();
  const { actor, current } = await adminLokasiScope(lokasiId);
  const { pemesanan, inventory } = serverRuntime();
  const order = await pemesanan.orderUntukStaf(actor, parsed.data);
  // Another Lokasi Mitra's order is nothing found here, exactly as it is nowhere else in this area.
  if (!order || order.lokasi.id !== current.id) notFound();

  const menunggu = order.status === "diajukan";
  const petak = menunggu && order.jenisMakam
    ? await inventory.tersediaUntukJenisMakam(current.id, order.jenisMakam.id)
    : [];
  const tagihan = order.tagihanId ? await serverRuntime().billing.tagihan(order.tagihanId) : null;
  const rencana = order.rencanaPemakamanAt ? wibDateTimeLocal(order.rencanaPemakamanAt) : "";

  return (
    <>
      <PageHeader
        title={`Pesanan ${order.nomor}`}
        status={<StatusBadge status={order.status} />}
        description={`${order.almarhum.name}, wafat ${formatTanggal(order.almarhum.tanggalWafat)}`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Keluarga</CardTitle>
          <CardDescription>Nomor yang bisa dihubungi pada hari pemakaman.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2 text-body">
            <Baris label="Pemesan" value={order.pemesan.name} />
            {order.pemesan.phoneNumber ? <Baris label="Telepon Pemesan" value={order.pemesan.phoneNumber} /> : null}
            {order.pemesan.email ? <Baris label="Email Pemesan" value={order.pemesan.email} /> : null}
            <Baris
              label="Pemegang Hak"
              value={
                order.pemegangHak.mode === "pemesan"
                  ? `${order.pemegangHak.name} (Pemesan)`
                  : `${order.pemegangHak.name}${order.pemegangHak.phoneNumber ? ` · ${order.pemegangHak.phoneNumber}` : ""}`
              }
            />
            <Baris label="Diajukan" value={formatTanggalJam(order.diajukanAt)} />
            {order.konfirmasiDueAt ? (
              <Baris label="Konfirmasi paling lambat" value={formatTanggalJam(order.konfirmasiDueAt)} />
            ) : null}
            {order.petakNomor ? <Baris label="Petak Makam" value={order.petakNomor} /> : null}
            {order.pemakamanAt ? <Baris label="Pemakaman" value={formatTanggalJam(order.pemakamanAt)} /> : null}
            {tagihan ? (
              <>
                <Baris label="Tagihan" value={`${tagihan.nomorTagihan} · ${tagihan.status.replace("_", " ")}`} />
                <Baris label="Jatuh tempo" value={formatTanggalJam(tagihan.dueAt)} />
              </>
            ) : null}
            {order.alasan ? <Baris label="Alasan" value={order.alasan} /> : null}
          </dl>
        </CardContent>
      </Card>

      {menunggu ? (
        <Card>
          <CardHeader>
            <CardTitle>Konfirmasi pesanan</CardTitle>
            <CardDescription>
              Pilih satu petak kosong dari {order.jenisMakam?.name ?? "jenis makam yang dipesan"}. Hak Pakai dan Tagihan terbit
              bersama konfirmasi ini.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <KonfirmasiForm
              lokasiId={current.id}
              nomor={order.nomor}
              petak={petak}
              pemakamanAwal={rencana}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Dokumen dari keluarga</CardTitle>
          <CardDescription>
            Dokumen boleh menyusul, bahkan setelah pemakaman. Tandai yang sudah Anda terima.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {order.dokumen.length === 0 ? (
            <p className="text-body text-muted-foreground">Lokasi Mitra ini belum punya daftar dokumen.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {order.dokumen.map((dokumen) => (
                <li key={dokumen.nama} className="flex flex-wrap items-center justify-between gap-3 text-body">
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">{dokumen.nama}</span>
                    <span className="text-small text-muted-foreground">
                      {dokumen.diunggah ? `Diberikan keluarga ${formatTanggalJam(dokumen.diunggah.at)}` : "Belum diberikan"}
                      {dokumen.dicentang ? ` · ditandai ${formatTanggalJam(dokumen.dicentang.at)}` : ""}
                    </span>
                  </span>
                  <CentangDokumenForm
                    lokasiId={current.id}
                    nomor={order.nomor}
                    nama={dokumen.nama}
                    sudah={dokumen.dicentang !== null}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Link href={`/staf/admin-lokasi/${current.id}/antrean`} className="text-body text-brand underline underline-offset-4">
        Kembali ke Antrean Lokasi
      </Link>
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

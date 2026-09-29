import Link from "next/link";
import { PageHeader } from "@/components/makam/page-header";
import { StatusBadge } from "@/components/makam/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ALASAN_TOLAK, alasanTolakTerencanaKeys, type OrderTerencanaStaf } from "@/domain/pemesanan";
import { tagihanStatusText } from "@/lib/billing-labels";
import { documentPagePath } from "@/lib/document-links";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { PembayaranLangsungForm } from "./pesanan-forms";
import { KonfirmasiTerencanaForm, TolakTerencanaForm } from "./terencana-forms";

/**
 * One Pemesanan Terencana at the Admin Lokasi's own Lokasi Mitra (spec, Pemesanan >
 * Terencana; stories 46 and 139): the family, the plots it holds, the deadline it must be
 * answered by, and the two answers — confirm, which starts the payment hold and issues the
 * pay-first Tagihan, or decline with a reason off the closed list. After the answer the
 * page shows where the order stands: the hold and its deadline, the Tagihan, and the
 * Hak Pakai and Bukti Pemesanan once it is paid.
 */
export async function TerencanaPesananView({ order, lokasiId }: { order: OrderTerencanaStaf; lokasiId: string }) {
  const { billing, lokasi } = serverRuntime();
  const menunggu = order.status === "diajukan";
  const tagihan = order.tagihanId ? await billing.tagihan(order.tagihanId) : null;
  const bukti = order.buktiPemesananId ? await billing.buktiPemesananById(order.buktiPemesananId) : null;
  const jamTahan = menunggu ? ((await lokasi.terencanaHoldHours(lokasiId)) ?? 24) : 24;
  const calon = order.calonPenghuni.name ?? order.pemesan.name;

  return (
    <>
      <PageHeader
        title={`Pesanan Terencana ${order.nomor}`}
        status={
          <span className="flex flex-wrap items-center gap-2" data-testid="status-pesanan-tagihan">
            <StatusBadge status={order.status} />
            {tagihan ? (
              <span className="text-caption text-muted-foreground">
                Tagihan <span className="font-medium text-foreground">{tagihanStatusText(tagihan.status)}</span>
              </span>
            ) : null}
          </span>
        }
        description={`Petak untuk ${calon}, dipesan lebih dulu`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Keluarga dan petak</CardTitle>
          <CardDescription>Petak dipilih sendiri oleh Pemesan di Denah dan ditahan sejak pesanan diajukan.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2 text-body">
            <Baris label="Pemesan" value={order.pemesan.name} />
            <Baris label="Telepon Pemesan" value={order.pemesan.phoneNumber} />
            <Baris label="Email Pemesan" value={order.pemesan.email} />
            <Baris
              label="Pemegang Hak"
              value={
                order.pemegangHak.mode === "pemesan"
                  ? `${order.pemegangHak.name} (Pemesan)`
                  : `${order.pemegangHak.name}${order.pemegangHak.phoneNumber ? ` · ${order.pemegangHak.phoneNumber}` : ""}`
              }
            />
            <Baris label="Calon Penghuni" value={calon} />
            <Baris label="Petak" value={order.unit.map((unit) => `${unit.nomor} (${unit.jenisMakamName})`).join(", ")} />
            <Baris label="Diajukan" value={formatTanggalJam(order.diajukanAt)} />
            {order.konfirmasiDueAt ? <Baris label="Dijawab paling lambat" value={formatTanggalJam(order.konfirmasiDueAt)} /> : null}
            {order.tahanSampai ? <Baris label="Petak ditahan sampai" value={formatTanggalJam(order.tahanSampai)} /> : null}
            {tagihan ? (
              <>
                <Baris label="Tagihan" value={tagihan.nomorTagihan} />
                <Baris label="Jatuh tempo" value={formatTanggalJam(tagihan.dueAt)} />
              </>
            ) : null}
            {bukti ? <Baris label="Bukti Pemesanan" value={bukti.nomor} href={documentPagePath(bukti.link)} /> : null}
            {order.masaPembatalanBerakhirPada ? (
              <Baris label="Masa Pembatalan berakhir" value={formatTanggalJam(order.masaPembatalanBerakhirPada)} />
            ) : null}
            {order.alasan ? <Baris label="Alasan" value={order.alasan} /> : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Syarat Pemesanan Terencana</CardTitle>
          <CardDescription>Seperti yang keluarga lihat saat memesan; kebijakan Lokasi Mitra yang berubah kemudian tidak mengubahnya.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-2 text-body">
            <Baris label="Masa Pembatalan" value={`${order.syarat.masaPembatalanDays} hari setelah pembayaran`} />
            <Baris label="Pengembalian setelahnya" value={`${order.syarat.refundAfterMasaPembatalanPercent}% dari tarif`} />
            <Baris label="Hak Pakai dengan" value={order.syarat.lokasiNama} />
          </dl>
        </CardContent>
      </Card>

      {menunggu ? (
        <Card>
          <CardHeader>
            <CardTitle>Konfirmasi pesanan</CardTitle>
            <CardDescription>
              Konfirmasi paling lambat akhir hari kerja berikutnya. Tidak ada pembatalan otomatis kalau terlambat, tetapi Admin Platform
              akan menghubungi Lokasi Mitra ini.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <KonfirmasiTerencanaForm lokasiId={lokasiId} nomor={order.nomor} jamTahan={jamTahan} />
          </CardContent>
        </Card>
      ) : null}

      {menunggu ? (
        <Card>
          <CardHeader>
            <CardTitle>Tolak pesanan</CardTitle>
            <CardDescription>Kalau petak ini tidak bisa diberikan, tolak dengan alasan dari daftar.</CardDescription>
          </CardHeader>
          <CardContent>
            <TolakTerencanaForm
              lokasiId={lokasiId}
              nomor={order.nomor}
              alasan={alasanTolakTerencanaKeys.map((key) => ({ key, label: ALASAN_TOLAK[key] }))}
            />
          </CardContent>
        </Card>
      ) : null}

      {tagihan && (tagihan.status === "belum_dibayar" || tagihan.status === "lewat_jatuh_tempo") ? (
        <Card>
          <CardHeader>
            <CardTitle>Dibayar langsung ke Lokasi Mitra</CardTitle>
            <CardDescription>
              Hanya kalau keluarga membayar langsung ke Lokasi Mitra ini, di luar sistem, sebelum penahanan berakhir. Wajib ada bukti, dan
              tercatat di Audit Log. Admin Platform bisa membatalkan pencatatan ini kalau keliru.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PembayaranLangsungForm lokasiId={lokasiId} nomor={order.nomor} tagihanId={tagihan.id} />
          </CardContent>
        </Card>
      ) : null}

      <Link href={`/staf/admin-lokasi/${lokasiId}/antrean`} className="text-body text-brand underline underline-offset-4">
        Kembali ke Antrean Lokasi
      </Link>
    </>
  );
}

function Baris({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">
        {href ? (
          <Link href={href} className="underline underline-offset-4">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

import Link from "next/link";
import { PageHeader } from "@/components/makam/page-header";
import { StatusBadge } from "@/components/makam/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ALASAN_TOLAK, alasanTolakTerencanaKeys, type OrderTerencanaStaf, type PermintaanPembatalanStaf } from "@/domain/pemesanan";
import { statusPermintaanBadge } from "@/lib/pembatalan-labels";
import { formatRupiah } from "@/lib/rupiah";
import { tagihanStatusText } from "@/lib/billing-labels";
import { documentPagePath } from "@/lib/document-links";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { PembayaranLangsungForm } from "./pesanan-forms";
import { KonfirmasiTerencanaForm, MintaPerbaikanPembatalanForm, SetujuiPembatalanForm, TolakPembatalanForm, TolakTerencanaForm } from "./terencana-forms";

/**
 * One Pemesanan Terencana at the Admin Lokasi's own Lokasi Mitra (spec, Pemesanan >
 * Terencana; stories 46 and 139): the family, the plots it holds, the deadline it must be
 * answered by, and the two answers — confirm, which starts the payment hold and issues the
 * pay-first Tagihan, or decline with a reason off the closed list. After the answer the
 * page shows where the order stands: the hold and its deadline, the Tagihan, and the
 * Hak Pakai and Bukti Pemesanan once it is paid.
 */
export async function TerencanaPesananView({
  order,
  lokasiId,
  pembatalan,
}: {
  order: OrderTerencanaStaf;
  lokasiId: string;
  /** Every Pembatalan request on this order, newest first (ticket 38). */
  pembatalan: PermintaanPembatalanStaf[];
}) {
  const { billing, lokasi } = serverRuntime();
  const menunggu = order.status === "diajukan";
  const tagihan = order.tagihanId ? await billing.tagihan(order.tagihanId) : null;
  const bukti = order.buktiPemesananId ? await billing.buktiPemesananById(order.buktiPemesananId) : null;
  const jamTahan = menunggu ? await lokasi.terencanaHoldHours(lokasiId) : null;
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

      {pembatalan.map((permintaan, urutan) => (
        <Card key={permintaan.id} data-testid="permintaan-pembatalan">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Permintaan Pembatalan <StatusBadge status={statusPermintaanBadge[permintaan.status]} />
            </CardTitle>
            <CardDescription>
              {urutan === 0
                ? "Diajukan oleh Pemegang Hak lewat Makam Keluarga. Menyetujui berarti Anda memastikan belum ada Pemakaman di petak mana pun pada pesanan ini."
                : "Permintaan sebelumnya pada pesanan ini."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-small text-muted-foreground">{artiStatusPermintaanStaf(permintaan.status)}</p>
            <dl className="flex flex-col gap-2 text-body">
              <Baris label="Diajukan" value={formatTanggalJam(permintaan.diajukanPada)} />
              <Baris label="Email pemohon" value={permintaan.pemohonEmail} />
              {permintaan.catatanPemohon ? <Baris label="Alasan dari keluarga" value={permintaan.catatanPemohon} /> : null}
              {permintaan.status === "diajukan" && permintaan.tenggatPada ? <Baris label="Dijawab paling lambat" value={formatTanggalJam(permintaan.tenggatPada)} /> : null}
              <Baris
                label={permintaan.dalamMasaPembatalan ? "Pengembalian (seluruh tarif, dalam Masa Pembatalan)" : `Pengembalian (${permintaan.persenRefund}% dari tarif sesuai Syarat)`}
                value={formatRupiah(permintaan.jumlahRefund)}
              />
              {permintaan.alasanKeputusan ? <Baris label={permintaan.status === "perlu_perbaikan" ? "Yang diminta" : "Alasan"} value={permintaan.alasanKeputusan} /> : null}
            </dl>
            {permintaan.status === "diajukan" ? (
              <div className="flex flex-col gap-6">
                <SetujuiPembatalanForm lokasiId={lokasiId} nomor={order.nomor} permintaanId={permintaan.id} />
                <MintaPerbaikanPembatalanForm lokasiId={lokasiId} nomor={order.nomor} permintaanId={permintaan.id} />
                <TolakPembatalanForm lokasiId={lokasiId} nomor={order.nomor} permintaanId={permintaan.id} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}

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

/** What each status means to the Lokasi's staff: their own next step, where the family's page says the family's. */
function artiStatusPermintaanStaf(status: PermintaanPembatalanStaf["status"]): string {
  switch (status) {
    case "diajukan":
      return "Menunggu jawaban Anda, paling lambat pada batas di bawah. Baris ini ada di Antrean Lokasi sampai dijawab.";
    case "perlu_perbaikan":
      return "Sudah Anda kembalikan ke keluarga. Barisnya kembali ke Antrean Lokasi setelah keluarga mengajukannya lagi.";
    case "disetujui":
      return "Sudah Anda setujui: Hak Pakai dibatalkan, petak kembali Tersedia, dan pengembalian dana ada di Admin Platform.";
    case "ditolak":
      return "Sudah Anda tolak. Hak Pakai tidak berubah.";
    case "dibatalkan":
      return "Ditarik keluarga sebelum Anda menjawab.";
  }
}

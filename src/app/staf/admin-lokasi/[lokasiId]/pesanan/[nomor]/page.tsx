import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { StatusBadge } from "@/components/makam/status-badge";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTanggal, formatTanggalJam, wibDateOf, wibDateTimeLocal } from "@/lib/time/jakarta";
import { tagihanStatusText } from "@/lib/billing-labels";
import { documentPagePath } from "@/lib/document-links";
import { serverRuntime } from "@/server/runtime";
import { ALASAN_TOLAK, alasanTolakLokasiKeys } from "@/domain/pemesanan";
import { adminLokasiScope } from "../../../scope";
import {
  AlternatifDanTolakForm,
  BatalkanForm,
  CatatPemakamanForm,
  CentangDokumenForm,
  KonfirmasiForm,
  PembayaranLangsungForm,
} from "./pesanan-forms";
import { TerencanaPesananView } from "./terencana-view";
import { TumpangPanelView } from "./tumpang-forms";
import { tumpangPanel } from "@/lib/tumpang-panel";

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
  if (!order) {
    // A Pemesanan Terencana shares the Nomor Pemesanan series and this address (ticket 37), and is read from
    // its own tables; another Lokasi Mitra's order is nothing found, as it is for a Saat Duka order.
    const terencana = await pemesanan.terencanaUntukStaf(actor, parsed.data);
    if (!terencana || terencana.lokasi.id !== current.id) notFound();
    return <TerencanaPesananView order={terencana} lokasiId={current.id} pembatalan={await pemesanan.pembatalanUntukStaf(actor, terencana.nomor)} />;
  }
  // Another Lokasi Mitra's order is nothing found here, exactly as it is nowhere else in this area.
  if (order.lokasi.id !== current.id) notFound();

  const tumpang = order.tumpang ? tumpangPanel(order.tumpang, order.status) : null;
  // A further burial has no plot to assign and no Jenis Makam to swap: its own panel replaces the Saat Duka confirmation.
  const menunggu = order.status === "diajukan" && !tumpang;
  const petak = menunggu && order.jenisMakam
    ? await inventory.tersediaUntukJenisMakam(current.id, order.jenisMakam.id)
    : [];
  const tagihan = order.tagihanId ? await serverRuntime().billing.tagihanBerlaku(order.tagihanId) : null;
  const bukti = order.buktiPemesananId ? await serverRuntime().billing.buktiPemesananById(order.buktiPemesananId) : null;
  const rencana = order.rencanaPemakamanAt ? wibDateTimeLocal(order.rencanaPemakamanAt) : "";
  // The alternative is one of this Lokasi Mitra's own Jenis Makam, priced by the
  // module when the offer is made, so the list here is only its choices.
  const semuaJenisMakam = menunggu
    ? (await pemesanan.pilihanSaatDuka({ lokasiId: current.id }))[0]?.pilihan.map((kartu) => ({
        id: kartu.jenisMakamId,
        name: kartu.jenisMakamName,
      })) ?? []
    : [];
  const harusCatatPemakaman = order.status === "dikonfirmasi";
  const hariIni = wibDateOf(serverRuntime().adapters.clock.now());

  return (
    <>
      <PageHeader
        title={`Pesanan ${order.nomor}`}
        status={
          // The two statuses are separate facts on separate clocks (AC 5): the order
          // has reached Dimakamkan while its Tagihan is still Belum Dibayar, or the other way round.
          <span className="flex flex-wrap items-center gap-2" data-testid="status-pesanan-tagihan">
            <StatusBadge status={order.status} />
            {tagihan ? (
              <span className="text-caption text-muted-foreground">
                Tagihan <span className="font-medium text-foreground">{tagihanStatusText(tagihan.status)}</span>
              </span>
            ) : null}
          </span>
        }
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
            {order.pemakamanTanggal ? <Baris label="Pemakaman dicatat" value={formatTanggal(order.pemakamanTanggal)} /> : null}
            {tagihan ? (
              <>
                <Baris label="Tagihan" value={tagihan.nomorTagihan} />
                <Baris label="Status Tagihan" value={tagihanStatusText(tagihan.status)} />
                <Baris label="Jatuh tempo" value={formatTanggalJam(tagihan.dueAt)} />
              </>
            ) : null}
            {bukti ? <Baris label="Bukti Pemesanan" value={bukti.nomor} href={documentPagePath(bukti.link)} /> : null}
            {order.alasan ? <Baris label="Alasan" value={order.alasan} /> : null}
            {order.alternatif ? (
              <Baris
                label="Alternatif menunggu"
                value={[order.alternatif.jenisMakam, order.alternatif.pemakamanAt ? formatTanggalJam(order.alternatif.pemakamanAt) : null]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {tumpang ? (
        <Card>
          <CardHeader>
            <CardTitle>Pemakaman di Hak Pakai yang ada</CardTitle>
            <CardDescription>
              Tidak ada Hak Pakai baru. Persetujuan Pemegang Hak harus selesai, dan pemeriksaan tumpang lolos, sebelum Tagihan terbit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TumpangPanelView lokasiId={current.id} nomor={order.nomor} panel={tumpang} pemakamanAwal={rencana} />
          </CardContent>
        </Card>
      ) : null}

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

      {menunggu ? (
        <Card>
          <CardHeader>
            <CardTitle>Tawarkan alternatif atau tolak</CardTitle>
            <CardDescription>
              Kalau ada pilihan lain, tawarkan dulu: keluarga akan melihat total barunya dan menjawab dalam satu ketukan. Kalau
              tidak ada, tolak dengan alasan dari daftar — keluarga diberi tahu dan Tim kami meneleponnya maksimal 2 jam.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlternatifDanTolakForm
              lokasiId={current.id}
              nomor={order.nomor}
              alasan={alasanTolakLokasiKeys.map((key) => ({ key, label: ALASAN_TOLAK[key] }))}
              jenisMakam={semuaJenisMakam}
              pemakamanAwal={order.alternatif?.pemakamanAt ? wibDateTimeLocal(order.alternatif.pemakamanAt) : rencana}
              sudahDitawarkan={order.alternatif !== null}
            />
          </CardContent>
        </Card>
      ) : null}

      {harusCatatPemakaman ? (
        <Card>
          <CardHeader>
            <CardTitle>Catat pemakaman</CardTitle>
            <CardDescription>
              Catat hari pemakaman benar-benar dilaksanakan. Masa Hak Pakai dihitung dari tanggal ini, dan keluarga punya tiga
              hari dari tanggal ini untuk membayar Tagihan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CatatPemakamanForm
              lokasiId={current.id}
              nomor={order.nomor}
              tanggalAwal={order.pemakamanAt ? wibDateOf(order.pemakamanAt) : hariIni}
              layerAwal={order.pemakamanLayer ?? 1}
              hariIni={hariIni}
            />
          </CardContent>
        </Card>
      ) : null}

      {order.status === "dikonfirmasi" || order.status === "diajukan" ? (
        <Card>
          <CardHeader>
            <CardTitle>Pembatalan atas nama keluarga</CardTitle>
            <CardDescription>
              Untuk permintaan keluarga yang Anda terima lewat telepon. Alasan apa pun yang mereka sebutkan tidak perlu Anda ketik ulang.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BatalkanForm lokasiId={current.id} nomor={order.nomor} wajibAlasan={order.status === "dikonfirmasi"} />
          </CardContent>
        </Card>
      ) : null}

      {tagihan && (tagihan.status === "belum_dibayar" || tagihan.status === "lewat_jatuh_tempo") ? (
        <Card>
          <CardHeader>
            <CardTitle>Dibayar langsung ke Lokasi Mitra</CardTitle>
            <CardDescription>
              Hanya kalau keluarga membayar langsung ke Lokasi Mitra ini, di luar sistem. Wajib ada bukti, dan tercatat di Audit
              Log. Admin Platform bisa membatalkan pencatatan ini kalau keliru.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PembayaranLangsungForm lokasiId={current.id} nomor={order.nomor} tagihanId={tagihan.id} />
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

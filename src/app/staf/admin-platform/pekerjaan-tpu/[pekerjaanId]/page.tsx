import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { alasanAntreLabels, pekerjaanTpuStatusLabels, penugasanHasilLabels } from "@/lib/layanan-tpu-labels";
import { labelBuktiPekerjaan } from "@/lib/layanan-labels";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { BatalkanTerlambatForm, SetujuiBuktiForm, TolakBuktiForm } from "./bukti-forms";
import { LepasForm, TugaskanForm } from "./penugasan-forms";

/**
 * One TPU job for Admin Platform (spec, Layanan > Mitra Jasa; story 156): what it is
 * and where the grave is, who holds it, and the picker — the Mitra Jasa who are Aktif,
 * cover this TPU and this Layanan, and are not Tidak tersedia on the target date. The
 * page decides nothing: the list is the module's hard filter, and the two writes go
 * through the Server Actions beside it.
 */
export default async function PekerjaanTpuPage({ params }: PageProps<"/staf/admin-platform/pekerjaan-tpu/[pekerjaanId]">) {
  const actor = await staffMenuActor("admin_platform");
  const { pekerjaanId } = await params;
  const dibaca = await serverRuntime().layanan.bacaPekerjaanTpu(actor, pekerjaanId);
  if (!dibaca.ok) notFound();
  const { pekerjaan, calon } = dibaca;
  const dipegang = pekerjaan.penugasan;
  const bukti = await serverRuntime().layanan.buktiTpuUntukStaf(actor, pekerjaanId);

  return (
    <>
      <PageHeader
        title={pekerjaan.label}
        description={
          <>
            {pekerjaan.nomor} · {pekerjaan.tpu.name} · target {formatTanggal(pekerjaan.targetDate)} · {pekerjaanTpuStatusLabels[pekerjaan.status]}
          </>
        }
      />
      <p className="text-small text-muted-foreground">
        <Link href="/staf/admin-platform/pekerjaan-tpu" className="font-medium text-brand underline underline-offset-4">
          Kembali ke daftar pekerjaan TPU
        </Link>
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Makam dan pesanan</CardTitle>
          <CardDescription>Yang dilihat Mitra Jasa: lokasi makam, layanan, tanggal target dan foto acuan. Kontak keluarga tidak ikut.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-body">
          <p>
            {pekerjaan.tpu.name}, {pekerjaan.tpu.address}
          </p>
          <p>
            Makam {pekerjaan.makam.blokNomor} · Almarhum {pekerjaan.makam.almarhumName}
          </p>
          {pekerjaan.makam.keterangan ? <p>Keterangan: {pekerjaan.makam.keterangan}</p> : null}
          {pekerjaan.makam.adaFoto ? <p>Ada foto makam dari pemesan.</p> : null}
          {pekerjaan.makam.pin ? (
            <p>
              Pin {pekerjaan.makam.pin.lat.toFixed(5)}, {pekerjaan.makam.pin.lng.toFixed(5)}
            </p>
          ) : null}
          {pekerjaan.teks ? <p>Tulisan: &ldquo;{pekerjaan.teks}&rdquo;</p> : null}
          <p className="text-muted-foreground">Pemesan: {pekerjaan.pemesanName}</p>
        </CardContent>
      </Card>

      {bukti && bukti.bukti.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Bukti pekerjaan</CardTitle>
            <CardDescription>
              {bukti.status === "menunggu_verifikasi" && bukti.batasVerifikasi
                ? `Dikirim ${bukti.dikirimAt ? formatTanggalJam(bukti.dikirimAt) : ""}. Putuskan sebelum ${formatTanggalJam(bukti.batasVerifikasi)}. Pemesan baru melihatnya setelah disetujui.`
                : "Foto yang diambil Mitra Jasa dengan kamera aplikasi."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-wrap gap-3">
              {bukti.bukti.map((satu) => (
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
            {bukti.status === "menunggu_verifikasi" ? (
              <div className="flex flex-col gap-4">
                <SetujuiBuktiForm pekerjaanId={pekerjaan.id} />
                <TolakBuktiForm pekerjaanId={pekerjaan.id} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {pekerjaan.status === "terlambat" ? (
        <Card>
          <CardHeader>
            <CardTitle>Pekerjaan terlambat</CardTitle>
            <CardDescription>
              Dibatalkan atas nama Pemesan: seluruh tagihan dikembalikan, termasuk Biaya Layanan Platform, dan Mitra Jasa tidak menerima pencairan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BatalkanTerlambatForm pekerjaanId={pekerjaan.id} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Penugasan</CardTitle>
          <CardDescription>
            {dipegang
              ? `${dipegang.namaLengkap}: ${penugasanHasilLabels[dipegang.hasil]}${dipegang.hasil === "menunggu" ? ` sampai ${formatTanggalJam(dipegang.batasJawab)}` : ""}.`
              : alasanAntreLabels[pekerjaan.alasanAntre]}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {pekerjaan.status !== "dijadwalkan" ? (
            <p className="text-body text-muted-foreground">Pekerjaan ini {pekerjaanTpuStatusLabels[pekerjaan.status]}: tidak bisa ditugaskan.</p>
          ) : dipegang ? (
            <LepasForm pekerjaanId={pekerjaan.id} />
          ) : (
            <>
              <p className="text-small text-muted-foreground">
                Daftar ini hanya Mitra Jasa Aktif yang mencakup {pekerjaan.tpu.name} dan layanan ini, dan tidak Tidak tersedia pada {formatTanggal(pekerjaan.targetDate)}. Batas menjawab: 12 jam,
                atau H-1 pukul 18.00 bila lebih dulu. Tanpa jawaban, pekerjaan dianggap ditolak.
              </p>
              {calon.length === 0 ? (
                <p role="status" className="rounded-lg bg-warning-soft p-3 text-body text-warning-soft-foreground">
                  Tidak ada Mitra Jasa yang memenuhi syarat untuk pekerjaan ini. Periksa cakupan dan tanggal Tidak tersedia di halaman Mitra Jasa.
                </p>
              ) : null}
              <TugaskanForm pekerjaanId={pekerjaan.id} calon={calon.map((satu) => ({ id: satu.id, namaLengkap: satu.namaLengkap, selesai: satu.selesai, baru: satu.baru }))} />
            </>
          )}
        </CardContent>
      </Card>

      {pekerjaan.riwayat.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Riwayat penugasan</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-body">
              {pekerjaan.riwayat.map((satu) => (
                <li key={satu.id}>
                  {satu.namaLengkap} · {penugasanHasilLabels[satu.hasil]}
                  {satu.dijawabAt ? ` (${formatTanggalJam(satu.dijawabAt)})` : ""}
                  {satu.alasan ? `: ${satu.alasan}` : ""}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

import { BriefcaseIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { penugasanHasilLabels } from "@/lib/layanan-tpu-labels";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { TidakTersediaForm } from "../../admin-platform/mitra-jasa/mitra-jasa-forms";
import { DaftarPesanThread } from "@/components/layanan/thread-daftar";
import { FormPesanThread } from "@/components/layanan/thread-pesan";
import { kirimPesanThreadMitraJasa } from "./bukti-actions";
import { AmbilBuktiTpu } from "./ambil-bukti-tpu";
import { JawabForm } from "./jawab-form";
import { KirimBuktiForm } from "./kirim-bukti-form";

/**
 * Pekerjaan (Pekerjaan Layanan) is Mitra Jasa's home (spec, stories 176 and 178): the
 * jobs handed to them, to accept or decline in the app by the deadline, with where the
 * grave is, the Layanan, the target date and the reference photos — and never the
 * family's name or contact. Under it, the dates they take none (the "Tidak tersedia"
 * ranges the assignment picker reads), the 90-day scorecard, and what came before.
 * The photo proof steps and the thread with the family are ticket 57's.
 */
export default async function PekerjaanPage() {
  const actor = await staffMenuActor("mitra_jasa");
  const { layanan } = serverRuntime();
  const [ranges, skor, saya] = await Promise.all([layanan.rentangTidakTersedia(actor), layanan.skorSaya(actor), layanan.pekerjaanTpuSaya(actor)]);
  const bukti = new Map(await Promise.all(saya.aktif.map(async (satu) => [satu.id, await layanan.buktiTpuSaya(actor, satu.id)] as const)));

  return (
    <>
      <PageHeader title="Pekerjaan Layanan" description="Layanan yang ditugaskan ke Anda di TPU, dengan lokasi makam dan tanggal targetnya. Terima atau tolak sebelum batas waktunya." />

      {saya.aktif.length === 0 ? (
        <EmptyState
          icon={BriefcaseIcon}
          title="Belum ada pekerjaan"
          description="Pekerjaan yang ditugaskan ke Anda akan muncul di sini, dan Anda diberi tahu lewat push dan email. Anda tetap bisa mengisi tanggal tidak tersedia di bawah."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {saya.aktif.map((satu) => (
            <li key={satu.id}>
              <Card>
                <CardHeader>
                  <CardTitle>{satu.label}</CardTitle>
                  <CardDescription>
                    Target {formatTanggal(satu.targetDate)} (boleh dikerjakan {formatTanggal(satu.jendela.dari)} sampai {formatTanggal(satu.jendela.sampai)})
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-body">
                  <div className="flex flex-col gap-1">
                    <p className="font-medium">{satu.tpu.name}</p>
                    <p className="text-muted-foreground">{satu.tpu.address}</p>
                    <p>
                      Makam {satu.makam.blokNomor} · Almarhum {satu.makam.almarhumName}
                    </p>
                    {satu.makam.keterangan ? <p>Keterangan: {satu.makam.keterangan}</p> : null}
                    {satu.teks ? <p>Tulisan: &ldquo;{satu.teks}&rdquo;</p> : null}
                    {satu.makam.pin ? (
                      <a
                        href={`https://www.google.com/maps?q=${satu.makam.pin.lat},${satu.makam.pin.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand underline underline-offset-4"
                      >
                        Buka pin di peta
                      </a>
                    ) : null}
                  </div>
                  {satu.makam.fotoUrls.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {satu.makam.fotoUrls.map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL of a private file
                        <img key={url} src={url} alt="Foto makam dari pemesan" className="h-32 w-auto rounded-lg border border-border object-cover" />
                      ))}
                    </div>
                  ) : null}
                  {satu.penugasan.hasil === "menunggu" ? (
                    <>
                      <p role="status" className="rounded-lg bg-warning-soft p-3 text-warning-soft-foreground">
                        Jawab paling lambat {formatTanggalJam(satu.penugasan.batasJawab)}. Tanpa jawaban, pekerjaan ini dianggap Anda tolak.
                      </p>
                      <JawabForm pekerjaanId={satu.id} />
                    </>
                  ) : (
                    <p className="font-medium text-success-soft-foreground">{penugasanHasilLabels.diterima}. Kerjakan pada tanggal targetnya.</p>
                  )}
                  {satu.penugasan.hasil === "diterima" ? <BuktiPekerjaan pekerjaanId={satu.id} bukti={bukti.get(satu.id) ?? null} /> : null}
                  {satu.penugasan.hasil === "diterima" ? <ThreadPekerjaan actor={actor} pekerjaanId={satu.id} /> : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tidak tersedia</CardTitle>
          <CardDescription>
            Tanggal Anda tidak menerima pekerjaan. Admin Platform tidak menugaskan pekerjaan pada tanggal-tanggal ini, dan
            rentangnya tetap tersimpan meski status Anda Ditangguhkan atau Berhenti.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TidakTersediaForm ranges={ranges} />
        </CardContent>
      </Card>

      {saya.riwayat.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Riwayat</CardTitle>
            <CardDescription>Pekerjaan yang sudah tidak Anda pegang.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-body">
              {saya.riwayat.map((satu) => (
                <li key={`${satu.id}-${satu.dijawabAt?.toISOString() ?? ""}`}>
                  {satu.label} · {satu.tpuName} · target {formatTanggal(satu.targetDate)} · {penugasanHasilLabels[satu.hasil]}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {skor.ok ? (
        <Card>
          <CardHeader>
            <CardTitle>Skor 90 hari</CardTitle>
            <CardDescription>
              {skor.skor.selesai} selesai, {skor.skor.terlambat} terlambat, {skor.skor.keluhanUpheld} keluhan upheld,{" "}
              {skor.skor.declines} declines / tidak direspons
              {skor.skor.rataPenilaian === null ? "" : `, penilaian rata-rata ${skor.skor.rataPenilaian.toFixed(1)}`}.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </>
  );
}

/**
 * The proof of one accepted job: the shots the Layanan asks for, taken with the in-app
 * camera, then Kirim. What is due and what is already in comes from the module; once the
 * proof is sent or the job is done there is nothing left to take.
 */
function BuktiPekerjaan({ pekerjaanId, bukti }: { pekerjaanId: string; bukti: Awaited<ReturnType<ReturnType<typeof serverRuntime>["layanan"]["buktiTpuSaya"]>> }) {
  if (!bukti) return null;
  if (bukti.status === "menunggu_verifikasi") {
    return <p className="rounded-lg bg-warning-soft p-3 text-warning-soft-foreground">Bukti sudah dikirim dan sedang diperiksa Admin Platform.</p>;
  }
  if (bukti.status === "selesai") return null;
  const ada = new Set(bukti.terambil.map((satu) => satu.kind));
  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">Bukti pekerjaan</p>
      {bukti.alasanDitolak ? (
        <p role="alert" className="rounded-lg bg-destructive-soft p-3 text-destructive-soft-foreground">
          Bukti ditolak: {bukti.alasanDitolak}. Ambil ulang, lalu kirim lagi.
        </p>
      ) : null}
      {bukti.dibutuhkan.map((kind) => (
        <AmbilBuktiTpu key={kind} pekerjaanId={pekerjaanId} kind={kind} sudahAda={ada.has(kind)} />
      ))}
      <KirimBuktiForm pekerjaanId={pekerjaanId} siap={bukti.dibutuhkan.every((kind) => ada.has(kind))} />
    </div>
  );
}

/**
 * The message thread of one accepted job (story 180): the Mitra Jasa and the family write through the app, never by
 * contact details. It closes when the window-close tick (`tutupJendelaKeluhan`) runs past the end of the TPU Keluhan window; then it is read-only, with what was said.
 */
async function ThreadPekerjaan({ actor, pekerjaanId }: { actor: Awaited<ReturnType<typeof staffMenuActor>>; pekerjaanId: string }) {
  const hasil = await serverRuntime().layanan.bacaThreadStaf(actor, pekerjaanId);
  if (!hasil.ok) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="thread-pekerjaan">
      <p className="font-medium">Percakapan dengan keluarga</p>
      <DaftarPesanThread thread={hasil.thread} />
      {hasil.thread.tertutup ? null : <FormPesanThread pekerjaanId={pekerjaanId} action={kirimPesanThreadMitraJasa} />}
    </div>
  );
}

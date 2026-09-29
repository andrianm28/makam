import { BriefcaseIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { TidakTersediaForm } from "../../admin-platform/mitra-jasa/mitra-jasa-forms";

/**
 * Pekerjaan (Pekerjaan Layanan) is Mitra Jasa's home: the jobs they have, and the
 * dates they take none. The job list is ticket 56's and 57's; what is here is what
 * this ticket owns — the "Tidak tersedia" ranges the assignment picker reads, and
 * the reason someone sees no work on those dates.
 */
export default async function PekerjaanPage() {
  const actor = await staffMenuActor("mitra_jasa");
  const { layanan } = serverRuntime();
  const [ranges, skor] = await Promise.all([layanan.rentangTidakTersedia(actor), layanan.skorSaya(actor)]);

  return (
    <>
      <PageHeader title="Pekerjaan Layanan" description="Layanan yang Anda kerjakan di satu Petak Makam pada satu tanggal target, dengan status dan bukti fotonya." />

      <EmptyState
        icon={BriefcaseIcon}
        title="Belum ada pekerjaan"
        description="Pekerjaan yang ditugaskan ke Anda akan muncul di sini. Anda tetap bisa mengisi tanggal tidak tersedia di bawah."
      />

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

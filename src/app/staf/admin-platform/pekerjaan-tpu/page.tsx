import Link from "next/link";
import { BriefcaseIcon } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { alasanAntreLabels, penugasanHasilLabels } from "@/lib/layanan-tpu-labels";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

/**
 * Every Dijadwalkan job at a DKI TPU, soonest target date first (spec, Layanan > Mitra
 * Jasa): the page behind the Antrean's Tier 1 "Pekerjaan hari ini tanpa Mitra Jasa" and
 * Tier 2 rows, and the place to hand a job out ahead of its day. Each links to its own
 * page, where the picker is.
 */
export default async function PekerjaanTpuListPage() {
  const actor = await staffMenuActor("admin_platform");
  const pekerjaan = await serverRuntime().layanan.pekerjaanTpuUntukStaf(actor);

  return (
    <>
      <PageHeader
        title="Pekerjaan TPU"
        description="Layanan di TPU DKI yang dikerjakan Mitra Jasa. Tugaskan tiap pekerjaan dari daftar Mitra Jasa yang memenuhi syarat."
      />

      {pekerjaan.length === 0 ? (
        <EmptyState
          icon={BriefcaseIcon}
          title="Belum ada pekerjaan TPU"
          description="Pekerjaan muncul di sini setelah pesanan layanan TPU dibayar, atau setelah pengurusan Saat Duka TPU yang memuat layanan hari-H dikonfirmasi."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Dijadwalkan</CardTitle>
            <CardDescription>{pekerjaan.length} pekerjaan menunggu atau sedang dipegang Mitra Jasa.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {pekerjaan.map((satu) => (
                <li key={satu.id} className="flex flex-wrap items-center justify-between gap-2 text-body">
                  <span>
                    <span className="font-mono font-semibold text-foreground">{satu.nomor}</span> · {satu.label} · {satu.tpu.name} · target {formatTanggal(satu.targetDate)}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-small text-muted-foreground">
                      {satu.penugasan
                        ? `${satu.penugasan.namaLengkap}: ${penugasanHasilLabels[satu.penugasan.hasil]}${satu.penugasan.hasil === "menunggu" ? ` sampai ${formatTanggalJam(satu.penugasan.batasJawab)}` : ""}`
                        : alasanAntreLabels[satu.alasanAntre]}
                    </span>
                    <Link href={`/staf/admin-platform/pekerjaan-tpu/${satu.id}`} className="font-medium text-brand underline underline-offset-4">
                      {satu.penugasan ? "Lihat" : "Tugaskan"}
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}

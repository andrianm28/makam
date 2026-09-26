import Link from "next/link";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tugasLapanganTypeLabels } from "@/domain/fieldwork";
import { formatTanggal } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

/**
 * Petugas Lapangan's "Tugas saya" (CONTEXT.md: shortened to "Tugas" in the
 * navigation): every Tugas Lapangan assigned to them, soonest planned date
 * first, mobile-first (PWA, phone width).
 */
export default async function TugasSayaPage() {
  const actor = await staffMenuActor("petugas_lapangan");
  const tugas = await serverRuntime().fieldwork.tugasSaya(actor);

  return (
    <>
      <PageHeader title="Tugas Lapangan" description="Tugas yang ditugaskan ke Anda." />
      {tugas.length === 0 ? (
        <p className="text-body text-muted-foreground">Belum ada Tugas Lapangan untuk Anda.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tugas.map((item) => (
            <Link key={item.id} href={`/staf/petugas-lapangan/tugas/${item.id}`}>
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span>{item.subject}</span>
                    <span className="text-small font-normal text-muted-foreground">
                      {item.status === "selesai" ? "Selesai" : "Ditugaskan"}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1 text-small text-muted-foreground">
                  <span>{tugasLapanganTypeLabels[item.type]}</span>
                  <span>{item.address}</span>
                  <span>Rencana: {formatTanggal(item.plannedDate)}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

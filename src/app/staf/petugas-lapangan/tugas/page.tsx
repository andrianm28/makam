import { ClipboardListIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/makam/empty-state";
import { PageHeader } from "@/components/makam/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { tugasLapanganTypeLabels } from "@/domain/fieldwork";
import { formatTanggal } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

/**
 * Petugas Lapangan's "Tugas" (CONTEXT.md: shortened from "Tugas Lapangan" in
 * the navigation; this page keeps the full term): every Tugas Lapangan
 * assigned to them, soonest planned date first. One job card per Tugas
 * Lapangan, phone-first, with one full-width action (docs/design-system.md,
 * Principles).
 */
export default async function TugasPage() {
  const actor = await staffMenuActor("petugas_lapangan");
  const tugas = await serverRuntime().fieldwork.tugasSaya(actor);

  return (
    <>
      <PageHeader title="Tugas Lapangan" description="Tugas yang ditugaskan ke Anda." />
      {tugas.length === 0 ? (
        <EmptyState icon={ClipboardListIcon} title="Belum ada Tugas Lapangan" description="Tugas Lapangan yang ditugaskan ke Anda akan muncul di sini." />
      ) : (
        <div className="flex flex-col gap-3">
          {tugas.map((item) => (
            <Card key={item.id} size="sm">
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
              <CardFooter>
                <Button className="w-full" render={<Link href={`/staf/petugas-lapangan/tugas/${item.id}`} />}>
                  Buka
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

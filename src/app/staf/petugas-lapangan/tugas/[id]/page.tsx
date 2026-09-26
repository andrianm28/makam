import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/makam/page-header";
import { PinMap } from "@/components/map/pin-map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requiredUploadsByType, tugasLapanganTypeLabels } from "@/domain/fieldwork";
import { lokasiFacilities } from "@/domain/lokasi";
import { formatTanggal } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { TugasLapanganForm } from "./tugas-form";

/** Petugas Lapangan's one Tugas Lapangan: address, pin (Leaflet), planned date and its type-specific form. */
export default async function TugasLapanganDetailPage({ params }: PageProps<"/staf/petugas-lapangan/tugas/[id]">) {
  const actor = await staffMenuActor("petugas_lapangan");
  const { id } = await params;
  const read = await serverRuntime().fieldwork.tugasLapangan(actor, id);
  if (!read.ok) {
    if (read.reason === "tidak_ditemukan") notFound();
    redirect("/staf/petugas-lapangan/tugas");
  }
  const tugas = read.tugasLapangan;
  const required = requiredUploadsByType[tugas.type];

  return (
    <>
      <PageHeader title={tugasLapanganTypeLabels[tugas.type]} description={tugas.subject} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tugas.status === "selesai" ? "Selesai" : "Ditugaskan"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-body">
          <p>{tugas.address}</p>
          <p className="text-muted-foreground">Rencana: {formatTanggal(tugas.plannedDate)}</p>
          {tugas.pin ? (
            <>
              <PinMap pin={tugas.pin} label="Pin lokasi tugas" className="h-48 w-full rounded-lg border" />
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${tugas.pin.lat},${tugas.pin.lng}`}
                target="_blank"
                rel="noreferrer"
                className="text-brand underline underline-offset-4"
              >
                Petunjuk arah
              </a>
            </>
          ) : (
            <p className="text-muted-foreground">Belum ada pin.</p>
          )}
        </CardContent>
      </Card>

      {tugas.status === "selesai" ? (
        <p className="text-body text-success-soft-foreground">Tugas ini sudah Selesai.</p>
      ) : (
        <TugasLapanganForm
          tugas={tugas}
          required={required}
          facilityOptions={Object.entries(lokasiFacilities).map(([value, label]) => ({ value, label }))}
        />
      )}
    </>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { RenumberPetakForm } from "./renumber-form";

/** Admin Platform, tab Denah: every Blok (read-only; Admin Lokasi builds them), Jenis Makam availability, and renumbering a Petak. */
export default async function LokasiMitraDenahPage({ params }: PageProps<"/staf/admin-platform/lokasi/[lokasiId]/denah">) {
  const actor = await staffMenuActor("admin_platform");
  const { lokasiId } = await params;
  const runtime = serverRuntime();
  const reads = runtime.inventory.asStaff(actor);
  const [bloks, availability, tariffs] = await Promise.all([
    reads.bloks(lokasiId),
    reads.availability(lokasiId),
    runtime.tariffs.asStaff(actor).lokasiTariffs(lokasiId, runtime.adapters.clock.now()),
  ]);
  const jenisMakamName = new Map(tariffs.jenisMakam.map((jenis) => [jenis.id, jenis.name]));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Ketersediaan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {availability.length === 0 ? (
            <p className="text-body text-muted-foreground">Belum ada Petak yang dibersihkan Tersedia.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {availability.map((row) => (
                <li key={row.jenisMakamId} className="text-body">
                  {jenisMakamName.get(row.jenisMakamId) ?? row.jenisMakamId}: <span className="font-medium">{row.count}</span> unit Tersedia
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Blok</CardTitle>
        </CardHeader>
        <CardContent>
          {bloks.length === 0 ? (
            <p className="text-body text-muted-foreground">Lokasi ini belum punya Blok. Admin Lokasi membuatnya di Denah.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {bloks.map((blok) => (
                <li key={blok.id} className="text-body">
                  Blok {blok.name} ({blok.rows} × {blok.cols})
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ubah nomor Petak</CardTitle>
        </CardHeader>
        <CardContent>
          <RenumberPetakForm lokasiId={lokasiId} />
        </CardContent>
      </Card>
    </>
  );
}

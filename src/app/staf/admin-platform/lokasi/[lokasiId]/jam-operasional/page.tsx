import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { JamOperasionalForm, KontakSiagaForm } from "../../../../admin-lokasi/[lokasiId]/jam-operasional/jam-operasional-forms";

/** Admin Platform, tab Jam Operasional: weekly hours, Tanggal Tutup and the Kontak Siaga. */
export default async function LokasiMitraJamOperasionalPage({
  params,
}: PageProps<"/staf/admin-platform/lokasi/[lokasiId]/jam-operasional">) {
  const actor = await staffMenuActor("admin_platform");
  const { lokasiId } = await params;
  const { lokasi } = serverRuntime();
  const [jam, siaga, admins] = await Promise.all([
    lokasi.jamOperasional(actor, lokasiId),
    lokasi.kontakSiaga(actor, lokasiId),
    lokasi.adminLokasiOf(actor, lokasiId),
  ]);
  if (!jam.ok || !siaga.ok || !admins.ok) redirect("/staf/admin-platform/lokasi");

  return (
    <>
      <p className="text-body text-muted-foreground">
        Janji konfirmasi Saat Duka kepada keluarga dihitung dari Jam Operasional ini. Di luar jam itu, keluarga melihat
        Kontak Siaga.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Jam Operasional</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {jam.jamOperasional === null ? (
            <p role="alert" className="text-body text-destructive">
              Jam Operasional belum diisi. Isi jam buka per hari lalu simpan; tanpa Jam Operasional, Lokasi ini belum bisa
              menerima pesanan.
            </p>
          ) : null}
          <JamOperasionalForm lokasiId={lokasiId} jamOperasional={jam.jamOperasional} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Kontak Siaga</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {siaga.kontakSiaga ? (
            <p className="text-body">
              Kontak Siaga sekarang: <span className="font-medium">{siaga.kontakSiaga.phoneNumber}</span>
            </p>
          ) : (
            <p role="alert" className="text-body text-destructive">
              Kontak Siaga belum dipilih. Pilih salah satu Admin Lokasi di Lokasi ini.
            </p>
          )}
          <KontakSiagaForm lokasiId={lokasiId} adminLokasi={admins.adminLokasi} kontakSiaga={siaga.kontakSiaga} />
        </CardContent>
      </Card>
    </>
  );
}

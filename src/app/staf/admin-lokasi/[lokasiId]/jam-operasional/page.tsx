import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope, LokasiSwitcher } from "../../scope";
import { JamOperasionalForm, KontakSiagaForm } from "./jam-operasional-forms";

/** Admin Lokasi: the current Lokasi Mitra's Jam Operasional (weekly hours, Tanggal Tutup) and its Kontak Siaga. */
export default async function JamOperasionalPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/jam-operasional">) {
  const { lokasiId } = await params;
  const { actor, lokasiMitra, current } = await adminLokasiScope(lokasiId);
  const { lokasi } = serverRuntime();
  const [jam, siaga, admins] = await Promise.all([
    lokasi.jamOperasional(actor, current.id),
    lokasi.kontakSiaga(actor, current.id),
    lokasi.adminLokasiOf(actor, current.id),
  ]);
  if (!jam.ok || !siaga.ok || !admins.ok) redirect("/staf/admin-lokasi");

  return (
    <>
      <LokasiSwitcher lokasiMitra={lokasiMitra} current={current.id} />
      <Link href={`/staf/admin-lokasi/${current.id}`} className="text-sm underline underline-offset-4">
        {current.name}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Jam Operasional dan Kontak Siaga</h1>
      <p className="text-sm text-muted-foreground">
        Janji konfirmasi Saat Duka kepada keluarga dihitung dari Jam Operasional ini. Di luar jam itu, keluarga melihat
        Kontak Siaga.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Jam Operasional</CardTitle>
        </CardHeader>
        <CardContent>
          <JamOperasionalForm lokasiId={current.id} jamOperasional={jam.jamOperasional} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Kontak Siaga</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {siaga.kontakSiaga ? (
            <p className="text-sm">
              Kontak Siaga sekarang: <span className="font-medium">{siaga.kontakSiaga.phoneNumber}</span>
            </p>
          ) : (
            <p role="alert" className="text-sm text-destructive">
              Kontak Siaga belum dipilih. Pilih salah satu Admin Lokasi di Lokasi ini.
            </p>
          )}
          <KontakSiagaForm lokasiId={current.id} adminLokasi={admins.adminLokasi} kontakSiaga={siaga.kontakSiaga} />
        </CardContent>
      </Card>
    </>
  );
}

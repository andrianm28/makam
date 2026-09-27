import { redirect } from "next/navigation";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope } from "../../scope";
import { JamOperasionalForm, KontakSiagaForm } from "./jam-operasional-forms";

/** Admin Lokasi: the current Lokasi Mitra's Jam Operasional (weekly hours, Tanggal Tutup) and its Kontak Siaga. */
export default async function JamOperasionalPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/jam-operasional">) {
  const { lokasiId } = await params;
  const { actor, current } = await adminLokasiScope(lokasiId);
  const { lokasi } = serverRuntime();
  const [jam, siaga, admins] = await Promise.all([
    lokasi.jamOperasional(actor, current.id),
    lokasi.kontakSiaga(actor, current.id),
    lokasi.adminLokasiOf(actor, current.id),
  ]);
  if (!jam.ok || !siaga.ok || !admins.ok) redirect("/staf/admin-lokasi");

  return (
    <>
      <PageHeader
        title="Jam Operasional dan Kontak Siaga"
        description="Janji konfirmasi Saat Duka kepada keluarga dihitung dari Jam Operasional ini. Di luar jam itu, keluarga melihat Kontak Siaga."
      />
      <Card>
        <CardHeader>
          <CardTitle>Jam Operasional</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {jam.jamOperasional === null && (
            <p role="alert" className="text-body text-destructive">
              Jam Operasional belum diisi. Isi jam buka per hari lalu simpan; tanpa Jam Operasional, Lokasi ini belum bisa
              menerima pesanan.
            </p>
          )}
          <JamOperasionalForm lokasiId={current.id} jamOperasional={jam.jamOperasional} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Kontak Siaga</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {siaga.kontakSiaga ? (
            <p className="text-body">
              Kontak Siaga sekarang: <span className="font-medium">{siaga.kontakSiaga.phoneNumber ?? "belum ada nomor telepon"}</span>
            </p>
          ) : (
            <p role="alert" className="text-body text-destructive">
              Kontak Siaga belum dipilih. Pilih salah satu Admin Lokasi di Lokasi ini.
            </p>
          )}
          <KontakSiagaForm lokasiId={current.id} adminLokasi={admins.adminLokasi} kontakSiaga={siaga.kontakSiaga} />
        </CardContent>
      </Card>
    </>
  );
}

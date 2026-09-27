import { notFound } from "next/navigation";
import { PageHeader } from "@/components/makam/page-header";
import { StatusBadge } from "@/components/makam/status-badge";
import { PinMap } from "@/components/map/pin-map";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverRuntime } from "@/server/runtime";
import { adminLokasiScope } from "../scope";

/** An Admin Lokasi's home for one of its Lokasi Mitra: the record at a glance. */
export default async function AdminLokasiLokasiPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]">) {
  const { lokasiId } = await params;
  const { actor, current } = await adminLokasiScope(lokasiId);
  const read = await serverRuntime().lokasi.lokasiMitra(actor, current.id);
  if (!read.ok) notFound();
  const lokasiMitra = read.lokasiMitra;

  return (
    <>
      <PageHeader title={lokasiMitra.name} status={<StatusBadge status={lokasiMitra.status} />} description={lokasiMitra.pengelolaName}>
        <p className="text-small text-muted-foreground">
          {lokasiMitra.address}, {lokasiMitra.city}
        </p>
      </PageHeader>
      {lokasiMitra.pin ? (
        <Card>
          <CardHeader>
            <CardTitle>Peta Lokasi</CardTitle>
          </CardHeader>
          <CardContent>
            <PinMap pin={lokasiMitra.pin} label="Peta Lokasi" />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Dokumen yang dibawa keluarga</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 text-body">
            {lokasiMitra.documentChecklist.map((document) => (
              <li key={document}>{document}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

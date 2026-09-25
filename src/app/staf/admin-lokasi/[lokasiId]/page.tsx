import { PinMap } from "@/components/map/pin-map";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverRuntime } from "@/server/runtime";
import { lokasiStatusLabels } from "../../lokasi/labels";
import { StaffRoleHome } from "../../staff-role-home";
import { adminLokasiMenu, adminLokasiScope, LokasiSwitcher } from "../scope";

/** An Admin Lokasi's home for one of its Lokasi Mitra: the Lokasi switcher, the menu, the record at a glance. */
export default async function AdminLokasiLokasiPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]">) {
  const { lokasiId } = await params;
  const { actor, lokasiMitra, current } = await adminLokasiScope(lokasiId);
  const read = await serverRuntime().lokasi.lokasiMitra(actor, current.id);

  return (
    <>
      <StaffRoleHome role="admin_lokasi" title={current.name} menu={adminLokasiMenu(current.id)}>
        <LokasiSwitcher lokasiMitra={lokasiMitra} current={current.id} />
      </StaffRoleHome>
      {read.ok ? (
        <Card>
          <CardHeader>
            <CardTitle>Lokasi Mitra</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>
              <Badge variant="secondary">{lokasiStatusLabels[read.lokasiMitra.status]}</Badge> · {read.lokasiMitra.address},{" "}
              {read.lokasiMitra.city}
            </p>
            {read.lokasiMitra.pin ? <PinMap pin={read.lokasiMitra.pin} label="Peta Lokasi" /> : null}
            <div>
              <p className="font-medium">Dokumen yang dibawa keluarga</p>
              <ul className="list-disc pl-5">
                {read.lokasiMitra.documentChecklist.map((document) => (
                  <li key={document}>{document}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

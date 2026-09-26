import { redirect } from "next/navigation";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { LokasiAuditLogTable } from "../../../../lokasi/audit-log-table";

/** Admin Platform, tab Audit Log: a Lokasi Mitra's whole Audit Log, unfiltered. */
export default async function AdminPlatformLokasiAuditLogPage({
  params,
}: PageProps<"/staf/admin-platform/lokasi/[lokasiId]/audit-log">) {
  const actor = await staffMenuActor("admin_platform");
  const { lokasiId } = await params;
  const { lokasi } = serverRuntime();
  const log = await lokasi.fullAuditLog(actor, lokasiId);
  if (!log.ok) redirect("/staf/admin-platform/lokasi");

  return (
    <>
      <p className="text-body text-muted-foreground">
        Semua Entri Audit Lokasi ini, termasuk Catatan Internal dan klaim Antrean. Admin Lokasi-nya melihatnya tanpa
        keduanya, dengan nomor rekening disamarkan.
      </p>
      <LokasiAuditLogTable entries={log.entries} />
    </>
  );
}

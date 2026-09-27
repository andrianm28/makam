import { redirect } from "next/navigation";
import { PageHeader } from "@/components/makam/page-header";
import { serverRuntime } from "@/server/runtime";
import { LokasiAuditLogTable } from "../../../lokasi/audit-log-table";
import { adminLokasiScope } from "../../scope";

/** Admin Lokasi: the Audit Log of the current Lokasi Mitra (without Catatan Internal and Antrean claims). */
export default async function AdminLokasiAuditLogPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/audit-log">) {
  const { lokasiId } = await params;
  const { actor, current } = await adminLokasiScope(lokasiId);
  const log = await serverRuntime().lokasi.auditLog(actor, current.id);
  if (!log.ok) redirect("/staf/admin-lokasi");

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Setiap perubahan pada Lokasi ini oleh staf, termasuk perubahan tarif, rekening dan status oleh Admin Platform."
      />
      <LokasiAuditLogTable entries={log.entries} />
    </>
  );
}

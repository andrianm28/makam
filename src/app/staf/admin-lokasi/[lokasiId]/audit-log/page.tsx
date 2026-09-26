import Link from "next/link";
import { redirect } from "next/navigation";
import { serverRuntime } from "@/server/runtime";
import { LokasiAuditLogTable } from "../../../lokasi/audit-log-table";
import { adminLokasiScope, LokasiSwitcher } from "../../scope";

/** Admin Lokasi: the Audit Log of the current Lokasi Mitra (without Catatan Internal and Antrean claims). */
export default async function AdminLokasiAuditLogPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/audit-log">) {
  const { lokasiId } = await params;
  const { actor, lokasiMitra, current } = await adminLokasiScope(lokasiId);
  const log = await serverRuntime().lokasi.auditLog(actor, current.id);
  if (!log.ok) redirect("/staf/admin-lokasi");

  return (
    <>
      <LokasiSwitcher lokasiMitra={lokasiMitra} current={current.id} />
      <Link href={`/staf/admin-lokasi/${current.id}`} className="text-sm underline underline-offset-4">
        {current.name}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Audit Log</h1>
      <p className="text-sm text-muted-foreground">
        Setiap perubahan pada Lokasi ini oleh staf, termasuk perubahan tarif, rekening dan status oleh Admin Platform.
      </p>
      <LokasiAuditLogTable entries={log.entries} />
    </>
  );
}

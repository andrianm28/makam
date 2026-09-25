import Link from "next/link";
import { redirect } from "next/navigation";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { LokasiAuditLogTable } from "../../../../lokasi/audit-log-table";

/** Admin Platform: a Lokasi Mitra's whole Audit Log, unfiltered. */
export default async function AdminPlatformLokasiAuditLogPage({
  params,
}: PageProps<"/staf/admin-platform/lokasi/[lokasiId]/audit-log">) {
  const actor = await staffMenuActor("admin_platform");
  const { lokasiId } = await params;
  const { lokasi } = serverRuntime();
  const [read, log] = await Promise.all([lokasi.lokasiMitra(actor, lokasiId), lokasi.fullAuditLog(actor, lokasiId)]);
  if (!read.ok || !log.ok) redirect("/staf/admin-platform/lokasi");

  return (
    <>
      <Link href={`/staf/admin-platform/lokasi/${lokasiId}`} className="text-sm underline underline-offset-4">
        {read.lokasiMitra.name}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Audit Log Lokasi</h1>
      <p className="text-sm text-muted-foreground">
        Semua Entri Audit Lokasi ini, termasuk Catatan Internal dan klaim Antrean. Admin Lokasi-nya melihatnya tanpa
        keduanya, dengan nomor rekening disamarkan.
      </p>
      <LokasiAuditLogTable entries={log.entries} />
    </>
  );
}

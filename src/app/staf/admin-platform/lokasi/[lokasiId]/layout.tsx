import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/makam/page-header";
import { PageTabs } from "@/components/makam/page-tabs";
import { StatusBadge } from "@/components/makam/status-badge";
import { Button } from "@/components/ui/button";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

/**
 * One Lokasi Mitra, for Admin Platform: the header (name, status, pengelola
 * and kota) and the tabs (each its own URL) every page below shares.
 */
export default async function LokasiMitraDetailLayout({
  params,
  children,
}: LayoutProps<"/staf/admin-platform/lokasi/[lokasiId]">) {
  const actor = await staffMenuActor("admin_platform");
  const { lokasiId } = await params;
  const read = await serverRuntime().lokasi.lokasiMitra(actor, lokasiId);
  if (!read.ok) {
    if (read.reason === "tidak_ditemukan") notFound();
    redirect("/staf");
  }
  const lokasiMitra = read.lokasiMitra;
  const base = `/staf/admin-platform/lokasi/${lokasiMitra.id}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={lokasiMitra.name}
        status={<StatusBadge status={lokasiMitra.status} />}
        description={lokasiMitra.pengelolaName}
        actions={
          <Button variant="outline" size="sm" disabled title="Segera hadir">
            Ubah status
          </Button>
        }
      >
        <p className="text-small text-muted-foreground">{lokasiMitra.city}</p>
      </PageHeader>
      <PageTabs
        label={`Tab ${lokasiMitra.name}`}
        items={[
          { href: base, label: "Ringkasan" },
          { href: `${base}/tarif`, label: "Tarif" },
          { href: `${base}/jam-operasional`, label: "Jam Operasional" },
          { href: `${base}/admin-lokasi`, label: "Admin Lokasi" },
          { href: `${base}/audit-log`, label: "Audit Log" },
        ]}
      />
      {children}
    </div>
  );
}

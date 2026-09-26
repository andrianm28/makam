import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { LokasiMitraSummary } from "@/domain/lokasi";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

/**
 * Every Admin Lokasi screen is scoped to the current Lokasi Mitra, named in
 * its URL (`/staf/admin-lokasi/<lokasiId>/…`). It must be one the Akun is
 * Admin Lokasi of (Admin Platform's wider access does not count here);
 * anything else goes back to the Admin Lokasi start.
 */
export async function adminLokasiScope(lokasiId: string) {
  const actor = await staffMenuActor("admin_lokasi");
  const lokasiMitra = await serverRuntime().lokasi.lokasiMitraOfAdminLokasi(actor);
  const current = lokasiMitra.find((lokasi) => lokasi.id === lokasiId);
  if (!current) redirect("/staf/admin-lokasi");
  return { actor, lokasiMitra, current };
}

/** The Lokasi switcher, for an Admin Lokasi of several Lokasi Mitra. */
export function LokasiSwitcher({ lokasiMitra, current }: { lokasiMitra: LokasiMitraSummary[]; current: string }) {
  if (lokasiMitra.length < 2) return null;
  return (
    <nav aria-label="Ganti Lokasi" className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Lokasi:</span>
      {lokasiMitra.map((lokasi) => (
        <Link
          key={lokasi.id}
          href={`/staf/admin-lokasi/${lokasi.id}`}
          aria-current={lokasi.id === current ? "page" : undefined}
          className={
            lokasi.id === current
              ? "rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
              : "rounded-full border px-3 py-1 text-sm hover:bg-muted"
          }
        >
          {lokasi.name}
        </Link>
      ))}
    </nav>
  );
}

/** The Admin Lokasi menu of one Lokasi Mitra. Items without a page are shells for later tickets. */
export function adminLokasiMenu(lokasiId: string) {
  return [
    { label: "Audit Log", href: `/staf/admin-lokasi/${lokasiId}/audit-log`, description: "Semua perubahan pada Lokasi ini." },
    { label: "Antrean Lokasi", description: "Segera hadir (tiket 23)." },
    { label: "Denah", description: "Segera hadir (tiket 13)." },
  ];
}

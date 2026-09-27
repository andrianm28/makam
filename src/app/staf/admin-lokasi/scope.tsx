import "server-only";
import { redirect } from "next/navigation";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

/**
 * Every Admin Lokasi screen is scoped to the current Lokasi Mitra, named in
 * its URL (`/staf/admin-lokasi/<lokasiId>/…`). It must be one the Akun is
 * Admin Lokasi of (Admin Platform's wider access does not count here);
 * anything else goes back to the Admin Lokasi start. Switching between an
 * Admin Lokasi's several Lokasi Mitra is the header's LokasiSwitcher
 * (`src/components/makam/lokasi-switcher.tsx`), not a page-level control.
 */
export async function adminLokasiScope(lokasiId: string) {
  const actor = await staffMenuActor("admin_lokasi");
  const lokasiMitra = await serverRuntime().lokasi.lokasiMitraOfAdminLokasi(actor);
  const current = lokasiMitra.find((lokasi) => lokasi.id === lokasiId);
  if (!current) redirect("/staf/admin-lokasi");
  return { actor, lokasiMitra, current };
}

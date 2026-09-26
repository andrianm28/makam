import { redirect } from "next/navigation";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { StaffRoleHome } from "../staff-role-home";

/** The Admin Lokasi start: the first of its Lokasi Mitra (by name), or a note when it has none. */
export default async function AdminLokasiPage() {
  const actor = await staffMenuActor("admin_lokasi");
  const [first] = await serverRuntime().lokasi.lokasiMitraOfAdminLokasi(actor);
  if (first) redirect(`/staf/admin-lokasi/${first.id}`);

  return (
    <StaffRoleHome role="admin_lokasi">
      <p className="text-sm text-muted-foreground">
        Akun Anda belum terhubung ke Lokasi Mitra mana pun. Minta Admin Platform mengundang Anda dari halaman Lokasi Mitra-nya.
      </p>
    </StaffRoleHome>
  );
}

import type { StaffRole } from "@/domain/identity";

/** How each staff role is named on screen. */
export const staffRoleLabels: Record<StaffRole, string> = {
  admin_platform: "Admin Platform",
  admin_lokasi: "Admin Lokasi",
  petugas_lapangan: "Petugas Lapangan",
  mitra_jasa: "Mitra Jasa",
};

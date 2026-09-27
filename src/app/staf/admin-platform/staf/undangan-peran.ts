/**
 * The role an Undangan Staf starts on, and the roles Admin Platform may hand out
 * from the Staf page. Both live here, once, so the form never names a role of
 * its own and the list it offers always contains the one it starts on.
 */
import { staffRoles, type StaffRole } from "@/domain/identity";
import { staffRoleLabels } from "@/lib/staff-role-labels";

export interface RoleOption {
  value: StaffRole;
  label: string;
}

/** The roles the Staf page offers: Admin Lokasi is invited from its own Lokasi Mitra page. */
export function roleUndangan(): RoleOption[] {
  return staffRoles
    .filter((role) => role !== "admin_lokasi")
    .map((role) => ({ value: role, label: staffRoleLabels[role] }));
}

/**
 * Which role an Undangan Staf starts on: a field role, never an Admin role, and
 * always one the page offers — so inviting cannot grant an Admin Platform by
 * accident through the first entry in the list. Undefined only when the page
 * offers no role at all, and then nothing is preselected and the Peran field says
 * so.
 */
export function roleUndanganAwal(ditawarkan: RoleOption[]): StaffRole | undefined {
  return ditawarkan.find((role) => role.value === "petugas_lapangan")?.value ?? ditawarkan[0]?.value;
}

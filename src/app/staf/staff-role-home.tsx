import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StaffRole } from "@/domain/identity";
import { staffRoleLabels } from "./role-labels";
import { heldStaffRoles, staffMenuActor, staffRoleSlugs } from "@/server/staff-area";

export interface MenuItem {
  label: string;
  /** A page that exists; items without one are shells for later tickets. */
  href?: string;
  description: string;
}

/** Each role's own menu. Items without a page are empty shells until their tickets land. */
const menus: Record<StaffRole, MenuItem[]> = {
  admin_platform: [
    { label: "Staf", href: "/staf/admin-platform/staf", description: "Undang staf dan nonaktifkan Akun Staf." },
    {
      label: "Pengaturan Operator",
      href: "/staf/admin-platform/pengaturan-operator",
      description: "Nama resmi, alamat dan kontak Operator; nomor WhatsApp CS dan jam balasnya.",
    },
    { label: "Pindah Nomor", href: "/staf/admin-platform/pindah-nomor", description: "Pindahkan Akun ke nomor baru setelah cek KTP." },
    { label: "Antrean", description: "Segera hadir (tiket 17)." },
    { label: "Lokasi Mitra", href: "/staf/admin-platform/lokasi", description: "Onboarding Lokasi Mitra dan undangan Admin Lokasi." },
  ],
  admin_lokasi: [
    { label: "Antrean Lokasi", description: "Segera hadir (tiket 23)." },
    { label: "Denah", description: "Segera hadir (tiket 13)." },
  ],
  petugas_lapangan: [{ label: "Tugas saya", description: "Segera hadir (tiket 15)." }],
  mitra_jasa: [
    { label: "Pekerjaan", description: "Segera hadir (tiket 56)." },
    { label: "Pencairan", description: "Segera hadir (tiket 57)." },
  ],
};

/**
 * One role's page in the staff area: the role switcher (for an Akun holding
 * several roles) and that role's menu only. A role whose screens are scoped
 * (Admin Lokasi: one Lokasi Mitra) passes its own `title`, `menu` and what
 * goes above the menu (the Lokasi switcher).
 */
export async function StaffRoleHome({
  role,
  title,
  menu,
  children,
}: {
  role: StaffRole;
  title?: string;
  menu?: MenuItem[];
  children?: React.ReactNode;
}) {
  const actor = await staffMenuActor(role);
  const held = heldStaffRoles(actor.roles);
  const label = staffRoleLabels[role];
  const items = menu ?? menus[role];

  return (
    <>
      {held.length > 1 ? <RoleSwitcher held={held} current={role} /> : null}
      {children}
      <h1 className="text-3xl font-semibold tracking-tight">{title ?? label}</h1>
      <nav aria-label={`Menu ${label}`} className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Card key={item.label} size="sm">
            <CardHeader>
              <CardTitle>
                {item.href ? (
                  <Link href={item.href} className="underline-offset-4 hover:underline">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{item.label}</span>
                )}
              </CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </nav>
    </>
  );
}

function RoleSwitcher({ held, current }: { held: StaffRole[]; current: StaffRole }) {
  return (
    <nav aria-label="Ganti peran" className="flex flex-wrap gap-2">
      {held.map((role) => (
        <Link
          key={role}
          href={`/staf/${staffRoleSlugs[role]}`}
          aria-current={role === current ? "page" : undefined}
          className={
            role === current
              ? "rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground"
              : "rounded-full border px-3 py-1 text-sm hover:bg-muted"
          }
        >
          {staffRoleLabels[role]}
        </Link>
      ))}
    </nav>
  );
}

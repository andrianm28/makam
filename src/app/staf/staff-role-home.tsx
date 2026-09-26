import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StaffRole } from "@/domain/identity";
import { staffRoleLabels } from "./role-labels";
import { staffMenuActor } from "@/server/staff-area";

export interface MenuItem {
  label: string;
  /** A page that exists; items without one are shells for later tickets. */
  href?: string;
  description: string;
}

/** The roles whose home is still this card list (Admin Platform has its own Beranda). */
type CardHomeRole = Exclude<StaffRole, "admin_platform">;

/** Each role's own menu. Items without a page are empty shells until their tickets land. */
const menus: Record<CardHomeRole, MenuItem[]> = {
  admin_lokasi: [
    { label: "Antrean Lokasi", description: "Segera hadir." },
    { label: "Denah", description: "Segera hadir." },
  ],
  petugas_lapangan: [{ label: "Tugas saya", description: "Segera hadir." }],
  mitra_jasa: [
    { label: "Pekerjaan", description: "Segera hadir." },
    { label: "Pencairan", description: "Segera hadir." },
  ],
};

/**
 * One role's page in the staff area: that role's pages as cards (the shell's
 * header holds the role switcher). A role whose screens are scoped
 * (Admin Lokasi: one Lokasi Mitra) passes its own `title`, `menu` and what
 * goes above the menu (the Lokasi switcher).
 */
export async function StaffRoleHome({
  role,
  title,
  menu,
  children,
}: {
  role: CardHomeRole;
  title?: string;
  menu?: MenuItem[];
  children?: React.ReactNode;
}) {
  await staffMenuActor(role);
  const label = staffRoleLabels[role];
  const items = menu ?? menus[role];

  return (
    <>
      {children}
      <h1 className="text-3xl font-semibold tracking-tight">{title ?? label}</h1>
      <nav aria-label={`Halaman ${label}`} className="grid gap-3 sm:grid-cols-2">
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

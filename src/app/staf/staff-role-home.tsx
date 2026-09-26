import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StaffRole } from "@/domain/identity";
import { staffRoleLabels } from "@/lib/staff-role-labels";
import { staffMenuActor } from "@/server/staff-area";
import { staffPages } from "@/lib/staff-navigation";

/** The roles whose home is still this card list (Admin Platform has its own Beranda). */
type CardHomeRole = Exclude<StaffRole, "admin_platform">;

/**
 * One role's page in the staff area: that role's pages as cards, from the same
 * list as its sidebar menu (the shell's header holds the role switcher). An
 * Admin Lokasi's home is scoped to one Lokasi Mitra (`lokasiId`) and passes its
 * own `title` and what goes above the cards (the Lokasi switcher).
 */
export async function StaffRoleHome({
  role,
  lokasiId,
  title,
  children,
}: {
  role: CardHomeRole;
  lokasiId?: string;
  title?: string;
  children?: React.ReactNode;
}) {
  await staffMenuActor(role);
  const label = staffRoleLabels[role];
  const items = staffPages(role, { lokasiId });

  return (
    <>
      {children}
      <h1 className="text-3xl font-semibold tracking-tight">{title ?? label}</h1>
      {items.length > 0 ? (
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
      ) : null}
    </>
  );
}

import {
  BanknoteIcon,
  BriefcaseIcon,
  CalendarXIcon,
  ClipboardListIcon,
  ClockIcon,
  FileClockIcon,
  GridIcon,
  InboxIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  MapPinnedIcon,
  PhoneForwardedIcon,
  ReceiptIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import type { StaffRole } from "@/domain/identity";
import { staffRoleHome, staffRoleSlugs } from "@/lib/staff-area-path";
import { staffRoleLabels } from "./role-labels";

/**
 * The staff shell's navigation: each role's sidebar menu, and where a staff
 * URL sits in it. Plain data and pure functions, shared by the server layout
 * and the client shell.
 */

export interface NavItem {
  label: string;
  /** The page it opens. Without one, the page is not built yet: the item shows, but disabled. */
  href?: string;
  icon: LucideIcon;
  /** Active only on its own page, not on the pages under it (a role's Beranda). */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const AP = staffRoleHome("admin_platform");
const AL = staffRoleHome("admin_lokasi");

function beranda(href: string): NavItem {
  return { label: "Beranda", href, icon: LayoutDashboardIcon, exact: true };
}

/**
 * The sidebar menu of one staff role. An Admin Lokasi's menu is scoped to the
 * Lokasi Mitra it is working on (`lokasiId`, from the page's URL).
 */
export function staffMenu(role: StaffRole, scope: { lokasiId?: string } = {}): NavGroup[] {
  switch (role) {
    case "admin_platform":
      return [
        {
          label: "Kerja harian",
          items: [beranda(AP), { label: "Antrean", icon: InboxIcon }],
        },
        {
          label: "Lokasi dan harga",
          items: [
            { label: "Lokasi Mitra", href: `${AP}/lokasi`, icon: MapPinnedIcon },
            { label: "Tarif global", href: `${AP}/tarif`, icon: ReceiptIcon },
            { label: "Hari Libur Nasional", href: `${AP}/hari-libur`, icon: CalendarXIcon },
          ],
        },
        {
          label: "Orang",
          items: [
            { label: "Staf", href: `${AP}/staf`, icon: UsersIcon },
            { label: "Pindah Nomor", href: `${AP}/pindah-nomor`, icon: PhoneForwardedIcon },
          ],
        },
        {
          label: "Operator",
          items: [
            { label: "Pengaturan Operator", href: `${AP}/pengaturan-operator`, icon: SettingsIcon },
            { label: "Audit Log", icon: FileClockIcon },
          ],
        },
      ];
    case "admin_lokasi": {
      if (!scope.lokasiId) return [{ label: "Lokasi ini", items: [beranda(AL)] }];
      const lokasi = `${AL}/${scope.lokasiId}`;
      return [
        {
          label: "Lokasi ini",
          items: [
            beranda(lokasi),
            { label: "Antrean Lokasi", icon: InboxIcon },
            { label: "Denah", icon: GridIcon },
            { label: "Jam Operasional", href: `${lokasi}/jam-operasional`, icon: ClockIcon },
            { label: "Audit Log", href: `${lokasi}/audit-log`, icon: FileClockIcon },
          ],
        },
      ];
    }
    case "petugas_lapangan":
      return [
        {
          label: "Lapangan",
          items: [beranda(staffRoleHome("petugas_lapangan")), { label: "Tugas saya", icon: ClipboardListIcon }],
        },
      ];
    case "mitra_jasa":
      return [
        {
          label: "Mitra Jasa",
          items: [
            beranda(staffRoleHome("mitra_jasa")),
            { label: "Pekerjaan", icon: BriefcaseIcon },
            { label: "Pencairan", icon: BanknoteIcon },
          ],
        },
      ];
  }
}

/**
 * Which role's pages a staff URL belongs to, and for an Admin Lokasi page the
 * Lokasi Mitra it is scoped to. Pages every role shares (Email) belong to none.
 */
export function staffPage(pathname: string): { role: StaffRole | null; lokasiId?: string } {
  const role = (Object.keys(staffRoleSlugs) as StaffRole[]).find((candidate) => within(pathname, staffRoleHome(candidate))) ?? null;
  if (role !== "admin_lokasi") return { role };
  const [lokasiId] = pathname.slice(AL.length + 1).split("/");
  return lokasiId ? { role, lokasiId } : { role };
}

export interface Crumb {
  label: string;
  /** Every crumb but the current page links back up. */
  href?: string;
}

/** Pages every staff role shares, outside any role's menu. */
const sharedPages: Record<string, string> = { "/staf/email": "Email" };

/** Pages under a menu item's page (a Lokasi Mitra's Tarif, Audit Log, …). */
const subPages: Record<string, string> = {
  tarif: "Tarif",
  "audit-log": "Audit Log",
  "jam-operasional": "Jam Operasional",
};

/**
 * The breadcrumbs of a staff page: its role, the menu item it sits under, then
 * the pages below that. `lokasiName` names a Lokasi Mitra by id; one it cannot
 * name reads "Lokasi Mitra".
 */
export function staffBreadcrumbs(pathname: string, lokasiName: (lokasiId: string) => string | undefined): Crumb[] {
  const { role, lokasiId } = staffPage(pathname);
  if (!role) return [{ label: sharedPages[pathname] ?? "Area Staf" }];
  const home = staffRoleHome(role);
  const trail: Crumb[] = [{ label: staffRoleLabels[role], href: home }];
  const nameOf = (id: string) => lokasiName(id) ?? "Lokasi Mitra";

  let base: string;
  if (role === "admin_lokasi") {
    if (!lokasiId) return withoutLastLink([...trail, { label: "Beranda" }]);
    base = `${home}/${lokasiId}`;
    trail.push({ label: nameOf(lokasiId), href: base });
  } else {
    const item = staffMenu(role)
      .flatMap((group) => group.items)
      .find((candidate) => isActiveItem(candidate, pathname));
    if (!item?.href) return withoutLastLink([...trail, { label: "Beranda" }]);
    base = item.href;
    trail.push({ label: item.label, href: base });
  }

  const below = pathname.slice(base.length).split("/").filter(Boolean);
  below.forEach((segment, index) => {
    base = `${base}/${segment}`;
    const label = index === 0 && base.startsWith(`${home}/lokasi/`) ? nameOf(segment) : (subPages[segment] ?? segment);
    trail.push({ label, href: base });
  });
  return withoutLastLink(trail);
}

function withoutLastLink(trail: Crumb[]): Crumb[] {
  const last = trail.at(-1)!;
  return [...trail.slice(0, -1), { label: last.label }];
}

/** Whether a menu item is the current place: its page, or a page under it. */
export function isActiveItem(item: NavItem, pathname: string): boolean {
  if (!item.href) return false;
  return item.exact ? pathname === item.href : within(pathname, item.href);
}

function within(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

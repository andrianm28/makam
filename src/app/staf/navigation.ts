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
import { staffRoleLabels } from "@/lib/staff-role-labels";

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
  /** What the page is for, in one line (the role's card list on its home); "Segera hadir." while unbuilt. */
  description: string;
  /** Active only on its own page, not on the pages under it (a role's Beranda). */
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const AP = staffRoleHome("admin_platform");
const AL = staffRoleHome("admin_lokasi");
const SEGERA = "Segera hadir.";

function beranda(href: string, description: string): NavItem {
  return { label: "Beranda", href, icon: LayoutDashboardIcon, description, exact: true };
}

/**
 * The sidebar menu of one staff role: the one list of its pages (the role's
 * home derives its cards from it). An Admin Lokasi's menu is scoped to the
 * Lokasi Mitra it is working on (`lokasiId`, from the page's URL).
 */
export function staffMenu(role: StaffRole, scope: { lokasiId?: string } = {}): NavGroup[] {
  switch (role) {
    case "admin_platform":
      return [
        {
          label: "Kerja harian",
          items: [
            beranda(AP, "Ringkasan Lokasi Mitra, Akun Staf, Hari Libur Nasional dan Pengaturan Operator."),
            { label: "Antrean", icon: InboxIcon, description: SEGERA },
          ],
        },
        {
          label: "Lokasi dan harga",
          items: [
            {
              label: "Lokasi Mitra",
              href: `${AP}/lokasi`,
              icon: MapPinnedIcon,
              description: "Onboarding Lokasi Mitra dan undangan Admin Lokasi.",
            },
            {
              label: "Tarif global",
              href: `${AP}/tarif`,
              icon: ReceiptIcon,
              description: "Biaya Layanan Platform, Biaya Pengurusan dan Retribusi Pemda, per versi dengan tanggal berlaku.",
            },
            {
              label: "Hari Libur Nasional",
              href: `${AP}/hari-libur`,
              icon: CalendarXIcon,
              description: "Daftar hari libur untuk hari kerja Admin Platform.",
            },
          ],
        },
        {
          label: "Orang",
          items: [
            { label: "Staf", href: `${AP}/staf`, icon: UsersIcon, description: "Undang staf dan nonaktifkan Akun Staf." },
            {
              label: "Pindah Nomor",
              href: `${AP}/pindah-nomor`,
              icon: PhoneForwardedIcon,
              description: "Pindahkan Akun ke nomor baru setelah cek KTP.",
            },
          ],
        },
        {
          label: "Operator",
          items: [
            {
              label: "Pengaturan Operator",
              href: `${AP}/pengaturan-operator`,
              icon: SettingsIcon,
              description: "Nama resmi, alamat dan kontak Operator; nomor WhatsApp CS dan jam balasnya.",
            },
            { label: "Audit Log", icon: FileClockIcon, description: SEGERA },
          ],
        },
      ];
    case "admin_lokasi": {
      if (!scope.lokasiId) return [{ label: "Lokasi ini", items: [beranda(AL, "Lokasi Mitra yang Anda kelola.")] }];
      const lokasi = `${AL}/${scope.lokasiId}`;
      return [
        {
          label: "Lokasi ini",
          items: [
            beranda(lokasi, "Lokasi Mitra ini sekilas."),
            { label: "Antrean Lokasi", icon: InboxIcon, description: SEGERA },
            { label: "Denah", icon: GridIcon, description: SEGERA },
            {
              label: "Jam Operasional",
              href: `${lokasi}/jam-operasional`,
              icon: ClockIcon,
              description: "Jam buka mingguan, tanggal tutup dan Kontak Siaga.",
            },
            { label: "Audit Log", href: `${lokasi}/audit-log`, icon: FileClockIcon, description: "Semua perubahan pada Lokasi ini." },
          ],
        },
      ];
    }
    case "petugas_lapangan":
      return [
        {
          label: "Lapangan",
          items: [
            beranda(staffRoleHome("petugas_lapangan"), "Pekerjaan lapangan Anda."),
            { label: "Tugas", icon: ClipboardListIcon, description: SEGERA },
          ],
        },
      ];
    case "mitra_jasa":
      return [
        {
          label: "Mitra Jasa",
          items: [
            beranda(staffRoleHome("mitra_jasa"), "Pekerjaan Layanan dan Pencairan Anda."),
            { label: "Pekerjaan", icon: BriefcaseIcon, description: SEGERA },
            { label: "Pencairan", icon: BanknoteIcon, description: SEGERA },
          ],
        },
      ];
  }
}

/** A role's pages other than its Beranda: the cards on the role's home. */
export function staffPages(role: StaffRole, scope: { lokasiId?: string } = {}): NavItem[] {
  return staffMenu(role, scope)
    .flatMap((group) => group.items)
    .filter((item) => !item.exact);
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

/**
 * Whose menu the shell shows on a page: the page's role when the Akun holds it,
 * otherwise (a shared page such as Email, or a page it is about to be sent away
 * from) the first staff role it holds.
 */
export function menuRole(pathname: string, held: readonly StaffRole[]): StaffRole {
  const { role } = staffPage(pathname);
  return role && held.includes(role) ? role : held[0];
}

/** Whether a menu item is the current place: its page, or a page under it. */
export function isActiveItem(item: NavItem, pathname: string): boolean {
  if (!item.href) return false;
  return item.exact ? pathname === item.href : within(pathname, item.href);
}

function within(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

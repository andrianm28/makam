import {
  BanknoteIcon,
  BellIcon,
  BriefcaseIcon,
  CalendarClockIcon,
  CalendarXIcon,
  ClipboardListIcon,
  ClockIcon,
  FileClockIcon,
  FileSearchIcon,
  FlowerIcon,
  GridIcon,
  InboxIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  LandmarkIcon,
  MapPinnedIcon,
  PaletteIcon,
  ReceiptIcon,
  SettingsIcon,
  UserRoundCheckIcon,
  UserRoundIcon,
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
  /** The role's Beranda: active only on its own page, not on the pages under it, and no card on the role's home. */
  isBeranda?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const AP = staffRoleHome("admin_platform");
const AL = staffRoleHome("admin_lokasi");
const SEGERA = "Segera hadir.";

/** Akun Saya: shared by every actor (Pemesan or staff), so it sits outside any role's own URL space. */
const AKUN: NavItem = { label: "Akun", href: "/akun", icon: UserRoundIcon, description: "Email, nomor telepon dan Keluar." };

function beranda(href: string, description: string): NavItem {
  return { label: "Beranda", href, icon: LayoutDashboardIcon, description, isBeranda: true };
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
            {
              label: "Antrean",
              href: `${AP}/antrean`,
              icon: InboxIcon,
              description: "Setiap baris kerja terbuka, per tier dan tenggat; Ambil dan Catatan Internal.",
            },
            {
              label: "Tagihan",
              href: `${AP}/tagihan`,
              icon: FileSearchIcon,
              description: "Cari Tagihan dari nomor Tagihan atau nomor pesanan: catat pembayaran manual, Harga Khusus, batalkan pembayaran langsung.",
            },
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
              label: "TPU DKI",
              href: `${AP}/tpu`,
              icon: LandmarkIcon,
              description: "Daftar TPU resmi DKI: alamat, sumber data dan status menerima makam baru.",
            },
            {
              label: "Tarif global",
              href: `${AP}/tarif`,
              icon: ReceiptIcon,
              description: "Biaya Layanan Platform, Biaya Pengurusan dan Retribusi Pemda, per versi dengan tanggal berlaku.",
            },
            {
              label: "Katalog Layanan",
              href: `${AP}/layanan`,
              icon: FlowerIcon,
              description:
                "Daftar Layanan global, tanda boleh di TPU DKI, harga TPU DKI dan tarif Mitra Jasa, serta Paket Layanan.",
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
              label: "Pemulihan Akun",
              href: `${AP}/pemulihan-akun`,
              icon: UserRoundCheckIcon,
              description: "Pindahkan Akun ke Email Terverifikasi baru setelah cek KTP.",
            },
            {
              label: "Tugas Lapangan",
              href: `${AP}/tugas-lapangan`,
              icon: ClipboardListIcon,
              description: "Buat dan tugaskan Kunjungan Verifikasi, Cek Denah dan Tugas Lapangan lain ke Petugas Lapangan.",
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
              description: "Nama resmi, alamat dan kontak Operator; nomor CS dan jam balasnya.",
            },
            { label: "Audit Log", icon: FileClockIcon, description: SEGERA },
            {
              label: "Katalog Desain",
              href: `${AP}/desain`,
              icon: PaletteIcon,
              description: "Token warna, skala tipografi, komponen dan status yang tersedia di sistem desain.",
            },
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
            {
              label: "Antrean Lokasi",
              href: `${lokasi}/antrean`,
              icon: InboxIcon,
              description: "Baris kerja terbuka di Lokasi Mitra ini: konfirmasi pesanan, dokumen, petak yang belum dicek.",
            },
            {
              label: "Denah",
              href: `${lokasi}/denah`,
              icon: GridIcon,
              description: "Blok, Petak Makam dan Kavling Keluarga; buat Blok baru dan atur selnya.",
            },
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
    case "petugas_lapangan": {
      const home = staffRoleHome("petugas_lapangan");
      return [
        {
          label: "Lapangan",
          items: [
            {
              label: "Tugas",
              href: `${home}/tugas`,
              icon: ClipboardListIcon,
              description: "Tugas Lapangan yang ditugaskan ke Anda: alamat, pin, tanggal rencana dan formulirnya.",
            },
            { label: "Jadwal", href: `${home}/jadwal`, icon: CalendarClockIcon, description: SEGERA },
            {
              label: "Peringatan",
              href: `${home}/peringatan`,
              icon: BellIcon,
              description: "Peringatan Staf yang dikirim ke Anda.",
            },
            AKUN,
          ],
        },
      ];
    }
    case "mitra_jasa": {
      const home = staffRoleHome("mitra_jasa");
      return [
        {
          label: "Mitra Jasa",
          items: [
            { label: "Pekerjaan", href: `${home}/pekerjaan`, icon: BriefcaseIcon, description: SEGERA },
            { label: "Pencairan", href: `${home}/pencairan`, icon: BanknoteIcon, description: SEGERA },
            {
              label: "Peringatan",
              href: `${home}/peringatan`,
              icon: BellIcon,
              description: "Peringatan Staf yang dikirim ke Anda.",
            },
            AKUN,
          ],
        },
      ];
    }
  }
}

/**
 * The two field roles whose phone shell is a bottom navigation instead of the
 * sidebar-as-sheet (docs/design-system.md, "The staff shell"): each of their
 * menu items sits in one group with no Beranda, so the whole menu is exactly
 * the bottom navigation's items, in order.
 */
export const bottomNavRoles: readonly StaffRole[] = ["petugas_lapangan", "mitra_jasa"];

export function hasBottomNav(role: StaffRole): boolean {
  return (bottomNavRoles as readonly StaffRole[]).includes(role);
}

/** A field role's bottom navigation items, in order (its whole menu, one group). */
export function bottomNavItems(role: StaffRole): NavItem[] {
  return staffMenu(role).flatMap((group) => group.items);
}

export interface PaletteItem {
  label: string;
  href: string;
}

export interface PaletteGroup {
  label: string;
  items: PaletteItem[];
}

/**
 * What the command palette offers one staff role: every page of its menu that
 * is built (never an unbuilt one), and the pages they link to by name. An
 * Admin Platform gets each Lokasi Mitra in `lokasi`; an Admin Lokasi gets its
 * menu once for each Lokasi Mitra in `lokasi`, which must be only its own
 * (the server passes exactly those).
 */
export function staffPalette(role: StaffRole, lokasi: readonly { id: string; name: string }[]): PaletteGroup[] {
  const linked = (groups: NavGroup[], label?: string): PaletteGroup[] =>
    groups
      .map((group) => ({
        label: label ?? group.label,
        items: group.items.flatMap((item) => (item.href ? [{ label: item.label, href: item.href }] : [])),
      }))
      .filter((group) => group.items.length > 0);

  switch (role) {
    case "admin_platform": {
      const groups = linked(staffMenu(role));
      if (lokasi.length === 0) return groups;
      return [
        ...groups,
        { label: "Lokasi Mitra", items: lokasi.map((item) => ({ label: item.name, href: `${AP}/lokasi/${item.id}` })) },
      ];
    }
    case "admin_lokasi":
      if (lokasi.length === 0) return linked(staffMenu(role));
      return lokasi.flatMap((item) => linked(staffMenu(role, { lokasiId: item.id }), item.name));
    default:
      return linked(staffMenu(role));
  }
}

/** A role's pages other than its Beranda: the cards on the role's home. */
export function staffPages(role: StaffRole, scope: { lokasiId?: string } = {}): NavItem[] {
  return staffMenu(role, scope)
    .flatMap((group) => group.items)
    .filter((item) => !item.isBeranda);
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
  denah: "Denah",
  "admin-lokasi": "Admin Lokasi",
};

/**
 * The breadcrumbs of a staff page: its role, the menu item it sits under, then
 * the pages below that. `lokasiName` names a Lokasi Mitra by id; one it cannot
 * name reads "Lokasi Mitra". `blokName` likewise names a Blok under an Admin
 * Lokasi's Denah (`/denah/<blokId>`); one it cannot name reads "Blok".
 */
export function staffBreadcrumbs(
  pathname: string,
  lokasiName: (lokasiId: string) => string | undefined,
  blokName: (blokId: string) => string | undefined,
): Crumb[] {
  const { role, lokasiId } = staffPage(pathname);
  if (!role) return [{ label: sharedPages[pathname] ?? "Area Staf" }];
  const home = staffRoleHome(role);
  const trail: Crumb[] = [{ label: staffRoleLabels[role], href: home }];
  const nameOf = (id: string) => lokasiName(id) ?? "Lokasi Mitra";
  const blokLabel = (id: string) => `Blok ${blokName(id) ?? ""}`.trim();

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
    const label =
      index === 0 && base.startsWith(`${home}/lokasi/`)
        ? nameOf(segment)
        : index === 1 && role === "admin_lokasi" && below[0] === "denah"
          ? blokLabel(segment)
          : (subPages[segment] ?? segment);
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

/**
 * The header Lokasi switcher's target when moving from `pathname` (scoped to
 * `currentLokasiId`) to `targetLokasiId`: the same page for the target Lokasi
 * when that still makes sense (Beranda, Jam Operasional, Audit Log, the Denah
 * list), otherwise the target Lokasi's Denah list (a Blok belongs to one
 * Lokasi only) or its Beranda.
 */
export function lokasiSwitchHref(pathname: string, currentLokasiId: string, targetLokasiId: string): string {
  const base = `${AL}/${currentLokasiId}`;
  const targetBase = `${AL}/${targetLokasiId}`;
  if (pathname === base || !pathname.startsWith(`${base}/`)) return targetBase;
  const rest = pathname.slice(base.length); // e.g. "/jam-operasional", "/denah", "/denah/<blokId>"
  const [, first, ...deeper] = rest.split("/");
  if (first === "denah") return deeper.length > 0 ? `${targetBase}/denah` : `${targetBase}${rest}`;
  if (first === "jam-operasional" || first === "audit-log") return `${targetBase}${rest}`;
  return targetBase;
}

/** Whether a menu item is the current place: its page, or a page under it. */
export function isActiveItem(item: NavItem, pathname: string): boolean {
  if (!item.href) return false;
  return item.isBeranda ? pathname === item.href : within(pathname, item.href);
}

function within(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

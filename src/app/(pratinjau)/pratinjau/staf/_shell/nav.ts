import {
  BanknoteIcon,
  BellIcon,
  BriefcaseIcon,
  CalendarClockIcon,
  CalendarXIcon,
  ClipboardListIcon,
  ClockIcon,
  FileClockIcon,
  GridIcon,
  InboxIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  MapPinnedIcon,
  PaletteIcon,
  PhoneForwardedIcon,
  ReceiptIcon,
  SettingsIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import type { StaffRole } from "@/domain/identity";

/** PROTOTYPE: every preview URL lives under this base. */
export const BASE = "/pratinjau/staf";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const roleLabels: Record<StaffRole, string> = {
  admin_platform: "Admin Platform",
  admin_lokasi: "Admin Lokasi",
  petugas_lapangan: "Petugas Lapangan",
  mitra_jasa: "Mitra Jasa",
};

export const roleHome: Record<StaffRole, string> = {
  admin_platform: BASE,
  admin_lokasi: `${BASE}/admin-lokasi`,
  petugas_lapangan: `${BASE}/petugas-lapangan`,
  mitra_jasa: `${BASE}/mitra-jasa`,
};

/** Roles whose phone layout is the bottom navigation instead of the sheet sidebar. */
export const fieldRoles: StaffRole[] = ["petugas_lapangan", "mitra_jasa"];

/** Which role a preview URL belongs to. The preview holds all four roles. */
export function roleOf(pathname: string): StaffRole {
  if (pathname.startsWith(`${BASE}/mitra-jasa`)) return "mitra_jasa";
  if (pathname.startsWith(`${BASE}/petugas-lapangan`)) return "petugas_lapangan";
  if (pathname.startsWith(`${BASE}/admin-lokasi`)) return "admin_lokasi";
  return "admin_platform";
}

export const menus: Record<StaffRole, NavGroup[]> = {
  admin_platform: [
    {
      label: "Kerja harian",
      items: [
        { label: "Dasbor", href: BASE, icon: LayoutDashboardIcon },
        { label: "Antrean", href: `${BASE}/antrean`, icon: InboxIcon, badge: "17" },
      ],
    },
    {
      label: "Lokasi dan harga",
      items: [
        { label: "Lokasi Mitra", href: `${BASE}/lokasi`, icon: MapPinnedIcon },
        { label: "Tarif global", href: `${BASE}/tarif`, icon: ReceiptIcon },
        { label: "Hari Libur Nasional", href: `${BASE}/hari-libur`, icon: CalendarXIcon },
      ],
    },
    {
      label: "Orang",
      items: [
        { label: "Staf", href: `${BASE}/staf`, icon: UsersIcon },
        { label: "Pindah Nomor", href: `${BASE}/pindah-nomor`, icon: PhoneForwardedIcon },
      ],
    },
    {
      label: "Operator",
      items: [
        { label: "Pengaturan Operator", href: `${BASE}/pengaturan-operator`, icon: SettingsIcon },
        { label: "Audit Log", href: `${BASE}/audit-log`, icon: FileClockIcon },
      ],
    },
  ],
  admin_lokasi: [
    {
      label: "Lokasi ini",
      items: [
        { label: "Antrean Lokasi", href: `${BASE}/admin-lokasi`, icon: InboxIcon, badge: "4" },
        { label: "Denah", href: `${BASE}/admin-lokasi/denah`, icon: GridIcon },
        { label: "Jam Operasional", href: `${BASE}/admin-lokasi/jam-operasional`, icon: ClockIcon },
        { label: "Audit Log", href: `${BASE}/admin-lokasi/audit-log`, icon: FileClockIcon },
      ],
    },
  ],
  petugas_lapangan: [
    {
      label: "Lapangan",
      items: [
        { label: "Tugas", href: `${BASE}/petugas-lapangan`, icon: ClipboardListIcon, badge: "2" },
        { label: "Jadwal", href: `${BASE}/petugas-lapangan/jadwal`, icon: CalendarClockIcon },
        { label: "Peringatan", href: `${BASE}/petugas-lapangan/peringatan`, icon: BellIcon },
        { label: "Akun", href: `${BASE}/petugas-lapangan/akun`, icon: UserRoundIcon },
      ],
    },
  ],
  mitra_jasa: [
    {
      label: "Mitra Jasa",
      items: [
        { label: "Pekerjaan", href: `${BASE}/mitra-jasa`, icon: BriefcaseIcon, badge: "5" },
        { label: "Pencairan", href: `${BASE}/mitra-jasa/pencairan`, icon: BanknoteIcon },
        { label: "Peringatan", href: `${BASE}/mitra-jasa/peringatan`, icon: BellIcon },
        { label: "Akun", href: `${BASE}/mitra-jasa/akun`, icon: UserRoundIcon },
      ],
    },
  ],
};

export const catalogueItem: NavItem = { label: "Katalog design system", href: `${BASE}/katalog`, icon: PaletteIcon };

/** Every titled preview page, for breadcrumbs and the command palette. */
export function pageTitle(pathname: string): string | undefined {
  if (pathname === catalogueItem.href) return catalogueItem.label;
  for (const groups of Object.values(menus)) {
    for (const group of groups) {
      for (const item of group.items) if (item.href === pathname) return item.label;
    }
  }
  return undefined;
}

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { staffRoles, type StaffRole } from "@/domain/identity";
import { isActiveItem, lokasiSwitchHref, menuRole, staffBreadcrumbs, staffMenu, staffPage, staffPalette } from "./staff-navigation";

/** A menu as its reader sees it: group labels and item labels, in order. */
function outline(groups: ReturnType<typeof staffMenu>) {
  return groups.map((group) => [group.label, group.items.map((item) => item.label)]);
}

/** The labels of the items that open a page. */
function linked(groups: ReturnType<typeof staffMenu>) {
  return groups.flatMap((group) => group.items.filter((item) => item.href).map((item) => item.label));
}

const lokasiId = "0b7c9a52-4c1e-4a57-9d4f-1f0f5e1b2c3d";

describe("the staff menu of each role", () => {
  it("Admin Platform works in four groups: Kerja harian, Lokasi dan harga, Orang, Operator, with Audit Log under Operator", () => {
    expect(outline(staffMenu("admin_platform"))).toEqual([
      ["Kerja harian", ["Beranda", "Antrean"]],
      ["Lokasi dan harga", ["Lokasi Mitra", "Tarif global", "Hari Libur Nasional"]],
      ["Orang", ["Staf", "Pemulihan Akun", "Tugas Lapangan"]],
      ["Operator", ["Pengaturan Operator", "Audit Log", "Katalog Desain"]],
    ]);
  });

  it("an Admin Lokasi's menu is scoped to the Lokasi Mitra it is working on", () => {
    const menu = staffMenu("admin_lokasi", { lokasiId });
    expect(outline(menu)).toEqual([["Lokasi ini", ["Beranda", "Antrean Lokasi", "Denah", "Jam Operasional", "Audit Log"]]]);
    expect(menu[0].items.flatMap((item) => (item.href ? [item.href] : []))).toEqual([
      `/staf/admin-lokasi/${lokasiId}`,
      `/staf/admin-lokasi/${lokasiId}/denah`,
      `/staf/admin-lokasi/${lokasiId}/jam-operasional`,
      `/staf/admin-lokasi/${lokasiId}/audit-log`,
    ]);
  });

  it("an Admin Lokasi linked to no Lokasi Mitra yet has only its Beranda", () => {
    expect(outline(staffMenu("admin_lokasi"))).toEqual([["Lokasi ini", ["Beranda"]]]);
  });

  it("Petugas Lapangan and Mitra Jasa keep their own menus, in the short forms of Tugas Lapangan and Pekerjaan Layanan", () => {
    expect(outline(staffMenu("petugas_lapangan"))).toEqual([["Lapangan", ["Beranda", "Tugas"]]]);
    expect(outline(staffMenu("mitra_jasa"))).toEqual([["Mitra Jasa", ["Beranda", "Pekerjaan", "Pencairan"]]]);
  });

  it("items whose page is not built yet open nothing (they show, disabled)", () => {
    expect(linked(staffMenu("admin_platform"))).toEqual([
      "Beranda",
      "Antrean",
      "Lokasi Mitra",
      "Tarif global",
      "Hari Libur Nasional",
      "Staf",
      "Pemulihan Akun",
      "Tugas Lapangan",
      "Pengaturan Operator",
      "Katalog Desain",
    ]);
    expect(linked(staffMenu("petugas_lapangan"))).toEqual(["Beranda", "Tugas"]);
    expect(linked(staffMenu("mitra_jasa"))).toEqual(["Beranda"]);
  });

  it.each(staffRoles)("every %s menu item says what it is for, and an unbuilt one says it is coming", (role) => {
    for (const item of staffMenu(role, { lokasiId }).flatMap((group) => group.items)) {
      expect(item.description, item.label).toMatch(/\S/);
      if (!item.href) expect(item.description).toBe("Segera hadir.");
    }
  });

  it.each(staffRoles)("every %s menu link opens a page that exists", (role) => {
    expect(staffMenu(role, { lokasiId }).length).toBeGreaterThan(0);
    for (const group of staffMenu(role, { lokasiId })) {
      for (const item of group.items) {
        if (!item.href) continue;
        const route = item.href.replace(lokasiId, "[lokasiId]");
        expect(existsSync(`src/app${route}/page.tsx`), item.href).toBe(true);
      }
    }
  });
});

describe("where a staff page sits in the menu", () => {
  it.each<[string, StaffRole | null, string | undefined]>([
    ["/staf/admin-platform", "admin_platform", "Beranda"],
    ["/staf/admin-platform/tarif", "admin_platform", "Tarif global"],
    ["/staf/admin-platform/lokasi", "admin_platform", "Lokasi Mitra"],
    [`/staf/admin-platform/lokasi/${lokasiId}/tarif`, "admin_platform", "Lokasi Mitra"],
    [`/staf/admin-platform/lokasi/${lokasiId}/audit-log`, "admin_platform", "Lokasi Mitra"],
    ["/staf/admin-platform/staf", "admin_platform", "Staf"],
    [`/staf/admin-lokasi/${lokasiId}`, "admin_lokasi", "Beranda"],
    [`/staf/admin-lokasi/${lokasiId}/jam-operasional`, "admin_lokasi", "Jam Operasional"],
    ["/staf/admin-lokasi", "admin_lokasi", "Beranda"],
    ["/staf/petugas-lapangan", "petugas_lapangan", "Beranda"],
    ["/staf/mitra-jasa", "mitra_jasa", "Beranda"],
    ["/staf/email", null, undefined],
  ])("%s belongs to %s, with %s as the one active item", (pathname, role, active) => {
    const page = staffPage(pathname);
    expect(page.role).toBe(role);
    const menu = staffMenu(page.role ?? "admin_platform", { lokasiId: page.lokasiId });
    const activeItems = menu.flatMap((group) => group.items).filter((item) => isActiveItem(item, pathname));
    expect(activeItems.map((item) => item.label)).toEqual(active ? [active] : []);
  });

  it.each<[string, string[]]>([
    ["/staf/admin-platform", ["Admin Platform", "Beranda"]],
    ["/staf/admin-platform/tarif", ["Admin Platform", "Tarif global"]],
    [`/staf/admin-platform/lokasi/${lokasiId}`, ["Admin Platform", "Lokasi Mitra", "Makam Wakaf Al-Ikhlas"]],
    [`/staf/admin-platform/lokasi/${lokasiId}/tarif`, ["Admin Platform", "Lokasi Mitra", "Makam Wakaf Al-Ikhlas", "Tarif"]],
    [`/staf/admin-platform/lokasi/${lokasiId}/audit-log`, ["Admin Platform", "Lokasi Mitra", "Makam Wakaf Al-Ikhlas", "Audit Log"]],
    [`/staf/admin-lokasi/${lokasiId}`, ["Admin Lokasi", "Makam Wakaf Al-Ikhlas"]],
    [`/staf/admin-lokasi/${lokasiId}/jam-operasional`, ["Admin Lokasi", "Makam Wakaf Al-Ikhlas", "Jam Operasional"]],
    ["/staf/admin-lokasi", ["Admin Lokasi", "Beranda"]],
    ["/staf/mitra-jasa", ["Mitra Jasa", "Beranda"]],
    ["/staf/email", ["Email"]],
  ])("the breadcrumbs of %s read %j", (pathname, labels) => {
    const names = (id: string) => (id === lokasiId ? "Makam Wakaf Al-Ikhlas" : undefined);
    expect(staffBreadcrumbs(pathname, names).map((crumb) => crumb.label)).toEqual(labels);
  });

  it("each breadcrumb but the current page links back up; a Lokasi Mitra it cannot name reads Lokasi Mitra", () => {
    expect(staffBreadcrumbs(`/staf/admin-platform/lokasi/${lokasiId}/tarif`, () => undefined)).toEqual([
      { label: "Admin Platform", href: "/staf/admin-platform" },
      { label: "Lokasi Mitra", href: "/staf/admin-platform/lokasi" },
      { label: "Lokasi Mitra", href: `/staf/admin-platform/lokasi/${lokasiId}` },
      { label: "Tarif" },
    ]);
  });

  it("the shell shows the menu of the page's role only when the Akun holds it; otherwise its first held role", () => {
    const held: StaffRole[] = ["petugas_lapangan", "mitra_jasa"];
    expect(menuRole("/staf/mitra-jasa", held)).toBe("mitra_jasa");
    expect(menuRole("/staf/admin-platform/staf", held)).toBe("petugas_lapangan");
    expect(menuRole("/staf/email", held)).toBe("petugas_lapangan");
  });

  it("an Admin Lokasi page names the Lokasi Mitra it is scoped to", () => {
    expect(staffPage(`/staf/admin-lokasi/${lokasiId}/audit-log`).lokasiId).toBe(lokasiId);
    expect(staffPage("/staf/admin-lokasi").lokasiId).toBeUndefined();
    expect(staffPage(`/staf/admin-platform/lokasi/${lokasiId}`).lokasiId).toBeUndefined();
  });
});

describe("the header Lokasi switcher's target", () => {
  const second = "7a2e1d90-5b3c-4e8f-a1d2-3c4b5a697881";
  const blokId = "b1a1c4d8-2e3f-4a5b-9c6d-7e8f9a0b1c2d";

  it("on the Beranda, it goes to the target Lokasi's Beranda", () => {
    expect(lokasiSwitchHref(`/staf/admin-lokasi/${lokasiId}`, lokasiId, second)).toBe(`/staf/admin-lokasi/${second}`);
  });

  it("on Jam Operasional or Audit Log, it keeps the same page for the target Lokasi", () => {
    expect(lokasiSwitchHref(`/staf/admin-lokasi/${lokasiId}/jam-operasional`, lokasiId, second)).toBe(
      `/staf/admin-lokasi/${second}/jam-operasional`,
    );
    expect(lokasiSwitchHref(`/staf/admin-lokasi/${lokasiId}/audit-log`, lokasiId, second)).toBe(
      `/staf/admin-lokasi/${second}/audit-log`,
    );
  });

  it("on the Denah list, it keeps Denah for the target Lokasi", () => {
    expect(lokasiSwitchHref(`/staf/admin-lokasi/${lokasiId}/denah`, lokasiId, second)).toBe(`/staf/admin-lokasi/${second}/denah`);
  });

  it("on one Blok's Denah editor (a Blok of the current Lokasi only), it falls back to the target Lokasi's Denah list", () => {
    expect(lokasiSwitchHref(`/staf/admin-lokasi/${lokasiId}/denah/${blokId}`, lokasiId, second)).toBe(
      `/staf/admin-lokasi/${second}/denah`,
    );
  });
});

describe("the command palette of each role", () => {
  it("an Admin Lokasi of two Lokasi Mitra finds each one's pages under its name", () => {
    const second = "7a2e1d90-5b3c-4e8f-a1d2-3c4b5a697881";
    expect(
      staffPalette("admin_lokasi", [
        { id: lokasiId, name: "Makam Wakaf Al-Ikhlas" },
        { id: second, name: "TPU Keluarga Sentosa" },
      ]).map((group) => [group.label, group.items.map((item) => item.href)]),
    ).toEqual([
      ["Makam Wakaf Al-Ikhlas", [`/staf/admin-lokasi/${lokasiId}`, `/staf/admin-lokasi/${lokasiId}/denah`, `/staf/admin-lokasi/${lokasiId}/jam-operasional`, `/staf/admin-lokasi/${lokasiId}/audit-log`]],
      ["TPU Keluarga Sentosa", [`/staf/admin-lokasi/${second}`, `/staf/admin-lokasi/${second}/denah`, `/staf/admin-lokasi/${second}/jam-operasional`, `/staf/admin-lokasi/${second}/audit-log`]],
    ]);
  });

  it("an Admin Lokasi linked to no Lokasi Mitra yet finds only its Beranda", () => {
    expect(staffPalette("admin_lokasi", [])).toEqual([{ label: "Lokasi ini", items: [{ label: "Beranda", href: "/staf/admin-lokasi" }] }]);
  });
});

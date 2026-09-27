import { describe, expect, it } from "vitest";
import { pageExists } from "../../tests/support/page-exists";
import {
  AKSI_MAKAM_KELUARGA,
  HUB_PATH,
  TPU_DAFTAR_PATH,
  TPU_GUIDE_PATH,
  aksiDari,
  bentukCariDari,
  hubPath,
  kartuAksi,
  kartuUntuk,
  tileKeHub,
} from "./makam-keluarga-content";

/**
 * The hub's own words and addresses (spec, Public site and routing decisions: it
 * owns the Lokasi Mitra / TPU branch, and the Perpanjang Makam and Layanan Makam
 * tiles open it with that action preselected).
 */
describe("the Makam keluarga hub's branches", () => {
  it("is the four the hub owns, tumpang, Perpanjang, Layanan and Pengurusan IPTM", () => {
    expect(AKSI_MAKAM_KELUARGA).toEqual(["tumpang", "perpanjang", "layanan", "pengurusan"]);
    expect(kartuAksi.map((kartu) => kartu.aksi)).toEqual([...AKSI_MAKAM_KELUARGA]);
  });

  it("links no action whose flow a later ticket has not built, and promises no date", () => {
    // Each flow is its own ticket (35, 40/41, 50/53/54, 47/48), so every card is a branch
    // that is here and a page that is not: no href, no date, the CS instead.
    for (const kartu of kartuAksi) {
      expect(kartu.href, `${kartu.label} links a flow that is not built`).toBeUndefined();
      expect(kartu.label.length, kartu.aksi).toBeGreaterThan(3);
      expect(kartu.ringkas).toMatch(/[.!?]$/);
    }
    expect(kartuAksi.map((kartu) => `${kartu.label} ${kartu.ringkas}`).join(" ")).not.toMatch(/\d{4}/);
  });

  it("is opened by the Beranda's two tiles with that action preselected, and the hub page exists", () => {
    expect(tileKeHub).toEqual({
      perpanjang: "/makam-keluarga?aksi=perpanjang",
      layanan: "/makam-keluarga?aksi=layanan",
    });
    expect(pageExists(HUB_PATH), HUB_PATH).toBe(true);
  });

  it("reads an action it owns out of the address, and no other", () => {
    expect(aksiDari("perpanjang")).toBe("perpanjang");
    expect(aksiDari(["layanan", "tumpang"])).toBe("layanan");
    for (const bukan of ["hapus", "", undefined]) {
      expect(aksiDari(bukan), String(bukan)).toBeNull();
    }
    expect(kartuUntuk("perpanjang").label).toBe("Perpanjang Makam");
  });

  it("reads which of the three forms the family is on, and no other", () => {
    expect(bentukCariDari("nomor_makam")).toBe("nomor_makam");
    expect(bentukCariDari("nama")).toBe("nama");
    expect(bentukCariDari("kartu")).toBeNull();
    expect(bentukCariDari(undefined)).toBeNull();
  });

  it("keeps the chosen branch in the address a shortcut carries, and the TPU branch points at pages that exist", () => {
    expect(hubPath({})).toBe("/makam-keluarga");
    expect(hubPath({ aksi: "layanan", lokasiId: "abc", cari: "nomor_makam", nomor: "A-1" })).toBe(
      "/makam-keluarga?aksi=layanan&lokasi=abc&cari=nomor_makam&nomor=A-1",
    );
    // Without a Lokasi there is nothing to look up, so the address stays the hub's own.
    expect(hubPath({ aksi: "tumpang" })).toBe("/makam-keluarga?aksi=tumpang");
    expect(pageExists(TPU_GUIDE_PATH), TPU_GUIDE_PATH).toBe(true);
    // The directory answer carries a filter, so the check reads its path.
    expect(pageExists(new URL(TPU_DAFTAR_PATH, "http://makam.test").pathname), TPU_DAFTAR_PATH).toBe(true);
  });
});

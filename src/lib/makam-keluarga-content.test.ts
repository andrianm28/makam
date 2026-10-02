import { describe, expect, it } from "vitest";
import type { MakamSaya, PetakDitemukan } from "@/domain/inventory";
import { pageExists } from "../../tests/support/page-exists";
import {
  AKSI_MAKAM_KELUARGA,
  HUB_PATH,
  LAYANAN_PATH,
  layananPath,
  TPU_DAFTAR_PATH,
  TPU_GUIDE_PATH,
  aksiDari,
  barisMakamSaya,
  bentukCariDari,
  hubPath,
  kartuAksi,
  kartuMakamSaya,
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

  it("links exactly the actions whose flow is built, to a page that exists, and promises no date", () => {
    // Each flow is its own ticket. The Layanan branch is here (50), so its card links
    // to the checkout; the other three are still a branch that is here and a page
    // that is not — no href, no date, the CS instead. A card that grows an `href`
    // is only allowed to do so where `pageExists` agrees, which is what stops a link
    // to a page nobody wrote.
    const dibangun = new Set(["layanan"]);
    for (const kartu of kartuAksi) {
      // Perpanjang is built: its flow starts from a grave, so its card says what to do with the lookup result.
      expect(kartu.langkah !== undefined, `${kartu.label} langkah`).toBe(kartu.aksi === "perpanjang");
      if (dibangun.has(kartu.aksi)) {
        expect(kartu.href, `${kartu.label} should link its built flow`).toEqual(LAYANAN_PATH);
        expect(pageExists(kartu.href as string), `${kartu.href} has no page`).toBe(true);
      } else {
        expect(kartu.href, `${kartu.label} links a flow that is not built`).toBeUndefined();
      }
      expect(kartu.label.length, kartu.aksi).toBeGreaterThan(3);
      expect(kartu.ringkas).toMatch(/[.!?]$/);
    }
    expect(kartuAksi.map((kartu) => `${kartu.label} ${kartu.ringkas}`).join(" ")).not.toMatch(/\d{4}/);
  });

  it("addresses the Layanan checkout with the grave the lookup named", () => {
    // The Petak is addressed by its id, not its number: the number is what the
    // family reads, and the page re-reads the grave's own state from the Inventory
    // module, so a stale address cannot order for a plot that has moved on.
    expect(layananPath({ lokasiId: "11111111-1111-4111-8111-111111111111", petakId: "22222222-2222-4222-8222-222222222222" })).toBe(
      "/layanan?lokasi=11111111-1111-4111-8111-111111111111&petak=22222222-2222-4222-8222-222222222222",
    );
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

/** One Petak Makam of a lookup answer, as the domain hands it over. */
function petak(nomorMakam: string, almarhum: string[] = []): PetakDitemukan {
  return { petakId: `id-${nomorMakam}`, nomorMakam, almarhum, statusHakPakai: "aktif", tanggalBerakhir: "2027-03-01" };
}

describe("the Makam tab row, which the hub and Akun Saya both render", () => {
  const nama = new Map([["lokasi-1", "Makam Keluarga Sawah"]]);

  it("names a Petak by its Nomor Makam and opens the hub on that number", () => {
    const baris = barisMakamSaya({ hakPakaiId: "hak-1", lokasiId: "lokasi-1", kavlingId: null, nomorKavling: null, petak: [petak("A-01", ["Hasan"])] }, nama);

    expect(baris).toEqual({
      lokasiId: "lokasi-1",
      namaLokasi: "Makam Keluarga Sawah",
      nomor: "A-01",
      almarhum: ["Hasan"],
      alamat: "/makam-keluarga?lokasi=lokasi-1&cari=nomor_makam&nomor=A-01",
    });
  });

  it("names a Kavling Keluarga by its own Nomor Kavling and looks it up as one whole", () => {
    const baris = barisMakamSaya(
      { hakPakaiId: "hak-1", lokasiId: "lokasi-1", kavlingId: "kavling-1", nomorKavling: "A-K01", petak: [petak("A-01", ["Hasan"]), petak("A-02")] },
      nama,
      "perpanjang",
    );

    expect(baris).toEqual({
      lokasiId: "lokasi-1",
      namaLokasi: "Makam Keluarga Sawah",
      nomor: "A-K01",
      almarhum: ["Hasan"],
      alamat: "/makam-keluarga?aksi=perpanjang&lokasi=lokasi-1&cari=nomor_kavling&nomor=A-K01",
    });
  });

  it("says 'Lokasi Mitra' for a Lokasi the public list does not name, rather than guessing one", () => {
    const baris = barisMakamSaya({ hakPakaiId: "hak-9", lokasiId: "lokasi-9", kavlingId: null, nomorKavling: null, petak: [petak("B-04")] }, nama);

    expect(baris.namaLokasi).toBe("Lokasi Mitra");
  });
});

/** One `MakamSaya` unit, as the Inventory module hands it over for the Akun Saya Makam tab. */
function makamSaya(over: Partial<MakamSaya> = {}): MakamSaya {
  return {
    hakPakaiId: "hak-pakai-1",
    lokasiId: "lokasi-1",
    kavlingId: null,
    nomorKavling: null,
    petak: [{ petakId: "id-A-01", nomorMakam: "A-01" }],
    status: "aktif",
    tenureYears: 5,
    tanggalBerakhir: "2031-10-02",
    pemakaman: [{ id: "pemakaman-1", lokasiId: "lokasi-1", petakId: "id-A-01", hakPakaiId: "hak-pakai-1", almarhumName: "Siti Nur", date: "2019-04-02", layer: 1 }],
    ...over,
  };
}

describe("the Akun Saya Makam tab's own card: the full record, not a shortcut", () => {
  const nama = new Map([["lokasi-1", "Makam Keluarga Sawah"]]);

  it("carries the status in words, the end date, every Pemakaman and every document handed in", () => {
    const kartu = kartuMakamSaya(makamSaya(), nama, [{ nomor: "BPM/2026/000001", href: "/dokumen/abc123" }]);

    expect(kartu).toEqual({
      hakPakaiId: "hak-pakai-1",
      lokasiId: "lokasi-1",
      namaLokasi: "Makam Keluarga Sawah",
      nomor: "A-01",
      petak: [{ nomorMakam: "A-01" }],
      status: { key: "aktif", label: "Aktif", arti: expect.any(String) },
      tanggalBerakhir: "2031-10-02",
      pemakaman: [{ almarhumName: "Siti Nur", date: "2019-04-02" }],
      dokumen: [{ nomor: "BPM/2026/000001", href: "/dokumen/abc123" }],
      alamat: "/makam-keluarga?lokasi=lokasi-1&cari=nomor_makam&nomor=A-01",
      hanyaBaca: false,
      pengelola: null,
    });
  });

  it("names a Kavling Keluarga by its own Nomor Kavling and looks it up as one whole, same as the shortcut row", () => {
    const kartu = kartuMakamSaya(
      makamSaya({ kavlingId: "kavling-1", nomorKavling: "A-K01", petak: [{ petakId: "id-A-01", nomorMakam: "A-01" }, { petakId: "id-A-02", nomorMakam: "A-02" }] }),
      nama,
      [],
    );

    expect(kartu.nomor).toBe("A-K01");
    expect(kartu.alamat).toBe("/makam-keluarga?lokasi=lokasi-1&cari=nomor_kavling&nomor=A-K01");
    expect(kartu.petak).toEqual([{ nomorMakam: "A-01" }, { nomorMakam: "A-02" }]);
  });

  it("shows a Hak Pakai at a Berhenti Lokasi after the effective date as read-only: kept with its documents, no Perpanjang or Layanan", () => {
    const berhenti = new Map([["lokasi-1", { pengelolaName: "Pak Haji Rahmat", address: "Jl. Pemakaman No. 1, Bekasi", telepon: "+6281234567890", email: "rahmat@example.com" }]]);
    const kartu = kartuMakamSaya(makamSaya(), nama, [{ nomor: "BPM/2026/000001", href: "/dokumen/abc123" }], berhenti);

    expect(kartu.hanyaBaca).toBe(true);
    expect(kartu.pengelola).toEqual({
      name: "Pak Haji Rahmat",
      address: "Jl. Pemakaman No. 1, Bekasi",
      telepon: "0812-3456-7890",
      email: "rahmat@example.com",
    });
    expect(kartu.dokumen).toEqual([{ nomor: "BPM/2026/000001", href: "/dokumen/abc123" }]);
    expect(kartu.pemakaman).toHaveLength(1);
    expect(kartuMakamSaya(makamSaya(), nama, [], new Map([["lokasi-lain", { pengelolaName: "X", address: "Y", telepon: null, email: null }]])).hanyaBaca).toBe(false);
    expect(kartuMakamSaya(makamSaya(), nama, []).hanyaBaca).toBe(false);
  });

  it("shows no phone or email for a pengelola whose Lokasi Mitra holds none, only the name and address", () => {
    const berhenti = new Map([["lokasi-1", { pengelolaName: "Pak Haji Rahmat", address: "Jl. Pemakaman No. 1", telepon: null, email: null }]]);

    expect(kartuMakamSaya(makamSaya(), nama, [], berhenti).pengelola).toEqual({
      name: "Pak Haji Rahmat",
      address: "Jl. Pemakaman No. 1",
      telepon: null,
      email: null,
    });
  });

  it("has no documents while none were handed in, rather than inventing one", () => {
    expect(kartuMakamSaya(makamSaya(), nama, []).dokumen).toEqual([]);
  });
});

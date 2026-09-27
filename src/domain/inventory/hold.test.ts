import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { refusable } from "@/db/unit-of-work";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { publishOnTestDatabase, signedInAdminPlatform } from "../../../tests/support/publish";
import { terencanaLokasi, type TerencanaLokasi } from "../../../tests/support/terencana";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

type Setup = ReturnType<typeof publishOnTestDatabase>;

/** What the Denah says about one Petak Makam, read back through the module's own public read. */
async function statusOf(setup: Setup, fixture: TerencanaLokasi, nomor: string) {
  const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
  return denah?.bloks.flatMap((blok) => blok.cells).find((cell) => cell.nomorMakam === nomor)?.status;
}

/** What the Denah says about one Kavling Keluarga. */
async function kavlingStatus(setup: Setup, fixture: TerencanaLokasi) {
  const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
  return denah?.bloks.flatMap((blok) => blok.kavling).find((satu) => satu.nomorKavling === "A-K01")?.status;
}

/** The id of a Petak Makam or Kavling Keluarga by the number it is known by, as the picker carries it. */
async function unitId(setup: Setup, fixture: TerencanaLokasi, nomor: string): Promise<string> {
  const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
  const cell = denah?.bloks.flatMap((blok) => blok.cells).find((satu) => satu.nomorMakam === nomor);
  const kavling = denah?.bloks.flatMap((blok) => blok.kavling).find((satu) => satu.nomorKavling === nomor);
  const found = cell?.id ?? kavling?.id;
  if (!found) throw new Error(`no unit ${nomor}`);
  return found;
}

/** The fixture's Denah ids by their numbers, the way the picker's draft carries them. */
async function ids(setup: Setup, fixture: TerencanaLokasi, nomor: string[]) {
  const resolved = await Promise.all(nomor.map(async (satu) => [satu, await unitId(setup, fixture, satu)] as const));
  return Object.fromEntries(resolved) as Record<string, string>;
}

describe("holding the plots a Pemesanan Terencana chooses", () => {
  it("holds every chosen Petak Makam, so they read as Dipesan and cannot be picked again", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);
    const { "A-01": a01, "A-02": a02 } = await ids(setup, fixture, ["A-01", "A-02"]);

    const hasil = await refusable(setup.db, (tx) =>
      setup.inventory.within(tx).tahan({ lokasiId: fixture.lokasiMitra.id, units: [{ petakId: a01 }, { petakId: a02 }], nomorPemesanan: "MKM-2026-000001" }),
    );

    expect(hasil).toEqual({ ok: true, units: [{ petakId: a01, kavlingId: undefined }, { petakId: a02, kavlingId: undefined }] });
    expect(await statusOf(setup, fixture, "A-01")).toBe("sedang_dipesan");
    expect(await statusOf(setup, fixture, "A-02")).toBe("sedang_dipesan");
    expect(await statusOf(setup, fixture, "A-07")).toBe("bisa_dipilih");
    expect(await setup.inventory.tersediaUntukTerencana([fixture.lokasiMitra.id])).toEqual({ [fixture.lokasiMitra.id]: 3 });
  });

  it("holds one whole Kavling Keluarga, never a Petak inside it", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);
    const { "A-K01": kavlingId, "A-05": dalamKavling } = await ids(setup, fixture, ["A-K01", "A-05"]);

    const hasil = await refusable(setup.db, (tx) =>
      setup.inventory.within(tx).tahan({ lokasiId: fixture.lokasiMitra.id, units: [{ kavlingId }], nomorPemesanan: "MKM-2026-000001" }),
    );
    const petakDalam = await refusable(setup.db, (tx) =>
      setup.inventory.within(tx).tahan({ lokasiId: fixture.lokasiMitra.id, units: [{ petakId: dalamKavling }], nomorPemesanan: "MKM-2026-000002" }),
    );

    expect(hasil).toEqual({ ok: true, units: [{ petakId: undefined, kavlingId }] });
    expect(await kavlingStatus(setup, fixture)).toBe("sedang_dipesan");
    expect(petakDalam).toMatchObject({ ok: false, reason: "unit_tidak_ditemukan" });
  });

  it("refuses a plot that is not pickable, naming it and the state that keeps it", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);
    const { "A-03": terisi, "A-04": tidakTersedia, "B-01": perluVerifikasi } = await ids(setup, fixture, ["A-03", "A-04", "B-01"]);
    const tahan = (units: { petakId?: string; kavlingId?: string }[]) =>
      refusable(setup.db, (tx) => setup.inventory.within(tx).tahan({ lokasiId: fixture.lokasiMitra.id, units, nomorPemesanan: "MKM-2026-000001" }));

    expect(await tahan([{ petakId: terisi }])).toEqual({ ok: false, reason: "unit_tidak_bisa_dipilih", nomor: "A-03", status: "terisi" });
    expect(await tahan([{ petakId: tidakTersedia }])).toEqual({ ok: false, reason: "unit_tidak_bisa_dipilih", nomor: "A-04", status: "tidak_tersedia" });
    expect(await tahan([{ petakId: perluVerifikasi }])).toEqual({ ok: false, reason: "unit_tidak_bisa_dipilih", nomor: "B-01", status: "perlu_verifikasi" });
  });

  it("holds nothing when one unit of a selection cannot be picked", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);
    const { "A-01": a01, "A-04": a04 } = await ids(setup, fixture, ["A-01", "A-04"]);

    const hasil = await refusable(setup.db, (tx) =>
      setup.inventory.within(tx).tahan({ lokasiId: fixture.lokasiMitra.id, units: [{ petakId: a01 }, { petakId: a04 }], nomorPemesanan: "MKM-2026-000001" }),
    );

    expect(hasil).toMatchObject({ ok: false, reason: "unit_tidak_bisa_dipilih", nomor: "A-04" });
    expect(await statusOf(setup, fixture, "A-01")).toBe("bisa_dipilih");
  });

  it("takes several Petak or one whole Kavling Keluarga, never a mix and never the same plot twice", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);
    const { "A-01": a01, "A-K01": kavlingId } = await ids(setup, fixture, ["A-01", "A-K01"]);
    const tahan = (units: { petakId?: string; kavlingId?: string }[]) =>
      refusable(setup.db, (tx) => setup.inventory.within(tx).tahan({ lokasiId: fixture.lokasiMitra.id, units, nomorPemesanan: "MKM-2026-000001" }));

    expect(await tahan([{ petakId: a01 }, { kavlingId }])).toMatchObject({ ok: false, reason: "unit_campur" });
    expect(await tahan([{ petakId: a01 }, { petakId: a01 }])).toMatchObject({ ok: false, reason: "unit_ganda" });
    expect(await tahan([])).toMatchObject({ ok: false, reason: "tanpa_unit" });
  });

  it("a second order for the same Petak at the same moment fails, and the one that waited is told it is taken", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);
    const { "A-01": a01 } = await ids(setup, fixture, ["A-01"]);
    const units = [{ petakId: a01 }];
    const tahan = (nomorPemesanan: string) =>
      refusable(setup.db, (tx) => setup.inventory.within(tx).tahan({ lokasiId: fixture.lokasiMitra.id, units, nomorPemesanan }));

    const [pertama, kedua] = await Promise.all([tahan("MKM-2026-000001"), tahan("MKM-2026-000002")]);

    const refuses = [pertama, kedua].filter((hasil) => !hasil.ok);
    expect(pertama.ok !== kedua.ok).toBe(true);
    expect(refuses).toHaveLength(1);
    expect(refuses[0]).toEqual({ ok: false, reason: "sudah_dipesan", nomor: "A-01" });
    expect(await statusOf(setup, fixture, "A-01")).toBe("sedang_dipesan");
  });

  it("an order that no longer holds its plots (declined, withdrawn, lapsed) frees them again", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);
    const { "A-01": a01 } = await ids(setup, fixture, ["A-01"]);
    await refusable(setup.db, (tx) =>
      setup.inventory.within(tx).tahan({ lokasiId: fixture.lokasiMitra.id, units: [{ petakId: a01 }], nomorPemesanan: "MKM-2026-000001" }),
    );

    const dilepas = await setup.inventory.lepasTahan("MKM-2026-000001");

    expect(dilepas).toEqual({ ok: true, released: 1 });
    expect(await statusOf(setup, fixture, "A-01")).toBe("bisa_dipilih");
  });
});

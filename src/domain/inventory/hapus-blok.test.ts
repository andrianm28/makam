import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { refusable } from "@/db/unit-of-work";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf, denahFixture, inventoryOnTestDatabase, newBlok, signedInAdminLokasi } from "../../../tests/support/inventory";
import { publishOnTestDatabase, signedInAdminPlatform } from "../../../tests/support/publish";
import { terencanaLokasi } from "../../../tests/support/terencana";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("an Admin Lokasi removes a Blok that is empty of history", () => {
  it("removes an empty Blok, its Petak Makam and its Kavling Keluarga, audited with the reason, and frees its name and numbers", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture, { name: "A", rows: 1, cols: 3 });
    const cells = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id);
    await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cells[0].id, { mode: "tersedia" });
    const kavling = await setup.inventory.createKavling(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, {
      cellIds: cells.slice(1).map((cell) => cell.id),
      jenisMakamId: fixture.jenisMakam.id,
    });
    expect(kavling.ok).toBe(true);

    expect(await setup.inventory.bolehHapusBlok(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id)).toEqual({ boleh: true });
    const removed = await setup.inventory.hapusBlok(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, "Diganti denah baru");

    expect(removed).toEqual({ ok: true });
    expect(await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id)).toEqual([]);
    const again = await newBlok(setup, fixture, { name: "A", rows: 1, cols: 3 });
    expect(again.name).toBe("A");
    const entries = await setup.audit.entriesForLokasi(fixture.lokasiMitra.id);
    expect(entries.find((entry) => entry.action === "denah.hapus_blok")?.reason).toBe("Diganti denah baru");
  });

  it("refuses a Blok with an occupied Petak Makam, saying it has history", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);

    // Blok A holds Terisi Petak (a Hak Pakai and a Pemakaman).
    expect(await setup.inventory.bolehHapusBlok(fixture.adminLokasi, fixture.lokasiMitra.id, fixture.blok.id)).toEqual({ boleh: false, reason: "punya_riwayat" });
    expect(await setup.inventory.hapusBlok(fixture.adminLokasi, fixture.lokasiMitra.id, fixture.blok.id, "Coba")).toEqual({ ok: false, reason: "punya_riwayat" });
    expect((await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id)).map((blok) => blok.name)).toContain("A");
  });

  it("refuses a Blok with a Petak an order is holding, and allows it again once the hold is released", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const fixture = await terencanaLokasi(setup, admin);
    const blok = await setup.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, { name: "C", rows: 1, cols: 1, jenisMakamId: fixture.jenisMakam.id });
    if (!blok.ok) throw new Error(blok.reason);
    const [cell] = await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.blok.id);
    await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, { mode: "tersedia" });
    const held = await refusable(setup.db, (tx) =>
      setup.inventory.within(tx).tahan({ lokasiId: fixture.lokasiMitra.id, units: [{ petakId: cell.id }], nomorPemesanan: "MKM-2026-000009" }),
    );
    expect(held.ok).toBe(true);

    expect(await setup.inventory.hapusBlok(fixture.adminLokasi, fixture.lokasiMitra.id, blok.blok.id, "Coba")).toEqual({ ok: false, reason: "sedang_dipesan" });

    await setup.inventory.lepasTahan("MKM-2026-000009");
    expect(await setup.inventory.hapusBlok(fixture.adminLokasi, fixture.lokasiMitra.id, blok.blok.id, "Pesanan batal")).toEqual({ ok: true });
  });

  it("is refused for Admin Platform and for another Lokasi's Admin Lokasi, and needs a reason", async () => {
    const setup = inventoryOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    const blok = await newBlok(setup, fixture);
    const other = await setup.lokasi.createLokasiMitra(fixture.admin, { name: "Makam Lain", pengelolaName: "Yayasan Lain", address: "Jl. Lain No. 2", city: "Kota Jakarta Selatan" });
    if (!other.ok) throw new Error(other.reason);
    const otherAdminLokasi = await signedInAdminLokasi(setup, fixture.admin, [other.lokasiMitra.id], "084444444444");

    expect(await setup.inventory.hapusBlok(fixture.admin, fixture.lokasiMitra.id, blok.id, "Coba")).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.inventory.hapusBlok(otherAdminLokasi, fixture.lokasiMitra.id, blok.id, "Coba")).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.inventory.hapusBlok(fixture.adminLokasi, fixture.lokasiMitra.id, blok.id, "  ")).toEqual({ ok: false, reason: "alasan_wajib" });
    expect(await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id)).toHaveLength(1);
  });
});

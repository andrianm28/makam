import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform, wakafOnTestDatabase } from "../../../tests/support/wakaf";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const AL_IKHLAS = { nama: "Yayasan Wakaf Al-Ikhlas", jenis: "badan_hukum", kabKota: "Kota Depok", kontak: "0811 2222 3333", nomorBwi: "3.3/00123" } as const;

describe("Daftar Nazhir", () => {
  it("is empty until Admin Platform enters a Nazhir: nothing is seeded", async () => {
    const setup = wakafOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    expect(await setup.wakaf.nazhirUntukPilihan()).toEqual([]);
    expect(await setup.wakaf.daftarNazhir(admin)).toEqual([]);
  });

  it("Admin Platform adds, changes and removes a Nazhir, each change in the Audit Log", async () => {
    const setup = wakafOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    const dibuat = await setup.wakaf.tambahNazhir(admin, AL_IKHLAS);
    if (!dibuat.ok) throw new Error(`refused: ${dibuat.reason}`);
    const diubah = await setup.wakaf.ubahNazhir(admin, { nazhirId: dibuat.nazhir.id, ...AL_IKHLAS, kontak: "0811 9999 0000" });
    expect(diubah).toMatchObject({ ok: true, nazhir: { kontak: "0811 9999 0000", nomorBwi: "3.3/00123" } });
    expect(await setup.wakaf.daftarNazhir(admin)).toHaveLength(1);

    expect(await setup.wakaf.hapusNazhir(admin, { nazhirId: dibuat.nazhir.id })).toMatchObject({ ok: true });
    expect(await setup.wakaf.daftarNazhir(admin)).toEqual([]);
    const aksi = (await setup.audit.entriesAbout({ kind: "nazhir", id: dibuat.nazhir.id })).map((entri) => entri.action);
    expect(aksi).toEqual(["wakaf.nazhir_tambah", "wakaf.nazhir_ubah", "wakaf.nazhir_hapus"]);
  });

  it("refuses a Nazhir without a BWI number, and refuses anyone but Admin Platform", async () => {
    const setup = wakafOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasi = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasi.id]);

    expect(await setup.wakaf.tambahNazhir(admin, { ...AL_IKHLAS, nomorBwi: " " })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await setup.wakaf.tambahNazhir(adminLokasi, AL_IKHLAS)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.wakaf.daftarNazhir(adminLokasi)).toEqual([]);
  });

  it("offers a Wakif the names on the list, without contact or BWI number", async () => {
    const setup = wakafOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    await setup.wakaf.tambahNazhir(admin, AL_IKHLAS);

    const pilihan = await setup.wakaf.nazhirUntukPilihan();
    expect(pilihan).toEqual([{ id: expect.any(String), nama: "Yayasan Wakaf Al-Ikhlas", jenis: "badan_hukum", kabKota: "Kota Depok" }]);
  });
});

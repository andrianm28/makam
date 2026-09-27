import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/domain/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  catalogFixture,
  layananOnTestDatabase,
  newLayananInput,
  newLokasiMitra,
  signedInAdminLokasi,
  signedInAdminPlatform,
  type LayananSetup,
} from "../../../tests/support/layanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the fixed-price variants of a Layanan", () => {
  it("are added one at a time, and a name the Layanan already has is refused", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, layanan } = await catalogFixture(setup);

    const added = await setup.layanan.tambahVarian(admin, layanan.id, { name: "Marmer 80 cm", reason: null });
    expect(added).toMatchObject({ ok: true, varian: { name: "Marmer 80 cm", bolehDiTpu: false } });
    expect(await setup.layanan.tambahVarian(admin, layanan.id, { name: " Reguler ", reason: null })).toEqual({ ok: false, reason: "nama_sudah_ada" });
    expect(await setup.layanan.tambahVarian(admin, layanan.id, { name: "   ", reason: null })).toEqual({ ok: false, reason: "layanan_tidak_valid" });
    expect(await setup.layanan.tambahVarian(admin, "00000000-0000-4000-8000-000000000000", { name: "Batu", reason: null })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });

    const katalog = await setup.layanan.katalog();
    expect(katalog[0].varian.map((one) => one.name)).toEqual(["Marmer 80 cm", "Reguler"]);
    expect(await setup.audit.entriesAbout({ kind: "layanan", id: layanan.id })).toMatchObject([
      expect.objectContaining({ action: "layanan.buat" }),
      expect.objectContaining({ action: "layanan.tambah_varian", after: { name: "Marmer 80 cm" } }),
    ]);
  });

  it("cannot be removed once a Lokasi Mitra has offered it, even after it stopped, and can be removed while none has", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, layanan, varian } = await catalogFixture(setup);
    const { adminLokasi, lokasiMitra } = await lokasiFixture(setup, admin);

    expect(await setup.layanan.hapusVarian(adminLokasi, varian.id, { reason: null })).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.layanan.tawarkanLayanan(admin, lokasiMitra.id, varian.id, { reason: null })).toEqual({ ok: true });
    expect(await setup.layanan.hapusVarian(admin, varian.id, { reason: null })).toEqual({ ok: false, reason: "varian_terpakai" });

    // The offering is kept with the moment it stopped, so the variant stays part of the Lokasi's history.
    expect(await setup.layanan.stopLayanan(admin, lokasiMitra.id, varian.id, { reason: "Lokasi Mitra sudah tidak menawarkannya" })).toEqual({ ok: true });
    expect(await setup.layanan.hapusVarian(admin, varian.id, { reason: "Pensiun" })).toEqual({ ok: false, reason: "varian_terpakai" });

    // One no Lokasi Mitra was ever offered can be removed, audited.
    const NeverOffered = await setup.layanan.tambahVarian(admin, layanan.id, { name: "Lengkap", reason: null });
    if (!NeverOffered.ok) throw new Error("varian refused");
    expect(await setup.layanan.hapusVarian(admin, NeverOffered.varian.id, { reason: "Pensiun" })).toEqual({ ok: true });
    expect((await setup.layanan.katalog())[0].varian.map((one) => one.name)).toEqual(["Reguler"]);
    expect(await setup.audit.entriesAbout({ kind: "layanan", id: layanan.id })).toMatchObject([
      expect.objectContaining({ action: "layanan.buat" }),
      expect.objectContaining({ action: "layanan.tambah_varian", after: { name: "Lengkap" } }),
      expect.objectContaining({ action: "layanan.hapus_varian", before: { name: "Lengkap" }, after: null, reason: "Pensiun" }),
    ]);
  });
});

describe("the 'boleh di TPU DKI' mark on a variant", () => {
  it("is set by hand and audited, and Admin Platform is the only one who sets it", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { adminLokasi } = await lokasiFixture(setup, admin);
    const { layanan, varian } = await nisanFixture(setup, admin);

    expect(await setup.layanan.tandaiBolehDiTpu(adminLokasi, varian.id, { boleh: true, reason: "Sesuai ketentuan TPU" })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.layanan.tandaiBolehDiTpu(admin, varian.id, { boleh: true, reason: " Sesuai ketentuan TPU " })).toMatchObject({
      ok: true,
      varian: { name: "Marmer 80 cm", bolehDiTpu: true },
    });
    expect((await setup.layanan.katalog())[0].varian).toMatchObject([{ name: "Granit 60 cm", bolehDiTpu: false }, { name: "Marmer 80 cm", bolehDiTpu: true }]);

    expect(await setup.audit.entriesAbout({ kind: "layanan_varian", id: varian.id })).toEqual([
      expect.objectContaining({
        actor: { accountId: admin.accountId, role: "admin_platform" },
        action: "layanan.tandai_tpu_dki",
        lokasiId: null,
        before: { name: "Marmer 80 cm", bolehDiTpu: false },
        after: { name: "Marmer 80 cm", bolehDiTpu: true },
        reason: "Sesuai ketentuan TPU",
      }),
    ]);

    // Taking the mark off is a decision of its own, in the same log.
    expect(await setup.layanan.tandaiBolehDiTpu(admin, varian.id, { boleh: false, reason: null })).toMatchObject({ ok: true });
    expect((await setup.layanan.katalog())[0].varian).toMatchObject([{ name: "Granit 60 cm", bolehDiTpu: false }, { name: "Marmer 80 cm", bolehDiTpu: false }]);
    expect(layanan.name).toBe("Batu Nisan");
  });
});

describe("changing a Layanan", () => {
  it("is audited with the entry before it and the one after it", async () => {
    const setup = layananOnTestDatabase(db);
    const { admin, layanan } = await catalogFixture(setup);
    await setup.layanan.createLayanan(admin, newLayananInput({ name: "Laporan Foto/Video", varian: ["Reguler"] }));

    const changed = await setup.layanan.ubahLayanan(admin, layanan.id, {
      ...newLayananInput({ name: "Pembersihan Makam Berkala", leadTimeDays: 5, bukti: "foto_sesudah", description: "Perawatan berkala." }),
    });
    expect(changed).toMatchObject({ ok: true, layanan: { name: "Pembersihan Makam Berkala", leadTimeDays: 5, bukti: "foto_sesudah" } });
    expect(await setup.layanan.ubahLayanan(admin, layanan.id, newLayananInput({ name: " laporan   foto/video " }))).toEqual({
      ok: false,
      reason: "nama_sudah_ada",
    });
    expect(await setup.layanan.ubahLayanan(admin, "00000000-0000-4000-8000-000000000000", newLayananInput())).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });

    expect(await setup.audit.entriesAbout({ kind: "layanan", id: layanan.id })).toMatchObject([
      expect.objectContaining({ action: "layanan.buat" }),
      {
        action: "layanan.ubah",
        before: { name: "Pembersihan Makam", leadTimeDays: 3, bukti: "foto_sebelum_dan_sesudah", varian: ["Reguler"] },
        after: { name: "Pembersihan Makam Berkala", leadTimeDays: 5, bukti: "foto_sesudah", varian: ["Reguler"] },
        reason: null,
      },
    ]);
  });
});

/** Batu Nisan with two variants, as the v1 catalog has it. */
async function nisanFixture(setup: LayananSetup, admin: Actor) {
  const created = await setup.layanan.createLayanan(
    admin,
    newLayananInput({
      name: "Batu Nisan",
      description: "Pesan dan pasang batu nisan.",
      bukti: "foto_sesudah",
      leadTimeDays: 14,
      adaDiPetakKosong: false,
      teksLabel: "Teks nisan",
      varian: ["Granit 60 cm", "Marmer 80 cm"],
    }),
  );
  if (!created.ok) throw new Error(`Layanan refused: ${created.reason}`);
  const marmer = created.layanan.varian.find((one) => one.name === "Marmer 80 cm");
  if (!marmer) throw new Error("no Marmer variant");
  return { layanan: created.layanan, varian: marmer };
}

/** A Lokasi Mitra with its own Admin Lokasi, the other side of an offering. */
async function lokasiFixture(setup: LayananSetup, admin: Actor) {
  const lokasiMitra = await newLokasiMitra(setup, admin);
  const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
  return { admin, adminLokasi, lokasiMitra };
}

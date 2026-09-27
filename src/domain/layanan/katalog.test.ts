import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logIn } from "../../../tests/support/identity";
import { layananOnTestDatabase, newLayananInput, signedInAdminLokasi, signedInAdminPlatform, newLokasiMitra } from "../../../tests/support/layanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("who may add a Layanan to the catalog", () => {
  it("refuses every other role, and keeps and audits nothing", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);
    await setup.identity.inviteStaff(admin, { email: "petugas@contoh.id", phoneNumber: "084444444444", role: "petugas_lapangan" });
    await setup.identity.inviteStaff(admin, { email: "mitra@contoh.id", phoneNumber: "085555555555", role: "mitra_jasa" });
    const petugas = await actorOf(setup.identity, (await logIn(setup, "petugas@contoh.id")).cookies);
    const mitraJasa = await actorOf(setup.identity, (await logIn(setup, "mitra@contoh.id")).cookies);
    const pemesan = await actorOf(setup.identity, (await logIn(setup, "pemesan@contoh.id")).cookies);

    for (const who of [adminLokasi, petugas, mitraJasa, pemesan]) {
      expect(await setup.layanan.createLayanan(who, newLayananInput())).toEqual({ ok: false, reason: "tidak_berwenang" });
    }
    expect(await setup.layanan.katalog()).toEqual([]);
    expect(await setup.audit.entriesAbout({ kind: "layanan", id: "katalog" })).toEqual([]);
  });

  it("refuses an Admin Platform whose session has not passed TOTP", async () => {
    const setup = layananOnTestDatabase(db);
    await setup.identity.seedFirstAdminPlatform({ email: "admin@makam.co.id", phoneNumber: "081111111111" });
    const beforeTotp = await actorOf(setup.identity, (await logIn(setup, "admin@makam.co.id")).cookies);

    expect(await setup.layanan.createLayanan(beforeTotp, newLayananInput())).toEqual({ ok: false, reason: "perlu_totp" });
    expect(await setup.layanan.katalog()).toEqual([]);
  });
});

describe("the Layanan catalog", () => {
  it("carries a new Layanan with its variants, its lead time, its flags and its text field", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);

    const created = await setup.layanan.createLayanan(admin, {
      name: "Batu Nisan",
      description: "Batu nisan Custom, pesan dan pasang.",
      bukti: "foto_sesudah",
      leadTimeDays: 14,
      bisaHariH: false,
      adaDiPetakKosong: false,
      teksLabel: "Teks nisan",
      varian: ["Granit 60 cm", "Marmer 80 cm"],
      reason: null,
    });
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) throw new Error("Layanan refused");

    expect(await setup.layanan.katalog()).toMatchObject([
      {
        name: "Batu Nisan",
        description: "Batu nisan Custom, pesan dan pasang.",
        bukti: "foto_sesudah",
        leadTimeDays: 14,
        bisaHariH: false,
        adaDiPetakKosong: false,
        teksLabel: "Teks nisan",
        varian: [{ name: "Granit 60 cm", bolehDiTpu: false }, { name: "Marmer 80 cm", bolehDiTpu: false }],
      },
    ]);
  });

  it("refuses a second Layanan with the same name, and one without a name, without a variant or with a lead time of no days' sense", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    expect(await setup.layanan.createLayanan(admin, newLayananInput())).toMatchObject({ ok: true });

    expect(await setup.layanan.createLayanan(admin, newLayananInput({ name: "  pembersihan   makam " }))).toEqual({
      ok: false,
      reason: "nama_sudah_ada",
    });
    for (const invalid of [
      newLayananInput({ name: "   " }),
      newLayananInput({ varian: [] }),
      newLayananInput({ leadTimeDays: -1 }),
      newLayananInput({ leadTimeDays: 400 }),
      newLayananInput({ bukti: "tanpa_foto" as never }),
      newLayananInput({ varian: ["Reguler", "Reguler"] }),
    ]) {
      expect(await setup.layanan.createLayanan(admin, invalid)).toEqual({ ok: false, reason: "layanan_tidak_valid" });
    }
    expect(await setup.layanan.katalog()).toHaveLength(1);
  });

  it("records the new Layanan in the Audit Log with its variants", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const created = await setup.layanan.createLayanan(admin, newLayananInput({ reason: "  Daftar v1  " }));
    if (!created.ok) throw new Error("Layanan refused");

    expect(await setup.audit.entriesAbout({ kind: "layanan", id: created.layanan.id })).toEqual([
      expect.objectContaining({
        actor: { accountId: admin.accountId, role: "admin_platform" },
        action: "layanan.buat",
        before: null,
        after: expect.objectContaining({ name: "Pembersihan Makam", leadTimeDays: 3, varian: ["Reguler"] }),
        reason: "Daftar v1",
      }),
    ]);
  });
});

describe("the proof a Pekerjaan Layanan must show", () => {
  it("is derived per Layanan: a photo afterwards always, a photo before for Pembersihan Makam and Perawatan Rumput & Taman, a video for the Laporan Foto/Video", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    // The v1 catalog (decision ticket 09), each with the proof level the spec gives it.
    const v1 = [
      { name: "Bunga Ziarah", bukti: "foto_sesudah" },
      { name: "Pembersihan Makam", bukti: "foto_sebelum_dan_sesudah" },
      { name: "Perawatan Rumput & Taman", bukti: "foto_sebelum_dan_sesudah" },
      { name: "Laporan Foto/Video Kondisi Makam", bukti: "foto_dan_video" },
    ] as const;
    for (const entry of v1) {
      await setup.layanan.createLayanan(admin, newLayananInput({ name: entry.name, bukti: entry.bukti, varian: ["Reguler"] }));
    }
    const proofByName = Object.fromEntries((await setup.layanan.katalog()).map((one) => [one.name, one.proof]));

    // A photo afterwards is required every time; the other two follow the Layanan.
    expect(proofByName["Bunga Ziarah"]).toEqual({ fotoSesudah: true, fotoSebelum: false, video: false });
    expect(proofByName["Pembersihan Makam"]).toEqual({ fotoSesudah: true, fotoSebelum: true, video: false });
    expect(proofByName["Perawatan Rumput & Taman"]).toEqual({ fotoSesudah: true, fotoSebelum: true, video: false });
    expect(proofByName["Laporan Foto/Video Kondisi Makam"]).toEqual({ fotoSesudah: true, fotoSebelum: false, video: true });
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { actorOf, logIn } from "../../../tests/support/identity";
import {
  layananOnTestDatabase,
  newLayananFor,
  newLayananInput,
  newLokasiMitra,
  signedInAdminLokasi,
  signedInAdminPlatform,
} from "../../../tests/support/layanan";

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
      jenis: "nisan",
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
        jenis: "nisan",
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
      newLayananInput({ jenis: "tanpa_jenis" as never }),
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
        after: expect.objectContaining({ name: "Pembersihan Makam", jenis: "pembersihan", bukti: "foto_sebelum_dan_sesudah", varian: ["Reguler"] }),
        reason: "Daftar v1",
      }),
    ]);
  });
});

describe("removing a Layanan from the catalog", () => {
  it("takes its Pilihan with it, is audited, and is refused while a Lokasi Mitra was ever offered one", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { layanan, varian } = await newLayananFor(setup, admin, { name: "Laporan Foto/Video", jenis: "laporan" });
    const bunga = await newLayananFor(setup, admin, { name: "Bunga Ziarah", jenis: "bunga" });
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await setup.layanan.tawarkanLayanan(admin, lokasiMitra.id, varian.id, { amount: 300_000, effectiveOn: "2026-10-01", reason: null });

    // Offered at a Lokasi Mitra, so the Layanan stays: its offering is history.
    expect(await setup.layanan.hapusLayanan(admin, layanan.id, { reason: "Pensiun" })).toEqual({ ok: false, reason: "layanan_terpakai" });

    // Never offered and never packed: it and its Pilihan go, audited.
    expect(await setup.layanan.hapusLayanan(admin, bunga.layanan.id, { reason: "  Tidak dipakai lagi  " })).toEqual({
      ok: true,
      nama: "Bunga Ziarah",
    });
    expect((await setup.layanan.katalog()).map((one) => one.name)).toEqual(["Laporan Foto/Video"]);
    expect(await setup.audit.entriesAbout({ kind: "layanan", id: bunga.layanan.id })).toMatchObject([
      { action: "layanan.buat" },
      { action: "layanan.hapus", before: { name: "Bunga Ziarah", varian: ["Reguler"] }, after: null, reason: "Tidak dipakai lagi" },
    ]);
    expect(await setup.layanan.hapusLayanan(admin, bunga.layanan.id, { reason: null })).toEqual({ ok: false, reason: "tidak_ditemukan" });
  });
});

describe("the proof a Pekerjaan Layanan must show", () => {
  it("is derived per Layanan: a photo afterwards always, a photo before for Pembersihan Makam and Perawatan Rumput & Taman, a video for the Laporan Foto/Video", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    // The v1 catalog (decision ticket 09), each with the kind that fixes its proof.
    const v1 = [
      { name: "Bunga Ziarah", jenis: "bunga" },
      { name: "Pembersihan Makam", jenis: "pembersihan" },
      { name: "Perawatan Rumput & Taman", jenis: "perawatan" },
      { name: "Laporan Foto/Video Kondisi Makam", jenis: "laporan" },
    ] as const;
    for (const entry of v1) {
      await setup.layanan.createLayanan(admin, newLayananInput({ name: entry.name, jenis: entry.jenis, varian: ["Reguler"] }));
    }
    const proofByName = Object.fromEntries((await setup.layanan.katalog()).map((one) => [one.name, one.proof]));

    // A photo afterwards is required every time; the other two follow the kind.
    expect(proofByName["Bunga Ziarah"]).toEqual({ fotoSesudah: true, fotoSebelum: false, video: false });
    expect(proofByName["Pembersihan Makam"]).toEqual({ fotoSesudah: true, fotoSebelum: true, video: false });
    expect(proofByName["Perawatan Rumput & Taman"]).toEqual({ fotoSesudah: true, fotoSebelum: true, video: false });
    expect(proofByName["Laporan Foto/Video Kondisi Makam"]).toEqual({ fotoSesudah: true, fotoSebelum: false, video: true });
  });

  it("cannot be chosen freely: a Pembersihan Makam with a video proof, or a Laporan with only a photo, is refused and nothing is kept", async () => {
    const setup = layananOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const { layanan, varian } = await newLayananFor(setup, admin, { name: "Pembersihan Makam", jenis: "pembersihan" });

    // What a stale or tampered form would send: a proof the kind does not take.
    for (const salah of [
      newLayananInput({ name: "Pembersihan Makam", jenis: "pembersihan", bukti: "foto_dan_video" }),
      newLayananInput({ name: "Laporan Foto/Video", jenis: "laporan", bukti: "foto_sesudah" }),
      newLayananInput({ name: "Bunga Ziarah", jenis: "bunga", bukti: "foto_sebelum_dan_sesudah" }),
    ]) {
      expect(await setup.layanan.createLayanan(admin, salah)).toMatchObject({ ok: false, reason: "bukti_tidak_cocok" });
    }
    expect(await setup.layanan.ubahLayanan(admin, layanan.id, newLayananInput({ name: "Pembersihan Makam", jenis: "pembersihan", bukti: "foto_dan_video" }))).toMatchObject({
      ok: false,
      reason: "bukti_tidak_cocok",
    });
    // The refusal names the proof the kind does take, so the screen can say which.
    expect(await setup.layanan.createLayanan(admin, newLayananInput({ name: "Laporan", jenis: "laporan", bukti: "foto_dan_video" }))).toMatchObject({ ok: true });
    expect((await setup.layanan.katalog()).find((one) => one.name === "Pembersihan Makam")).toMatchObject({ jenis: "pembersihan" });
    expect((await setup.layanan.katalog()).find((one) => one.name === "Pembersihan Makam")?.proof).toEqual({
      fotoSesudah: true,
      fotoSebelum: true,
      video: false,
    });
    expect(varian.name).toBe("Reguler");
    expect(await setup.audit.entriesAbout({ kind: "layanan", id: layanan.id })).toMatchObject([{ action: "layanan.buat" }]);
  });
});

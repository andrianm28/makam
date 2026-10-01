import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { fieldworkOnTestDatabase, signedInPetugasLapangan } from "../../../tests/support/fieldwork";
import { newLokasiMitra, signedInAdminPlatform } from "../../../tests/support/lokasi";
import { browserPushSubscription } from "../../../tests/support/notifications";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);
const evidence = (kind: string) => ({ kind, file: { body: jpegBytes, contentType: "image/jpeg" } });

/** A Kunjungan Verifikasi assigned to `assigneeAccountId` for `lokasiId`. */
function kunjunganVerifikasiInput(lokasiId: string, assigneeAccountId: string) {
  return {
    type: "kunjungan_verifikasi" as const,
    subject: "Taman Makam Wakaf Al-Ikhlas",
    lokasiId,
    address: "Jl. Raya Pondok Rangon No. 1",
    pin: { lat: -6.29, lng: 106.9 },
    plannedDate: "2026-10-05",
    assigneeAccountId,
  };
}

describe("Tugas Lapangan: create and assign", () => {
  it("Admin Platform creates and assigns a Tugas Lapangan, and its Petugas Lapangan gets a Peringatan Staf by push and email", async () => {
    const setup = fieldworkOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await setup.notifications.enablePush(petugas, { subscription: browserPushSubscription() });

    const created = await setup.fieldwork.createTugasLapangan(admin, kunjunganVerifikasiInput(lokasiMitra.id, petugas.accountId));
    await setup.notifications.kirimPeringatanStafTick();

    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");
    expect(created.tugasLapangan).toMatchObject({
      type: "kunjungan_verifikasi",
      status: "ditugaskan",
      assigneeAccountId: petugas.accountId,
      lokasiId: lokasiMitra.id,
    });

    expect(setup.email.sent.some((message) => message.to === "petugas.lapangan@contoh.id")).toBe(true);
    expect(setup.webPush.sent.length).toBeGreaterThan(0);
  });

  it("refuses to assign someone who does not hold Petugas Lapangan", async () => {
    const setup = fieldworkOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    const created = await setup.fieldwork.createTugasLapangan(admin, kunjunganVerifikasiInput(lokasiMitra.id, admin.accountId));

    expect(created).toEqual({ ok: false, reason: "bukan_petugas_lapangan" });
  });

  it("an Akun without Admin Platform cannot create a Tugas Lapangan", async () => {
    const setup = fieldworkOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);

    const created = await setup.fieldwork.createTugasLapangan(petugas, kunjunganVerifikasiInput(lokasiMitra.id, petugas.accountId));

    expect(created).toEqual({ ok: false, reason: "tidak_berwenang" });
  });
});

describe("Tugas Lapangan: Selesai gated on uploads", () => {
  it("is refused while the required upload is missing", async () => {
    const setup = fieldworkOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const created = await setup.fieldwork.createTugasLapangan(admin, kunjunganVerifikasiInput(lokasiMitra.id, petugas.accountId));
    if (!created.ok) throw new Error("unreachable");

    const completed = await setup.fieldwork.completeTugasLapangan(petugas, created.tugasLapangan.id, {
      form: { addressConfirmed: true, pin: null, facilities: { checked: [], note: "" }, note: "" },
      uploads: [],
    });

    expect(completed).toEqual({ ok: false, reason: "unggah_kurang" });
  });

  it("is refused while the type-specific form does not validate", async () => {
    const setup = fieldworkOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const created = await setup.fieldwork.createTugasLapangan(admin, kunjunganVerifikasiInput(lokasiMitra.id, petugas.accountId));
    if (!created.ok) throw new Error("unreachable");

    const completed = await setup.fieldwork.completeTugasLapangan(petugas, created.tugasLapangan.id, {
      form: { addressConfirmed: "ya" },
      uploads: [evidence("foto_lokasi")],
    });

    expect(completed).toEqual({ ok: false, reason: "form_tidak_valid" });
  });

  it("a Cek Denah is gated on its own required upload (foto_denah), never Kunjungan Verifikasi's", async () => {
    const setup = fieldworkOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const created = await setup.fieldwork.createTugasLapangan(admin, {
      ...kunjunganVerifikasiInput(lokasiMitra.id, petugas.accountId),
      type: "cek_denah",
    });
    if (!created.ok) throw new Error("unreachable");

    const withWrongKind = await setup.fieldwork.completeTugasLapangan(petugas, created.tugasLapangan.id, {
      form: { sesuaiDenah: true, note: "" },
      uploads: [evidence("foto_lokasi")],
    });
    expect(withWrongKind).toEqual({ ok: false, reason: "unggah_kurang" });

    const completed = await setup.fieldwork.completeTugasLapangan(petugas, created.tugasLapangan.id, {
      form: { sesuaiDenah: true, note: "Sesuai" },
      uploads: [evidence("foto_denah")],
    });
    expect(completed.ok).toBe(true);
  });

  it("cannot be marked Selesai twice", async () => {
    const setup = fieldworkOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const created = await setup.fieldwork.createTugasLapangan(admin, kunjunganVerifikasiInput(lokasiMitra.id, petugas.accountId));
    if (!created.ok) throw new Error("unreachable");

    const form = { addressConfirmed: true, pin: { lat: -6.29, lng: 106.9 }, facilities: { checked: [], note: "" }, note: "" };
    const first = await setup.fieldwork.completeTugasLapangan(petugas, created.tugasLapangan.id, {
      form,
      uploads: [evidence("foto_lokasi")],
    });
    expect(first.ok).toBe(true);

    const second = await setup.fieldwork.completeTugasLapangan(petugas, created.tugasLapangan.id, {
      form,
      uploads: [evidence("foto_lokasi")],
    });
    expect(second).toEqual({ ok: false, reason: "sudah_selesai" });
  });
});

describe("Kunjungan Verifikasi updates the Lokasi", () => {
  it("sets the Lokasi's pin, facilities, visit photos and dikunjungi date, and satisfies the publish gate's item", async () => {
    const setup = fieldworkOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const created = await setup.fieldwork.createTugasLapangan(admin, kunjunganVerifikasiInput(lokasiMitra.id, petugas.accountId));
    if (!created.ok) throw new Error("unreachable");

    expect(await setup.lokasi.kunjunganVerifikasiSelesai(lokasiMitra.id)).toBe(false);

    const completed = await setup.fieldwork.completeTugasLapangan(petugas, created.tugasLapangan.id, {
      form: {
        addressConfirmed: true,
        pin: { lat: -6.301, lng: 106.901 },
        facilities: { checked: ["parkir", "musala"], note: "Musala kecil di dekat gerbang" },
        note: "Sesuai",
      },
      uploads: [evidence("foto_lokasi"), evidence("foto_lokasi")],
    });
    expect(completed.ok).toBe(true);

    const read = await setup.lokasi.lokasiMitra(admin, lokasiMitra.id);
    if (!read.ok) throw new Error("unreachable");
    expect(read.lokasiMitra.pin).toEqual({ lat: -6.301, lng: 106.901 });
    expect(read.lokasiMitra.facilities).toEqual({ checked: ["parkir", "musala"], note: "Musala kecil di dekat gerbang" });
    expect(read.lokasiMitra.kunjunganVerifikasi?.photos).toHaveLength(2);
    expect(read.lokasiMitra.kunjunganVerifikasi?.visitedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(await setup.lokasi.kunjunganVerifikasiSelesai(lokasiMitra.id)).toBe(true);
  });

  it("a completed Cek Denah is recorded on the Lokasi as ticket 16's Terencana-switch input", async () => {
    const setup = fieldworkOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const created = await setup.fieldwork.createTugasLapangan(admin, {
      ...kunjunganVerifikasiInput(lokasiMitra.id, petugas.accountId),
      type: "cek_denah",
    });
    if (!created.ok) throw new Error("unreachable");

    expect(await setup.lokasi.cekDenahOf(lokasiMitra.id)).toBeNull();

    const completed = await setup.fieldwork.completeTugasLapangan(petugas, created.tugasLapangan.id, {
      form: { sesuaiDenah: true, note: "Blok A dan B sesuai Denah" },
      uploads: [evidence("foto_denah")],
    });
    expect(completed.ok).toBe(true);

    const cekDenah = await setup.lokasi.cekDenahOf(lokasiMitra.id);
    expect(cekDenah?.note).toBe("Blok A dan B sesuai Denah");
  });
});

describe("Tugas Lapangan: Petugas Lapangan visibility (spec, story 175)", () => {
  it("a Petugas Lapangan sees only the cases assigned to them", async () => {
    const setup = fieldworkOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugasA = await signedInPetugasLapangan(setup, admin, "petugas.a@contoh.id");
    const petugasB = await signedInPetugasLapangan(setup, admin, "petugas.b@contoh.id");
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const created = await setup.fieldwork.createTugasLapangan(admin, kunjunganVerifikasiInput(lokasiMitra.id, petugasA.accountId));
    if (!created.ok) throw new Error("unreachable");

    expect(await setup.fieldwork.tugasSaya(petugasA)).toHaveLength(1);
    expect(await setup.fieldwork.tugasSaya(petugasB)).toHaveLength(0);

    const seenByB = await setup.fieldwork.tugasLapangan(petugasB, created.tugasLapangan.id);
    expect(seenByB).toEqual({ ok: false, reason: "tidak_ditemukan" });

    const seenByA = await setup.fieldwork.tugasLapangan(petugasA, created.tugasLapangan.id);
    expect(seenByA.ok).toBe(true);

    const attempt = await setup.fieldwork.completeTugasLapangan(petugasB, created.tugasLapangan.id, {
      form: { addressConfirmed: true, pin: null, facilities: { checked: [], note: "" }, note: "" },
      uploads: [evidence("foto_lokasi")],
    });
    expect(attempt).toEqual({ ok: false, reason: "tidak_ditemukan" });
  });

  it("Admin Platform sees every case", async () => {
    const setup = fieldworkOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await setup.fieldwork.createTugasLapangan(admin, kunjunganVerifikasiInput(lokasiMitra.id, petugas.accountId));

    expect(await setup.fieldwork.allTugasLapangan(admin)).toHaveLength(1);
  });
});

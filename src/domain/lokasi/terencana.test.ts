import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  newLokasiMitra,
  publishOnTestDatabase,
  signedInAdminLokasi,
  signedInAdminPlatform,
  signedInPetugasLapangan,
  type PublishSetup,
} from "../../../tests/support/publish";
import { denahFixture, newBlok } from "../../../tests/support/inventory";
import type { Actor } from "@/domain/identity";
import { DEFAULT_FLAGS, DEFAULT_POLICIES } from "@/domain/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** Records a Cek Denah on `lokasiId` through Field Work, the way it is really recorded. */
async function recordCekDenahViaFieldwork(setup: PublishSetup, admin: Actor, lokasiId: string, note = "Sesuai Denah") {
  const petugas = await signedInPetugasLapangan(setup, admin);
  const tugas = await setup.fieldwork.createTugasLapangan(admin, {
    type: "cek_denah",
    subject: "Cek Denah",
    lokasiId,
    address: "Jl. Raya Pondok Rangon No. 1",
    pin: { lat: -6.29, lng: 106.9 },
    plannedDate: "2026-10-05",
    assigneeAccountId: petugas.accountId,
  });
  if (!tugas.ok) throw new Error(`tugas lapangan refused: ${tugas.reason}`);
  const completed = await setup.fieldwork.completeTugasLapangan(petugas, tugas.tugasLapangan.id, {
    form: { sesuaiDenah: true, note },
    uploads: [{ kind: "foto_denah", file: { body: new Uint8Array([0xff, 0xd8, 0xff, 0, 1]), contentType: "image/jpeg" } }],
  });
  if (!completed.ok) throw new Error(`cek denah refused: ${completed.reason}`);
}

describe("switching Pemesanan Terencana on", () => {
  it("is refused, with the unmet gate items, while a Petak still needs clearing or Cek Denah is not done", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const hasPetakPerluVerifikasi = await setup.inventory.hasPetakPerluVerifikasi(lokasiMitra.id);
    expect(hasPetakPerluVerifikasi).toBe(false); // no Blok yet: nothing to clear

    const result = await setup.lokasi.activateTerencana(admin, lokasiMitra.id, { hasPetakPerluVerifikasi: true });

    expect(result).toMatchObject({ ok: false, reason: "gerbang_belum_terpenuhi" });
    if (result.ok || result.reason !== "gerbang_belum_terpenuhi") throw new Error("unreachable");
    expect(result.gate).toEqual({
      ready: false,
      items: [
        { key: "petak_dibersihkan", met: false },
        { key: "cek_denah", met: false },
      ],
    });

    const read = await setup.lokasi.lokasiMitra(admin, lokasiMitra.id);
    expect(read).toMatchObject({ ok: true, lokasiMitra: { flags: { pemesananTerencanaAktif: false } } });
  });

  it("switches on, audited, once every Petak is cleared (no Perlu Verifikasi left) and a Cek Denah is recorded", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await recordCekDenahViaFieldwork(setup, admin, lokasiMitra.id);

    const result = await setup.lokasi.activateTerencana(admin, lokasiMitra.id, { hasPetakPerluVerifikasi: false });

    expect(result).toEqual({ ok: true });
    const read = await setup.lokasi.lokasiMitra(admin, lokasiMitra.id);
    expect(read).toMatchObject({ ok: true, lokasiMitra: { flags: { pemesananTerencanaAktif: true } } });
    expect((await setup.audit.entriesForLokasi(lokasiMitra.id)).at(-1)).toMatchObject({
      actor: { accountId: admin.accountId, role: "admin_platform" },
      action: "lokasi.aktifkan_terencana",
      before: { flags: { pemesananTerencanaAktif: false } },
      after: { flags: { pemesananTerencanaAktif: true } },
    });
  });

  it("a newly drawn (uncleared) Petak is what the Inventory module's own fact reports", async () => {
    const setup = publishOnTestDatabase(db);
    const fixture = await denahFixture(setup);
    await newBlok(setup, fixture);

    expect(await setup.inventory.hasPetakPerluVerifikasi(fixture.lokasiMitra.id)).toBe(true);
  });

  it("switching on again is a harmless no-op", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await recordCekDenahViaFieldwork(setup, admin, lokasiMitra.id, "Sesuai");
    await setup.lokasi.activateTerencana(admin, lokasiMitra.id, { hasPetakPerluVerifikasi: false });

    expect(await setup.lokasi.activateTerencana(admin, lokasiMitra.id, { hasPetakPerluVerifikasi: true })).toEqual({ ok: true });
  });

  it("a policy may still change while it is on (only switching it on is activateTerencana's own job)", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await recordCekDenahViaFieldwork(setup, admin, lokasiMitra.id);
    await setup.lokasi.activateTerencana(admin, lokasiMitra.id, { hasPetakPerluVerifikasi: false });

    const changed = await setup.lokasi.setPoliciesAndFlags(admin, lokasiMitra.id, {
      policies: { ...DEFAULT_POLICIES, masaPembatalanDays: 14, refundAfterMasaPembatalanPercent: 25 },
      flags: { ...DEFAULT_FLAGS, pemesananTerencanaAktif: true },
    });

    expect(changed).toEqual({ ok: true });
    expect(await setup.lokasi.lokasiMitra(admin, lokasiMitra.id)).toMatchObject({
      lokasiMitra: {
        policies: { masaPembatalanDays: 14, refundAfterMasaPembatalanPercent: 25 },
        flags: { pemesananTerencanaAktif: true },
      },
    });
  });

  it("an Admin Lokasi (not Admin Platform) cannot switch it on", async () => {
    const setup = publishOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiMitra.id]);

    expect(await setup.lokasi.activateTerencana(adminLokasi, lokasiMitra.id, { hasPetakPerluVerifikasi: false })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
  });
});

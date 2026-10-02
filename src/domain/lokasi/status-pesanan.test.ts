import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lokasiOnTestDatabase, newLokasiMitra, setLokasiMitraStatusForTest, signedInAdminLokasi, signedInAdminPlatform } from "../../../tests/support/lokasi";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

async function terverifikasi() {
  const setup = lokasiOnTestDatabase(db);
  const { actor: admin } = await signedInAdminPlatform(setup);
  const lokasi = await newLokasiMitra(setup, admin);
  await setLokasiMitraStatusForTest(db, lokasi.id, "terverifikasi");
  return { setup, admin, lokasi };
}

describe("Lokasi Mitra Ditangguhkan", () => {
  it("blocks only a new Hak Pakai; burials under a Hak Pakai, Perpanjangan, Layanan, Paket cycles and Pembatalan carry on", async () => {
    const { setup, admin, lokasi } = await terverifikasi();
    expect(await setup.lokasi.tangguhkan(admin, lokasi.id)).toEqual({ ok: true });

    expect(await setup.lokasi.izinPesanan(lokasi.id, "hak_pakai_baru")).toEqual({ diizinkan: false, alasan: "ditangguhkan" });
    for (const jenis of ["lanjutan", "siklus_paket"] as const) {
      expect(await setup.lokasi.izinPesanan(lokasi.id, jenis)).toEqual({ diizinkan: true });
    }
    expect(await setup.lokasi.isTerverifikasi(lokasi.id)).toBe(false);
    expect(await setup.lokasi.publicLokasiMitraList()).toEqual([]);
  });

  it("is audited, refused for an Admin Lokasi, and Admin Platform can reinstate it", async () => {
    const { setup, admin, lokasi } = await terverifikasi();
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasi.id]);
    expect(await setup.lokasi.tangguhkan(adminLokasi, lokasi.id)).toEqual({ ok: false, reason: "tidak_berwenang" });

    await setup.lokasi.tangguhkan(admin, lokasi.id);
    expect((await setup.audit.entriesForLokasi(lokasi.id)).at(-1)).toMatchObject({
      action: "lokasi.tangguhkan",
      before: { status: "terverifikasi" },
      after: { status: "ditangguhkan" },
    });
    expect(await setup.lokasi.tangguhkan(admin, lokasi.id)).toEqual({ ok: false, reason: "status_tidak_cocok" });

    expect(await setup.lokasi.pulihkan(admin, lokasi.id)).toEqual({ ok: true });
    expect(await setup.lokasi.izinPesanan(lokasi.id, "hak_pakai_baru")).toEqual({ diizinkan: true });
  });

  it("a Lokasi Belum Tayang is untouched by the status rules", async () => {
    const setup = lokasiOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasi = await newLokasiMitra(setup, admin);
    expect(await setup.lokasi.tangguhkan(admin, lokasi.id)).toEqual({ ok: false, reason: "status_tidak_cocok" });
    expect(await setup.lokasi.izinPesanan(lokasi.id, "lanjutan")).toEqual({ diizinkan: true });
  });
});

describe("Lokasi Mitra Berhenti", () => {
  it("takes an effective date, 30 days after the decision by default, audited", async () => {
    const { setup, admin, lokasi } = await terverifikasi();
    const today = setup.clock.now();
    const result = await setup.lokasi.hentikan(admin, lokasi.id, {});
    expect(result).toMatchObject({ ok: true });
    const { berlakuOn } = result as { berlakuOn: string };
    expect(Date.parse(`${berlakuOn}T00:00:00+07:00`) - Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00+07:00`)).toBeGreaterThanOrEqual(29 * 86_400_000);
    expect((await setup.audit.entriesForLokasi(lokasi.id)).at(-1)).toMatchObject({
      action: "lokasi.hentikan",
      before: { status: "terverifikasi" },
      after: { status: "berhenti", berlakuOn },
    });
  });

  it("refuses an effective date in the past", async () => {
    const { setup, admin, lokasi } = await terverifikasi();
    expect(await setup.lokasi.hentikan(admin, lokasi.id, { berlakuOn: "2000-01-01" })).toEqual({ ok: false, reason: "tanggal_lampau" });
  });

  it("from the decision no Paket cycles are issued and no new Hak Pakai; until the effective date the rest carries on, then nothing at all", async () => {
    const { setup, admin, lokasi } = await terverifikasi();
    await setup.lokasi.hentikan(admin, lokasi.id, { berlakuOn: "2026-10-20" });

    expect(await setup.lokasi.izinPesanan(lokasi.id, "siklus_paket")).toEqual({ diizinkan: false, alasan: "berhenti" });
    expect(await setup.lokasi.izinPesanan(lokasi.id, "hak_pakai_baru")).toEqual({ diizinkan: false, alasan: "berhenti" });
    expect(await setup.lokasi.izinPesanan(lokasi.id, "lanjutan")).toEqual({ diizinkan: true });
    expect(await setup.lokasi.statusPesananOf(lokasi.id)).toMatchObject({ status: "berhenti", berlakuOn: "2026-10-20", berlaku: false });

    setup.clock.advance({ days: 40 });
    for (const jenis of ["hak_pakai_baru", "lanjutan", "siklus_paket"] as const) {
      expect(await setup.lokasi.izinPesanan(lokasi.id, jenis)).toEqual({ diizinkan: false, alasan: "berhenti" });
    }
    expect(await setup.lokasi.statusPesananOf(lokasi.id)).toMatchObject({ berlaku: true });
  });

  it("the effective-date sweep lists a Lokasi once its date has come, until it is marked processed (idempotent)", async () => {
    const { setup, admin, lokasi } = await terverifikasi();
    await setup.lokasi.hentikan(admin, lokasi.id, { berlakuOn: "2026-10-20" });
    expect(await setup.lokasi.berhentiBerlakuBelumDiproses()).toEqual([]);

    setup.clock.advance({ days: 40 });
    expect(await setup.lokasi.berhentiBerlakuBelumDiproses()).toEqual([lokasi.id]);
    await setup.lokasi.tandaiBerhentiDiproses(lokasi.id);
    await setup.lokasi.tandaiBerhentiDiproses(lokasi.id);
    expect(await setup.lokasi.berhentiBerlakuBelumDiproses()).toEqual([]);
  });

  it("can follow Ditangguhkan, but a Berhenti Lokasi cannot be reinstated or suspended again", async () => {
    const { setup, admin, lokasi } = await terverifikasi();
    await setup.lokasi.tangguhkan(admin, lokasi.id);
    expect(await setup.lokasi.hentikan(admin, lokasi.id, {})).toMatchObject({ ok: true });
    expect(await setup.lokasi.pulihkan(admin, lokasi.id)).toEqual({ ok: false, reason: "status_tidak_cocok" });
    expect(await setup.lokasi.hentikan(admin, lokasi.id, {})).toEqual({ ok: false, reason: "status_tidak_cocok" });
  });
});

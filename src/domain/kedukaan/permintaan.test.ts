import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { kedukaanOnTestDatabase, keluargaDenganEmail, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform, type KedukaanSetup } from "../../../tests/support/kedukaan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const MOBIL_JENAZAH = {
  jenis: "mobil_jenazah",
  nama: "Siti Aminah",
  telepon: "0812 3456 7890",
  kabKota: "Kota Jakarta Selatan",
  catatan: "Jenazah di RS Fatmawati",
  rincian: { asal: "RS Fatmawati, Jakarta Selatan", tujuan: "Graha Sentosa, Bekasi", tanggal: "2026-10-01" },
};

const KONSULTASI = {
  jenis: "konsultasi",
  nama: "Budi Santoso",
  telepon: "081298765432",
  kabKota: "Kota Bekasi",
  rincian: { waktuDihubungi: "sore", lokasiDiminati: "Graha Sentosa" },
};

async function ajukan(setup: KedukaanSetup, keluarga: { accountId: string; email: string }, input: Record<string, unknown> = MOBIL_JENAZAH) {
  const hasil = await setup.kedukaan.ajukan(keluarga, input);
  if (!hasil.ok) throw new Error(`ajukan refused: ${hasil.reason}`);
  return hasil;
}

async function emailUntuk(setup: KedukaanSetup, to: string) {
  await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
  return setup.email.sent.filter((surat) => surat.to === to && surat.subject.startsWith("Permintaan "));
}

describe("Permintaan Kedukaan: a family asks for a Layanan Kedukaan", () => {
  it("starts Diajukan with a Nomor Permintaan, is emailed to the family and is in Akun Saya", async () => {
    const setup = kedukaanOnTestDatabase(db);
    const keluarga = await keluargaDenganEmail(setup);

    const hasil = await ajukan(setup, keluarga);

    expect(hasil.nomor).toMatch(/^KDK-2026-\d{6}$/);
    const subjek = (await emailUntuk(setup, "keluarga@contoh.id")).map((surat) => surat.subject);
    expect(subjek).toEqual([`Permintaan Mobil Jenazah ${hasil.nomor}: Diajukan`]);
    const saya = await setup.kedukaan.milikSaya(keluarga.accountId);
    expect(saya.map((satu) => [satu.nomor, satu.jenis, satu.status, satu.telepon])).toEqual([[hasil.nomor, "mobil_jenazah", "diajukan", "+6281234567890"]]);
  });

  it("is refused, and nothing kept, when a field its jenis needs is missing or the phone number is invalid", async () => {
    const setup = kedukaanOnTestDatabase(db);
    const keluarga = await keluargaDenganEmail(setup);

    expect(await setup.kedukaan.ajukan(keluarga, { ...MOBIL_JENAZAH, rincian: { asal: "RS Fatmawati", tanggal: "2026-10-01" } })).toEqual({
      ok: false,
      reason: "input_tidak_valid",
    });
    expect(await setup.kedukaan.ajukan(keluarga, { ...KONSULTASI, rincian: { waktuDihubungi: "malam" } })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await setup.kedukaan.ajukan(keluarga, { ...MOBIL_JENAZAH, telepon: "12" })).toEqual({ ok: false, reason: "nomor_telepon_tidak_valid" });
    expect(await setup.kedukaan.milikSaya(keluarga.accountId)).toEqual([]);
  });

  it("a Mobil Jenazah waits 30 minutes for its first contact, Bunga Duka Cita 2 hours, and a Konsultasi one Hari Kerja", async () => {
    const setup = kedukaanOnTestDatabase(db);
    const keluarga = await keluargaDenganEmail(setup);
    const now = setup.clock.now();

    const mobil = await ajukan(setup, keluarga);
    const bunga = await ajukan(setup, keluarga, { ...MOBIL_JENAZAH, jenis: "bunga_duka_cita", rincian: { tanggal: "2026-10-02", teksUcapan: "Turut berduka cita" } });
    const konsultasi = await ajukan(setup, keluarga, KONSULTASI);

    const terbuka = new Map((await setup.kedukaan.terbuka()).map((satu) => [satu.id, satu.tenggatPada.getTime() - now.getTime()]));
    expect(terbuka.get(mobil.permintaanId)).toBe(30 * 60_000);
    expect(terbuka.get(bunga.permintaanId)).toBe(2 * 60 * 60_000);
    expect(terbuka.get(konsultasi.permintaanId)).toBeGreaterThanOrEqual(24 * 60 * 60_000);
  });

  it("the family cancels its own Permintaan while Diajukan, never someone else's, and not once it was contacted", async () => {
    const setup = kedukaanOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const keluarga = await keluargaDenganEmail(setup);
    const lain = await keluargaDenganEmail(setup, "lain@contoh.id");
    const satu = await ajukan(setup, keluarga);
    const dua = await ajukan(setup, keluarga, KONSULTASI);

    expect(await setup.kedukaan.batalkanSaya(lain.accountId, satu.permintaanId)).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect(await setup.kedukaan.batalkanSaya(keluarga.accountId, satu.permintaanId)).toEqual({ ok: true });
    expect(await setup.kedukaan.pindahStatus(admin, dua.permintaanId, { status: "dihubungi", catatan: null })).toEqual({ ok: true });
    expect(await setup.kedukaan.batalkanSaya(keluarga.accountId, dua.permintaanId)).toEqual({ ok: false, reason: "tidak_bisa_dibatalkan" });

    const status = new Map((await setup.kedukaan.milikSaya(keluarga.accountId)).map((p) => [p.id, p.status]));
    expect(status.get(satu.permintaanId)).toBe("dibatalkan");
    expect(status.get(dua.permintaanId)).toBe("dihubungi");
    expect((await setup.kedukaan.terbuka()).map((p) => p.id)).toEqual([]);
  });
});

describe("Permintaan Kedukaan: Admin Platform follows it up", () => {
  it("moves Diajukan → Dihubungi → Selesai, audited, each change emailed to the family, and a final status never moves", async () => {
    const setup = kedukaanOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const keluarga = await keluargaDenganEmail(setup);
    const { permintaanId, nomor } = await ajukan(setup, keluarga);

    expect(await setup.kedukaan.pindahStatus(admin, permintaanId, { status: "selesai", catatan: null })).toEqual({ ok: false, reason: "transisi_tidak_boleh" });
    expect(await setup.kedukaan.pindahStatus(admin, permintaanId, { status: "dihubungi", catatan: "Mobil berangkat 10.00" })).toEqual({ ok: true });
    expect(await setup.kedukaan.pindahStatus(admin, permintaanId, { status: "selesai", catatan: null })).toEqual({ ok: true });
    expect(await setup.kedukaan.pindahStatus(admin, permintaanId, { status: "dibatalkan", catatan: "Salah input" })).toEqual({ ok: false, reason: "transisi_tidak_boleh" });

    const permintaan = await setup.kedukaan.satu(admin, permintaanId);
    expect(permintaan?.riwayat.map((r) => r.status)).toEqual(["diajukan", "dihubungi", "selesai"]);
    const subjek = (await emailUntuk(setup, "keluarga@contoh.id")).map((s) => s.subject);
    expect(subjek).toEqual(expect.arrayContaining([`Permintaan Mobil Jenazah ${nomor}: Dihubungi`, `Permintaan Mobil Jenazah ${nomor}: Selesai`]));
    const audit = await setup.audit.entriesAbout({ kind: "permintaan_kedukaan", id: permintaanId });
    expect(audit.map((e) => [e.action, e.after])).toEqual([
      ["kedukaan.pindah_status", { status: "dihubungi" }],
      ["kedukaan.pindah_status", { status: "selesai" }],
    ]);
  });

  it("cancels only with a reason, which the family reads in the email", async () => {
    const setup = kedukaanOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const keluarga = await keluargaDenganEmail(setup);
    const { permintaanId } = await ajukan(setup, keluarga);

    expect(await setup.kedukaan.pindahStatus(admin, permintaanId, { status: "dibatalkan", catatan: "  " })).toEqual({ ok: false, reason: "alasan_wajib" });
    expect(await setup.kedukaan.pindahStatus(admin, permintaanId, { status: "dibatalkan", catatan: "Keluarga sudah memakai penyedia lain" })).toEqual({ ok: true });

    const surat = (await emailUntuk(setup, "keluarga@contoh.id")).find((satu) => satu.subject.endsWith(": Dibatalkan"));
    expect(surat?.text).toContain("Keluarga sudah memakai penyedia lain");
  });

  it("refuses an Admin Lokasi, who also reads nothing of it", async () => {
    const setup = kedukaanOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const lokasi = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasi.id]);
    const keluarga = await keluargaDenganEmail(setup);
    const { permintaanId } = await ajukan(setup, keluarga);

    expect(await setup.kedukaan.pindahStatus(adminLokasi, permintaanId, { status: "dihubungi", catatan: null })).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.kedukaan.semua(adminLokasi)).toEqual([]);
    expect(await setup.kedukaan.satu(adminLokasi, permintaanId)).toBeNull();
    expect((await setup.kedukaan.satu(admin, permintaanId))?.status).toBe("diajukan");
  });
});

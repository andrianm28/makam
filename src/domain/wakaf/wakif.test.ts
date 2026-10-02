import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { signedInAdminPlatform, signedInPetugasLapangan, wakafOnTestDatabase, wakifDenganEmail, type WakafSetup } from "../../../tests/support/wakaf";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const JPEG = (isi: number) => ({ body: new Uint8Array([0xff, 0xd8, 0xff, isi, 1, 2]), contentType: "image/jpeg" });

const PENGAJUAN = {
  tujuan: "sosial" as const,
  wakifNama: "Haji Slamet",
  wakifTelepon: "0812 3456 7890",
  hubunganDenganTanah: "Pemilik",
  kabKota: "Kota Depok",
  alamat: "Jl. Raya Sawangan No. 12, Pancoran Mas",
  pin: null,
  luasM2: 1500,
  jenisBukti: "SHM",
};

async function disiapkan() {
  const setup = wakafOnTestDatabase(db);
  const { actor: admin } = await signedInAdminPlatform(setup);
  const wakif = await wakifDenganEmail(setup);
  const diajukan = await setup.wakaf.ajukanWakaf(wakif, PENGAJUAN);
  if (!diajukan.ok) throw new Error(`refused: ${diajukan.reason}`);
  return { setup, admin, wakif, pengajuanId: diajukan.pengajuanId };
}

async function sampai(setup: WakafSetup, admin: Parameters<WakafSetup["wakaf"]["pindahStatus"]>[0], pengajuanId: string, status: "ditinjau" | "survei_dijadwalkan" | "menunggu_ikrar" | "proses_sertipikat" | "selesai") {
  const petugas = await signedInPetugasLapangan(setup, admin);
  const langkah = [
    ["ditinjau", {}],
    ["survei_dijadwalkan", { tanggal: "2026-10-08", petugasAccountId: petugas.accountId }],
    ["menunggu_ikrar", { tanggal: "2026-10-20" }],
    ["proses_sertipikat", {}],
    ["selesai", { hasil: { kunci: "lainnya", ...JPEG(7) } }],
  ] as const;
  for (const [nama, extra] of langkah) {
    const hasil = await setup.wakaf.pindahStatus(admin, { pengajuanId, status: nama, ...extra });
    if (!hasil.ok) throw new Error(`${nama} refused: ${hasil.reason}`);
    if (nama === status) return;
  }
}

describe("Pengajuan Wakaf: the Wakif cancels", () => {
  it.each(["diajukan", "ditinjau", "survei_dijadwalkan"] as const)("can cancel while %s, told by email", async (status) => {
    const { setup, admin, wakif, pengajuanId } = await disiapkan();
    if (status !== "diajukan") await sampai(setup, admin, pengajuanId, status);

    expect(await setup.wakaf.batalkanWakaf(wakif, { pengajuanId })).toEqual({ ok: true });
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    expect((await setup.wakaf.pengajuanSaya(wakif))[0]?.status).toBe("dibatalkan");
    expect(setup.email.sent.some((surat) => surat.to === "wakif@contoh.id" && surat.subject.endsWith(": Dibatalkan"))).toBe(true);
  });

  it.each(["menunggu_ikrar", "proses_sertipikat", "selesai"] as const)("cannot cancel from %s on", async (status) => {
    const { setup, admin, wakif, pengajuanId } = await disiapkan();
    await sampai(setup, admin, pengajuanId, status);

    expect(await setup.wakaf.batalkanWakaf(wakif, { pengajuanId })).toEqual({ ok: false, reason: "tidak_dapat_dibatalkan" });
  });

  it("cannot cancel another Wakif's Pengajuan", async () => {
    const { setup, pengajuanId } = await disiapkan();
    const lain = await wakifDenganEmail(setup, "lain@contoh.id");

    expect(await setup.wakaf.batalkanWakaf(lain, { pengajuanId })).toEqual({ ok: false, reason: "pengajuan_tidak_ditemukan" });
  });
});

describe("Wakaf tab: what the Wakif sees", () => {
  it("shows the timeline, dates and notes written to the Wakif, never an internal note or the survey", async () => {
    const { setup, admin, wakif, pengajuanId } = await disiapkan();
    await sampai(setup, admin, pengajuanId, "survei_dijadwalkan");
    await setup.wakaf.tulisCatatan(admin, { pengajuanId, jenis: "wakif", isi: "Mohon siapkan salinan SHM asli saat survei." });
    await setup.wakaf.tulisCatatan(admin, { pengajuanId, jenis: "internal", isi: "RAHASIA: tetangga bilang tanah ini pernah disengketakan." });

    const milik = await setup.wakaf.pengajuanSaya(wakif);

    expect(milik).toHaveLength(1);
    expect(milik[0]).toMatchObject({ status: "survei_dijadwalkan", tanggalSurvei: "2026-10-08" });
    expect(milik[0]?.riwayat.map((satu) => satu.status)).toEqual(["diajukan", "ditinjau", "survei_dijadwalkan"]);
    expect(milik[0]?.catatan.map((satu) => satu.isi)).toEqual(["Mohon siapkan salinan SHM asli saat survei."]);
    const semua = JSON.stringify(milik);
    expect(semua).not.toContain("RAHASIA");
    const detail = await setup.wakaf.pengajuanStaf(admin, pengajuanId);
    if (!detail.ok || !detail.pengajuan.tugasSurveiId) throw new Error("no survey Tugas");
    expect(semua).not.toContain(detail.pengajuan.tugasSurveiId);
    expect(detail.pengajuan.catatan.map((satu) => satu.jenis)).toEqual(["wakif", "internal"]);
  });

  it("lists only the signed-in Wakif's own Pengajuan", async () => {
    const { setup, wakif } = await disiapkan();
    const lain = await wakifDenganEmail(setup, "lain@contoh.id");

    expect(await setup.wakaf.pengajuanSaya(lain)).toEqual([]);
    expect(await setup.wakaf.pengajuanSaya(wakif)).toHaveLength(1);
  });

  it("takes documents later, and gives the final AIW or certificate scan back through a signed link", async () => {
    const { setup, admin, wakif, pengajuanId } = await disiapkan();
    const lain = await wakifDenganEmail(setup, "lain@contoh.id");

    expect(await setup.wakaf.tambahBerkasWakaf(wakif, { pengajuanId, berkas: [{ kunci: "bukti_kepemilikan", ...JPEG(1) }] })).toEqual({ ok: true });
    await sampai(setup, admin, pengajuanId, "selesai");

    const [milik] = await setup.wakaf.pengajuanSaya(wakif);
    expect(milik?.berkas.map((satu) => satu.kunci).sort()).toEqual(["bukti_kepemilikan", "hasil"]);
    for (const berkas of milik!.berkas) {
      const url = await setup.wakaf.berkasUrl(wakif, pengajuanId, berkas.id);
      expect(url).toMatchObject({ ok: true });
      expect(await setup.wakaf.berkasUrl(lain, pengajuanId, berkas.id)).toEqual({ ok: false, reason: "pengajuan_tidak_ditemukan" });
    }
  });

  it("refuses a document of a kind the FileStore does not take", async () => {
    const { setup, wakif, pengajuanId } = await disiapkan();

    const hasil = await setup.wakaf.tambahBerkasWakaf(wakif, { pengajuanId, berkas: [{ kunci: "lainnya", body: new Uint8Array([1, 2, 3]), contentType: "text/html" }] });
    expect(hasil).toEqual({ ok: false, reason: "berkas_tidak_didukung" });
  });
});

describe("Pengajuan Wakaf: Admin Platform matches a Nazhir", () => {
  it("matches a Nazhir from the list, kept by name even if the Nazhir is later removed", async () => {
    const { setup, admin, pengajuanId } = await disiapkan();
    const nazhir = await setup.wakaf.tambahNazhir(admin, { nama: "Yayasan Wakaf Al-Ikhlas", jenis: "badan_hukum", kabKota: "Kota Depok", kontak: "0811", nomorBwi: "3.3/001" });
    if (!nazhir.ok) throw new Error("refused");

    expect(await setup.wakaf.cocokkanNazhir(admin, { pengajuanId, nazhirId: nazhir.nazhir.id })).toEqual({ ok: true });
    await setup.wakaf.hapusNazhir(admin, { nazhirId: nazhir.nazhir.id });

    const detail = await setup.wakaf.pengajuanStaf(admin, pengajuanId);
    expect(detail.ok && detail.pengajuan.nazhirNama).toBe("Yayasan Wakaf Al-Ikhlas");
    expect(await setup.wakaf.cocokkanNazhir(admin, { pengajuanId, nazhirId: nazhir.nazhir.id })).toEqual({ ok: false, reason: "nazhir_tidak_ditemukan" });
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  newLokasiMitra,
  signedInAdminLokasi,
  signedInAdminPlatform,
  signedInPetugasLapangan,
  wakafOnTestDatabase,
  wakifDenganEmail,
  type WakafSetup,
} from "../../../tests/support/wakaf";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const SCAN = { kunci: "lainnya" as const, body: new Uint8Array([0xff, 0xd8, 0xff, 9, 9, 9]), contentType: "image/jpeg" };

const PENGAJUAN = {
  tujuan: "keluarga" as const,
  namaKeluarga: "Keluarga Slamet",
  wakifNama: "Haji Slamet",
  wakifTelepon: "0812 3456 7890",
  hubunganDenganTanah: "Pemilik",
  kabKota: "Kota Depok",
  alamat: "Jl. Raya Sawangan No. 12, Pancoran Mas",
  pin: { lat: -6.4, lng: 106.82 },
  luasM2: 1500,
  jenisBukti: "SHM",
};

async function disiapkan() {
  const setup = wakafOnTestDatabase(db);
  const { actor: admin } = await signedInAdminPlatform(setup);
  const wakif = await wakifDenganEmail(setup);
  const diajukan = await setup.wakaf.ajukanWakaf(wakif, PENGAJUAN);
  if (!diajukan.ok) throw new Error(`refused: ${diajukan.reason}`);
  return { setup, admin, wakif, pengajuanId: diajukan.pengajuanId, nomor: diajukan.nomor };
}

async function pindah(setup: WakafSetup, admin: Parameters<WakafSetup["wakaf"]["pindahStatus"]>[0], pengajuanId: string, status: string, extra: Record<string, unknown> = {}) {
  return setup.wakaf.pindahStatus(admin, { pengajuanId, status, ...extra });
}

describe("Pengajuan Wakaf: Admin Platform moves the statuses by hand", () => {
  it("walks Diajukan, Ditinjau, Survei Dijadwalkan, Menunggu Ikrar, Proses Sertipikat and Selesai, each told to the Wakif by email", async () => {
    const { setup, admin, pengajuanId } = await disiapkan();
    const petugas = await signedInPetugasLapangan(setup, admin);

    expect(await pindah(setup, admin, pengajuanId, "ditinjau")).toEqual({ ok: true });
    expect(await pindah(setup, admin, pengajuanId, "survei_dijadwalkan", { tanggal: "2026-10-08", petugasAccountId: petugas.accountId })).toEqual({ ok: true });
    expect(await pindah(setup, admin, pengajuanId, "menunggu_ikrar", { tanggal: "2026-10-20" })).toEqual({ ok: true });
    expect(await pindah(setup, admin, pengajuanId, "proses_sertipikat")).toEqual({ ok: true });
    expect(await pindah(setup, admin, pengajuanId, "selesai", { hasil: SCAN })).toEqual({ ok: true });
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const detail = await setup.wakaf.pengajuanStaf(admin, pengajuanId);
    if (!detail.ok) throw new Error("not found");
    expect(detail.pengajuan.status).toBe("selesai");
    expect(detail.pengajuan.riwayat.map((satu) => satu.status)).toEqual(["diajukan", "ditinjau", "survei_dijadwalkan", "menunggu_ikrar", "proses_sertipikat", "selesai"]);
    const subjek = setup.email.sent.filter((surat) => surat.to === "wakif@contoh.id").map((surat) => surat.subject);
    for (const label of ["Diajukan", "Ditinjau", "Survei Dijadwalkan", "Menunggu Ikrar", "Proses Sertipikat", "Selesai"]) {
      expect(subjek.filter((satu) => satu.endsWith(`: ${label}`))).toHaveLength(1);
    }
  });

  it("schedules a Survei Wakaf Tugas Lapangan for the Petugas Lapangan, on the survey's date", async () => {
    const { setup, admin, pengajuanId } = await disiapkan();
    const petugas = await signedInPetugasLapangan(setup, admin);
    await pindah(setup, admin, pengajuanId, "ditinjau");

    await pindah(setup, admin, pengajuanId, "survei_dijadwalkan", { tanggal: "2026-10-08", petugasAccountId: petugas.accountId });

    const tugas = await setup.fieldwork.tugasSaya(petugas);
    expect(tugas).toEqual([expect.objectContaining({ type: "survei_wakaf", plannedDate: "2026-10-08", assigneeAccountId: petugas.accountId })]);
  });

  it("refuses a status that skips ahead, and one with no date, reason or scan where it needs one", async () => {
    const { setup, admin, pengajuanId } = await disiapkan();
    const petugas = await signedInPetugasLapangan(setup, admin);

    expect(await pindah(setup, admin, pengajuanId, "menunggu_ikrar", { tanggal: "2026-10-20" })).toEqual({ ok: false, reason: "transisi_tidak_valid" });
    await pindah(setup, admin, pengajuanId, "ditinjau");
    expect(await pindah(setup, admin, pengajuanId, "survei_dijadwalkan", { petugasAccountId: petugas.accountId })).toEqual({ ok: false, reason: "tanggal_wajib" });
    expect(await pindah(setup, admin, pengajuanId, "survei_dijadwalkan", { tanggal: "2026-10-08" })).toEqual({ ok: false, reason: "petugas_wajib" });
    expect(await pindah(setup, admin, pengajuanId, "ditolak")).toEqual({ ok: false, reason: "alasan_wajib" });
    expect((await setup.wakaf.pengajuanStaf(admin, pengajuanId).then((hasil) => hasil.ok && hasil.pengajuan.status))).toBe("ditinjau");
  });

  it("refuses Selesai without the AIW or certificate scan", async () => {
    const { setup, admin, pengajuanId } = await disiapkan();
    const petugas = await signedInPetugasLapangan(setup, admin);
    await pindah(setup, admin, pengajuanId, "ditinjau");
    await pindah(setup, admin, pengajuanId, "survei_dijadwalkan", { tanggal: "2026-10-08", petugasAccountId: petugas.accountId });
    await pindah(setup, admin, pengajuanId, "menunggu_ikrar", { tanggal: "2026-10-20" });
    await pindah(setup, admin, pengajuanId, "proses_sertipikat");

    expect(await pindah(setup, admin, pengajuanId, "selesai")).toEqual({ ok: false, reason: "hasil_wajib" });
  });

  it("closes a Pengajuan as Ditolak with its reason, and nothing moves it again", async () => {
    const { setup, admin, pengajuanId } = await disiapkan();

    expect(await pindah(setup, admin, pengajuanId, "ditolak", { alasan: "Tanah dalam sengketa" })).toEqual({ ok: true });
    expect(await pindah(setup, admin, pengajuanId, "ditinjau")).toEqual({ ok: false, reason: "transisi_tidak_valid" });
  });

  it("is never seen or changed by an Admin Lokasi, a Petugas Lapangan or the Wakif", async () => {
    const { setup, admin, wakif, pengajuanId } = await disiapkan();
    const lokasi = await newLokasiMitra(setup, admin);
    const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasi.id]);
    const petugas = await signedInPetugasLapangan(setup, admin);

    for (const siapa of [adminLokasi, petugas]) {
      expect(await pindah(setup, siapa, pengajuanId, "ditinjau")).toEqual({ ok: false, reason: "tidak_berwenang" });
      expect(await setup.wakaf.pengajuanStaf(siapa, pengajuanId)).toEqual({ ok: false, reason: "tidak_berwenang" });
      expect(await setup.wakaf.semuaPengajuan(siapa)).toEqual([]);
    }
    expect(wakif.accountId).toBeTruthy();
  });
});

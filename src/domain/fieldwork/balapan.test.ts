import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { fieldworkOnTestDatabase, signedInPetugasLapangan } from "../../../tests/support/fieldwork";
import { newLokasiMitra, signedInAdminPlatform } from "../../../tests/support/lokasi";

/*
 * UAT penuh, worst case of a Tugas Lapangan: the Petugas Lapangan on a weak
 * signal presses "Selesai" again before the first press answers. It is Selesai
 * once; the Lokasi's verification is recorded once.
 */

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);
const evidence = (kind: string) => ({ kind, file: { body: jpegBytes, contentType: "image/jpeg" } });

describe("a Tugas Lapangan under concurrency (UAT penuh, worst case)", () => {
  it("two Selesai at once complete a Kunjungan Verifikasi once, and the other press is told it is already done", async () => {
    const setup = fieldworkOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    const created = await setup.fieldwork.createTugasLapangan(admin, {
      type: "kunjungan_verifikasi",
      subject: "Taman Makam Wakaf Al-Ikhlas",
      lokasiId: lokasiMitra.id,
      address: "Jl. Raya Pondok Rangon No. 1",
      pin: { lat: -6.29, lng: 106.9 },
      plannedDate: "2026-10-05",
      assigneeAccountId: petugas.accountId,
    });
    if (!created.ok) throw new Error(`not created: ${created.reason}`);
    const selesai = () =>
      setup.fieldwork.completeTugasLapangan(petugas, created.tugasLapangan.id, {
        form: { addressConfirmed: true, pin: { lat: -6.29, lng: 106.9 }, facilities: { checked: [], note: "" }, note: "" },
        uploads: [evidence("foto_lokasi")],
      });

    const hasil = await Promise.all([selesai(), selesai()]);

    expect(hasil.filter((h) => h.ok)).toHaveLength(1);
    expect(hasil.find((h) => !h.ok)).toEqual({ ok: false, reason: "sudah_selesai" });
    const tugas = await setup.fieldwork.tugasLapangan(petugas, created.tugasLapangan.id);
    expect(tugas).toMatchObject({ ok: true, tugasLapangan: { status: "selesai" } });
  });
});

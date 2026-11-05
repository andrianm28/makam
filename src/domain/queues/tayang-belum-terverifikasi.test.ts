import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { minimumUntukTayang } from "../../../tests/support/publish";
import { newLokasiMitra, queuesOnTestDatabase, signedInAdminPlatform, signedInPetugasLapangan } from "../../../tests/support/queues";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("Antrean: the Kunjungan Verifikasi of a Lokasi Mitra listed without verification", () => {
  it("is still its first verification, never a 'Kunjungan ulang Lokasi' row, and shows as an overdue Tugas Lapangan like a Belum Tayang one", async () => {
    const setup = queuesOnTestDatabase(db);
    const { actor: admin } = await signedInAdminPlatform(setup);
    const petugas = await signedInPetugasLapangan(setup, admin);
    const lokasiMitra = await newLokasiMitra(setup, admin);
    await minimumUntukTayang(setup as never, admin, lokasiMitra.id);
    expect(await setup.lokasi.tayangkanBelumTerverifikasi(admin, lokasiMitra.id)).toMatchObject({ ok: true });
    const tugas = await setup.fieldwork.createTugasLapangan(admin, {
      type: "kunjungan_verifikasi",
      subject: lokasiMitra.name,
      lokasiId: lokasiMitra.id,
      address: lokasiMitra.address,
      pin: lokasiMitra.pin,
      plannedDate: "2026-09-20",
      assigneeAccountId: petugas.accountId,
    });
    if (!tugas.ok) throw new Error("unreachable");

    const rows = (await setup.queues.antrean(admin)).filter((row) => row.subjectId === lokasiMitra.id || row.subjectId === tugas.tugasLapangan.id);

    expect(rows.map((row) => row.type)).toEqual(["tugas_lapangan_lain"]);
  });
});

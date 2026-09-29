/**
 * The Konfirmasi Terencana rows (spec, Work Queues: the Antrean Lokasi's "Konfirmasi
 * Terencana" in Lainnya, due by the end of the Lokasi's next working day, and Admin
 * Platform's Tier 3 "Konfirmasi Terencana terlambat" once that has passed; ticket
 * 37's AC 1). Rows only: neither one cancels the order, and both close by themselves.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { pemesanDenganEmail } from "../../../tests/support/pemesanan";
import { queuesOnTestDatabase, signedInAdminPlatform, type QueuesSetup } from "../../../tests/support/queues";
import { terencanaLokasi } from "../../../tests/support/terencana";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** One Pemesanan Terencana placed at a Terencana-ready Lokasi Mitra, still Diajukan, on Thursday 2026-10-01. */
async function pesananTerencana(setup: QueuesSetup) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const fixture = await terencanaLokasi(setup, admin);
  const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id");
  const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
  const a01 = denah?.bloks.flatMap((blok) => blok.cells).find((cell) => cell.nomorMakam === "A-01")?.id;
  if (!a01) throw new Error("no Petak A-01 on the fixture's Denah");
  const placed = await setup.pemesanan.placeTerencana({
    pemesanName: "Rina Wulandari",
    phoneNumber: "081234567890",
    pemegangHak: { mode: "pemesan" },
    calonPenghuni: { mode: "saya" },
    pemesan,
    lokasiId: fixture.lokasiMitra.id,
    units: [{ petakId: a01 }],
  });
  if (!placed.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(placed)}`);
  return { admin, fixture, nomor: placed.pemesanan.nomor };
}

/** This ticket's rows only: the fixture's freshly drawn Blok B leaves a "Petak Perlu Verifikasi" row beside them. */
const barisTerencana = <T extends { type: string }>(rows: T[]) => rows.filter((row) => row.type === "konfirmasi_terencana");

describe('the Antrean Lokasi\'s "Konfirmasi Terencana" row', () => {
  it("is in Lainnya, due by the end of the Lokasi's next Hari Kerja, and links to the order", async () => {
    const setup = queuesOnTestDatabase(db);
    const { fixture, nomor } = await pesananTerencana(setup);

    const antrean = await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id);

    expect(antrean.mendesak).toEqual([]);
    expect(barisTerencana(antrean.lainnya)).toEqual([
      expect.objectContaining({
        type: "konfirmasi_terencana",
        label: "Konfirmasi Terencana",
        subjectKind: "pemesanan_terencana",
        subjectLabel: `${nomor} · A-01`,
        href: `/staf/admin-lokasi/${fixture.lokasiMitra.id}/pesanan/${nomor}`,
        deadline: wib("2026-10-02 15:00"),
        pastDeadline: false,
      }),
    ]);
  });

  it("stays, marked past its deadline, once the deadline has gone by: nothing cancels the order", async () => {
    const setup = queuesOnTestDatabase(db);
    const { fixture, nomor } = await pesananTerencana(setup);

    setup.clock.set(wib("2026-10-03 09:00"));
    const antrean = await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id);

    expect(barisTerencana(antrean.lainnya)).toEqual([expect.objectContaining({ subjectLabel: `${nomor} · A-01`, pastDeadline: true })]);
  });

  it("closes itself when the order is declined", async () => {
    const setup = queuesOnTestDatabase(db);
    const { fixture, nomor } = await pesananTerencana(setup);

    const ditolak = await setup.pemesanan.tolakTerencana(fixture.adminLokasi, { nomor, alasan: "kapasitas_penuh" });
    expect(ditolak.ok).toBe(true);

    expect(barisTerencana((await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).lainnya)).toEqual([]);
  });
});

describe('the Admin Platform Antrean\'s Tier 3 "Konfirmasi Terencana terlambat" row', () => {
  const tier3 = async (setup: QueuesSetup, admin: Parameters<QueuesSetup["queues"]["antrean"]>[0]) =>
    (await setup.queues.antrean(admin)).filter((row) => row.type === "konfirmasi_terencana_terlambat");

  it("appears only after the deadline, is Tier 3, and names the plots and the Lokasi Mitra", async () => {
    const setup = queuesOnTestDatabase(db);
    const { admin, fixture, nomor } = await pesananTerencana(setup);

    setup.clock.set(wib("2026-10-02 15:00"));
    expect(await tier3(setup, admin)).toEqual([]);

    // Strictly after the deadline, not at its instant.
    setup.clock.set(new Date(wib("2026-10-02 15:00").getTime() + 1));
    expect(await tier3(setup, admin)).toEqual([
      expect.objectContaining({
        type: "konfirmasi_terencana_terlambat",
        tier: 3,
        label: "Konfirmasi Terencana terlambat",
        subjectKind: "pemesanan_terencana",
        subjectLabel: `${nomor} · A-01 · ${fixture.lokasiMitra.name}`,
        deadline: wib("2026-10-02 15:00"),
        pastDeadline: true,
      }),
    ]);
  });

  it("closes itself the moment the Lokasi answers", async () => {
    const setup = queuesOnTestDatabase(db);
    const { admin, fixture, nomor } = await pesananTerencana(setup);
    setup.clock.set(wib("2026-10-02 16:00"));
    expect(await tier3(setup, admin)).toHaveLength(1);

    const ditolak = await setup.pemesanan.tolakTerencana(fixture.adminLokasi, { nomor, alasan: "petak_tidak_tersedia" });
    expect(ditolak.ok).toBe(true);

    expect(await tier3(setup, admin)).toEqual([]);
  });
});

/**
 * The "Catat Pemakaman" prompt (spec, Scheduler: "Catat Pemakaman" prompts;
 * Work Queues: the Antrean Lokasi's Lainnya rows; ticket 25's AC 1). The Admin
 * Lokasi is reminded on the day after the burial it agreed, because a burial
 * nobody records leaves the Hak Pakai's term unstarted and the family's Tagihan
 * with no clock. The row closes itself when the Pemakaman is recorded.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { queuesOnTestDatabase, type QueuesSetup } from "../../../tests/support/queues";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";
import { orderSaatDuka, saatDukaFixture } from "../../../tests/support/pemesanan";
import { catatPemakamanTick } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A confirmed order at the fixture's Lokasi Mitra, the burial agreed for the 2nd at 10:00. */
async function pesananDikonfirmasi(setup: QueuesSetup) {
  const fixture = await saatDukaFixture(setup);
  await siapkanOperatorPemesanan(setup);
  const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");
  const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
    nomor: placed.pemesanan.nomor,
    petakId: cells[0]!.id,
    pemakamanAt: "2026-10-02T10:00",
  });
  if (!hasil.ok) throw new Error(`confirmation refused: ${hasil.reason}`);
  return { ...fixture, nomor: placed.pemesanan.nomor };
}

/** The Antrean Lokasi's "Catat Pemakaman" rows, as the staff read them. */
async function barisCatatPemakaman(setup: QueuesSetup, fixture: Awaited<ReturnType<typeof pesananDikonfirmasi>>) {
  const antrean = await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id);
  return antrean.lainnya.filter((row) => row.type === "catat_pemakaman");
}

describe('the "Catat Pemakaman" prompt', () => {
  it("appears in Lainnya the day after the planned burial, and not a minute before", async () => {
    const setup = queuesOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    expect(await barisCatatPemakaman(setup, fixture)).toEqual([]);

    // The burial day itself: the Lokasi is still digging.
    setup.clock.set(wib("2026-10-02 23:00"));
    await catatPemakamanTick({ db }, setup.clock.now());
    expect(await barisCatatPemakaman(setup, fixture)).toEqual([]);

    // The day after: the prompt is raised.
    setup.clock.set(wib("2026-10-03 00:01"));
    await catatPemakamanTick({ db }, setup.clock.now());
    expect(await barisCatatPemakaman(setup, fixture)).toMatchObject([
      {
        label: "Catat Pemakaman",
        subjectKind: "pemesanan_makam",
        subjectLabel: `${fixture.nomor} · Siti Aminah`,
        href: `/staf/admin-lokasi/${fixture.lokasiMitra.id}/pesanan/${fixture.nomor}`,
        pastDeadline: false,
      },
    ]);
  });

  it("running the tick again raises no second prompt, and two workers at once raise one", async () => {
    const setup = queuesOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    setup.clock.set(wib("2026-10-03 00:01"));

    await catatPemakamanTick({ db }, setup.clock.now());
    await catatPemakamanTick({ db }, setup.clock.now());
    await catatPemakamanTick({ db }, setup.clock.now());

    expect(await barisCatatPemakaman(setup, fixture)).toHaveLength(1);
  });

  it("closes itself once the Pemakaman is recorded", async () => {
    const setup = queuesOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    // A second order of the same Lokasi, still waiting for its confirmation: no plot, nothing to record.
    const belum = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
    if (!belum.ok) throw new Error(`order refused: ${belum.reason}`);
    setup.clock.set(wib("2026-10-03 00:01"));
    await catatPemakamanTick({ db }, setup.clock.now());
    expect((await barisCatatPemakaman(setup, fixture)).map((row) => row.subjectLabel)).toEqual([`${fixture.nomor} · Siti Aminah`]);

    setup.clock.set(wib("2026-10-03 09:00"));
    await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-02" });
    await catatPemakamanTick({ db }, setup.clock.now());
    expect(await barisCatatPemakaman(setup, fixture)).toEqual([]);
  });

  it("a burial whose planned date had already passed when the order was confirmed is prompted at once", async () => {
    const setup = queuesOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    // The Lokasi confirms on the burial day, hours after it happened.
    setup.clock.set(wib("2026-10-02 20:00"));
    await catatPemakamanTick({ db }, setup.clock.now());
    expect(await barisCatatPemakaman(setup, fixture)).toEqual([]);

    setup.clock.set(wib("2026-10-03 00:01"));
    await catatPemakamanTick({ db }, setup.clock.now());
    expect(await barisCatatPemakaman(setup, fixture)).toHaveLength(1);
  });
});

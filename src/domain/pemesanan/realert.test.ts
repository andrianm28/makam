/**
 * The Saat Duka re-alert (spec, Notifications: a new order alerts every Admin
 * Lokasi of the Lokasi and the Kontak Siaga "again if still unconfirmed after
 * 1 h of Jam Operasional"; ticket 23's AC 2 and 3), counted in the Lokasi's own
 * working time, so a closed night or a Sunday is not a family's wait.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { pemesananRealertTick } from "@/domain/pemesanan";
import { cellsOf } from "../../../tests/support/inventory";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("the re-alert of a Saat Duka order still unconfirmed", () => {
  it("goes out one service hour after the submission, at the Lokasi's own hour, and only once", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
    setup.diumumkan.length = 0;

    // Thursday 09:00 submitted; the Lokasi is open 07:00–15:00, so one service hour is 10:00.
    setup.clock.set(wib("2026-10-01 09:59"));
    expect(await pemesananRealertTick(depsOf(setup), setup.clock.now())).toEqual({ realert: 0 });
    expect(setup.diumumkan).toEqual([]);

    setup.clock.set(wib("2026-10-01 10:00"));
    expect(await pemesananRealertTick(depsOf(setup), setup.clock.now())).toEqual({ realert: 1 });
    expect(setup.diumumkan).toEqual([expect.objectContaining({ nomor: "MKM-2026-000001", penerima: [{ accountId: fixture.adminLokasi.accountId }] })]);

    // A tick that runs again (or a second worker) never alerts twice.
    setup.clock.set(wib("2026-10-01 10:30"));
    expect(await pemesananRealertTick(depsOf(setup), setup.clock.now())).toEqual({ realert: 0 });
    expect(setup.diumumkan).toHaveLength(1);
  });

  it("waits for the Lokasi's next open hour: a Friday evening order is re-alerted on Saturday morning", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    setup.clock.set(wib("2026-10-02 14:30"));
    await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));

    // The deadline is two service hours: 30 minutes on Friday, 90 more on Saturday from 07:00.
    expect((await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), pemesanName: "Dewi Lestari" })).ok).toBe(true);
    const [order] = await setup.pemesanan.antreanKonfirmasi(fixture.lokasiMitra.id);
    expect(order?.konfirmasiDueAt).toEqual(wib("2026-10-03 08:30"));
    // The re-alert is one service hour: 30 minutes on Friday, 30 more on Saturday.
    setup.clock.set(wib("2026-10-02 23:00"));
    expect(await pemesananRealertTick(depsOf(setup), setup.clock.now())).toEqual({ realert: 0 });
    setup.clock.set(wib("2026-10-03 07:29"));
    expect(await pemesananRealertTick(depsOf(setup), setup.clock.now())).toEqual({ realert: 0 });
    setup.clock.set(wib("2026-10-03 07:30"));
    expect(await pemesananRealertTick(depsOf(setup), setup.clock.now())).toEqual({ realert: 2 });
  });

  it("says nothing about an order that has been confirmed in the meantime", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    await siapkanOperatorPemesanan(setup);
    const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
    const [petak] = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");

    setup.clock.set(wib("2026-10-01 10:30"));
    const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
      nomor: placed.pemesanan.nomor,
      petakId: petak!.id,
      pemakamanAt: "2026-10-02T10:00",
    });
    expect(hasil.ok).toBe(true);
    setup.diumumkan.length = 0;

    setup.clock.set(wib("2026-10-01 12:00"));
    expect(await pemesananRealertTick(depsOf(setup), setup.clock.now())).toEqual({ realert: 0 });
    expect(setup.diumumkan).toEqual([]);
  });
});

/** The tick's own dependencies, as the composition root hands them over. */
function depsOf(setup: ReturnType<typeof pemesananOnTestDatabase>) {
  return {
    db,
    clock: setup.clock,
    lokasi: setup.lokasi,
    identity: setup.identity,
    notifikasi: setup.notifikasi,
  };
}

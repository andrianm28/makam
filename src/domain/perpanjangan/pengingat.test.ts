/**
 * The reminders at the end of a fixed-term Hak Pakai (spec, Notifications: "Hak Pakai end, to the Pemegang Hak and
 * the Admin Lokasi: 60, 30 and 7 days before, then weekly in the masa tenggang"; ticket 42). Fixture: a Hak Pakai
 * that ends on 2026-10-15, the Masa Tenggang running to 2027-01-15. Every send is within 08:00-20:00 WIB.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { akunDenganEmail, hakPakaiSiap, PEMEGANG_HAK, perpanjanganOnTestDatabase, type PerpanjanganSetup } from "../../../tests/support/perpanjangan";
import { pengingatHakPakaiTick, type PengingatDeps } from "./pengingat";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

function deps(setup: PerpanjanganSetup): PengingatDeps {
  return {
    db,
    inventory: setup.inventory,
    lokasi: setup.lokasi,
    identity: setup.identity,
    billing: setup.billing,
    notifikasi: setup.notifications,
    perpanjanganUrl: (hakPakaiId) => `https://makam.test/perpanjangan/${hakPakaiId}`,
  };
}

/** One run of the tick at `waktu`, then the family messages and staff alerts it queued are sent, as the worker would. */
async function tickPada(setup: PerpanjanganSetup, waktu: string) {
  setup.clock.set(wib(waktu));
  await setup.inventory.kedaluwarsaTick(setup.clock.now());
  await pengingatHakPakaiTick(deps(setup), setup.clock.now());
  await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
  await setup.notifications.kirimPeringatanStafTick();
}

const keHolder = (setup: PerpanjanganSetup) => setup.email.sent.filter((pesan) => pesan.to === PEMEGANG_HAK.email && pesan.subject.startsWith("Pengingat Hak Pakai"));

async function peringatanAdmin(setup: PerpanjanganSetup, fixture: Awaited<ReturnType<typeof hakPakaiSiap>>) {
  const hasil = await setup.notifications.staffAlerts(fixture.adminLokasi, { limit: 50 });
  if (!hasil.ok) throw new Error("staffAlerts refused");
  return hasil.latest;
}

describe("the Hak Pakai end reminders", () => {
  it("go to the Pemegang Hak by email and to the Admin Lokasi 60 days before the end date, once, with a Perpanjangan link", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);

    await tickPada(setup, "2026-08-15 10:00");
    expect(keHolder(setup)).toEqual([]);

    await tickPada(setup, "2026-08-16 10:00");
    expect(keHolder(setup)).toHaveLength(1);
    expect(keHolder(setup)[0]!.text).toContain(`https://makam.test/perpanjangan/${fixture.hakPakaiId}`);
    expect(await peringatanAdmin(setup, fixture)).toHaveLength(1);

    // The same day again, and the next: nothing more until the 30-day reminder.
    await tickPada(setup, "2026-08-16 15:00");
    await tickPada(setup, "2026-08-17 10:00");
    expect(keHolder(setup)).toHaveLength(1);
    expect(await peringatanAdmin(setup, fixture)).toHaveLength(1);

    await tickPada(setup, "2026-09-15 10:00");
    expect(keHolder(setup)).toHaveLength(2);
    expect(await peringatanAdmin(setup, fixture)).toHaveLength(2);
  });

  it("send only the latest due reminder when the tick first sees the Hak Pakai late", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    await hakPakaiSiap(setup);
    await tickPada(setup, "2026-10-09 10:00");
    expect(keHolder(setup)).toHaveLength(1);
    await tickPada(setup, "2026-10-10 10:00");
    expect(keHolder(setup)).toHaveLength(1);
  });

  it("wait for 08:00-20:00 WIB", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    await tickPada(setup, "2026-08-16 21:00");
    await tickPada(setup, "2026-08-16 07:00");
    expect(keHolder(setup)).toEqual([]);
    expect(await peringatanAdmin(setup, fixture)).toEqual([]);
    await tickPada(setup, "2026-08-16 08:00");
    expect(keHolder(setup)).toHaveLength(1);
  });

  it("repeat weekly in the Masa Tenggang once the Hak Pakai is Kedaluwarsa, until it ends", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    await tickPada(setup, "2026-10-08 10:00"); // the 7-day reminder
    const sebelum = keHolder(setup).length;

    await tickPada(setup, "2026-10-16 10:00");
    expect((await setup.inventory.hakPakaiUntukPerpanjangan(fixture.hakPakaiId))?.status).toBe("kedaluwarsa");
    expect(keHolder(setup)).toHaveLength(sebelum + 1);
    await tickPada(setup, "2026-10-22 10:00");
    expect(keHolder(setup)).toHaveLength(sebelum + 1);
    await tickPada(setup, "2026-10-23 10:00");
    expect(keHolder(setup)).toHaveLength(sebelum + 2);
    await tickPada(setup, "2026-10-30 10:00");
    expect(keHolder(setup)).toHaveLength(sebelum + 3);

    // The Masa Tenggang's last day is 2027-01-15: nothing after it.
    const sampaiAkhir = keHolder(setup).length;
    await tickPada(setup, "2027-01-20 10:00");
    await tickPada(setup, "2027-02-20 10:00");
    expect(keHolder(setup).length).toBeGreaterThanOrEqual(sampaiAkhir);
    const sesudah = keHolder(setup).length;
    await tickPada(setup, "2027-03-20 10:00");
    expect(keHolder(setup)).toHaveLength(sesudah);
  });

  it("stop once a Perpanjangan is ordered", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const dipesan = await setup.perpanjangan.ajukan({ hakPakaiId: fixture.hakPakaiId, terms: 1, pemohon: await akunDenganEmail(setup, PEMEGANG_HAK.email) });
    expect(dipesan.ok).toBe(true);

    await tickPada(setup, "2026-10-08 10:00");
    expect(keHolder(setup)).toEqual([]);
    expect(await peringatanAdmin(setup, fixture)).toEqual([]);
  });

  it("stop when the Hak Pakai is ended", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    await tickPada(setup, "2026-10-16 10:00");
    const sebelum = keHolder(setup).length;
    await setup.inventory.akhiriHakPakaiManual(fixture.adminLokasi, fixture.lokasiMitra.id, { hakPakaiId: fixture.hakPakaiId, alasan: "Tidak diperpanjang" });
    await tickPada(setup, "2026-10-23 10:00");
    expect(keHolder(setup)).toHaveLength(sebelum);
  });

  it("raise a Telepon Pemesan row in the Antrean Lokasi with the 7-day reminder, and not before", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const telepon = async () => (await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).lainnya.filter((baris) => baris.type === "pesan_lokasi_gagal");

    await tickPada(setup, "2026-09-15 10:00");
    expect(await telepon()).toEqual([]);
    await tickPada(setup, "2026-10-08 10:00");
    expect(await telepon()).toHaveLength(1);
    // One open row per Hak Pakai: the weekly reminder of the Masa Tenggang does not stack another.
    await tickPada(setup, "2026-10-16 10:00");
    expect(await telepon()).toHaveLength(1);
  });

  it("raise a Telepon Pemesan row for any reminder of a Hak Pakai with no recorded email, and send no email", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup, { pemegang: { name: "Hj. Rahmawati", phoneNumber: "081298765432" } });
    await tickPada(setup, "2026-08-16 10:00");
    const baris = (await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id)).lainnya.filter((satu) => satu.type === "pesan_lokasi_gagal");
    expect(baris).toHaveLength(1);
    expect(setup.email.sent.filter((pesan) => pesan.subject.startsWith("Pengingat Hak Pakai"))).toEqual([]);
    // The Admin Lokasi still hears of it.
    expect(await peringatanAdmin(setup, fixture)).toHaveLength(1);
  });

  it("lose no reminder when announcing it fails: the next tick sends it exactly once", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    setup.clock.set(wib("2026-08-16 10:00"));
    const gagal: PengingatDeps = { ...deps(setup), notifikasi: { pengingatHakPakaiBerakhir: async () => { throw new Error("antrean gagal"); } } };
    await expect(pengingatHakPakaiTick(gagal, setup.clock.now())).rejects.toThrow("antrean gagal");

    await tickPada(setup, "2026-08-16 11:00");
    await tickPada(setup, "2026-08-16 12:00");
    expect(keHolder(setup)).toHaveLength(1);
    expect(await peringatanAdmin(setup, fixture)).toHaveLength(1);
  });
});

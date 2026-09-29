/**
 * The burial half of the Saat Duka Pencairan trigger, driven the way it really
 * happens (ticket 90): the Admin Lokasi records the Pemakaman through the
 * Pemesanan module's Catat Pemakaman, and that step alone tells Payouts. No test
 * here writes the fact by hand; `./trigger.test.ts` does, to reach each half of
 * the pair on its own.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { bayarTagihan, konfirmasiPesanan, payoutsOnTestDatabase, pesananSaatDukaSiap } from "../../../tests/support/payouts";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const KOSONG = { items: 0, potongan: 0, dilewati: 0 };

describe("the Pemakaman the Admin Lokasi records is what makes a Saat Duka Pencairan due", () => {
  it("a Saat Duka Pencairan becomes due after the Tagihan is Lunas and the Admin Lokasi records the Pemakaman", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);
    await bayarTagihan(setup, konfirmasi.tagihanId);
    expect(await setup.payouts.tick()).toEqual(KOSONG);

    setup.clock.set(wib("2026-10-06 08:00"));
    const dicatat = await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-06" });
    expect(dicatat.ok).toBe(true);

    expect(await setup.payouts.tick()).toEqual({ items: 2, potongan: 0, dilewati: 0 });
    const rows = await setup.payouts.pencairanJatuhTempo();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(9_500_000);
    // Recorded on Tuesday 2026-10-06: two Hari Kerja later is Thursday 2026-10-08.
    expect(rows[0]!.jatuhTempoAt).toEqual(wib("2026-10-08 23:59"));
  });

  it("makes it due in the other order too: the Pemakaman recorded first, the money after", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);

    setup.clock.set(wib("2026-10-06 08:00"));
    expect((await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-06" })).ok).toBe(true);
    expect(await setup.payouts.tick()).toEqual(KOSONG);

    await bayarTagihan(setup, konfirmasi.tagihanId);
    expect(await setup.payouts.tick()).toEqual({ items: 2, potongan: 0, dilewati: 0 });
    expect(await setup.payouts.pencairanJatuhTempo()).toHaveLength(1);
  });

  it("a refused recording tells Payouts nothing, and recording again never pays twice", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);
    await bayarTagihan(setup, konfirmasi.tagihanId);
    setup.clock.set(wib("2026-10-06 08:00"));

    // Admin Platform does not record a burial through the Lokasi: refused, so no Pemakaman fact exists.
    const ditolak = await setup.pemesanan.catatPemakaman(fixture.admin, { nomor: fixture.nomor, tanggal: "2026-10-06" });
    expect(ditolak.ok).toBe(false);
    expect(await setup.payouts.tick()).toEqual(KOSONG);

    expect((await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-06" })).ok).toBe(true);
    const lagi = await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-06" });
    expect(lagi).toEqual({ ok: false, reason: "pemakaman_sudah_dicatat" });
    await setup.payouts.tick();
    await setup.payouts.tick();
    const rows = await setup.payouts.pencairanJatuhTempo();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(9_500_000);
  });
});

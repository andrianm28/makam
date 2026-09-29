/**
 * Akun Saya's Pesanan tab (ticket 27, spec story 100): every Pengurusan order
 * of that Akun, newest first, alongside its Pemesanan Makam orders.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { orderSaatDukaTpu, pengurusanOnTestDatabase, saatDukaTpuFixture } from "../../../tests/support/pengurusan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("Akun Saya's Pesanan tab: every Pengurusan order of that Akun, newest first", () => {
  it("lists both TPU orders newest first, and nobody else's", async () => {
    const setup = pengurusanOnTestDatabase(db);
    const fixture = await saatDukaTpuFixture(setup);
    const lain = await saatDukaTpuFixture(setup, { name: "TPU Menteng Pulo", email: "lain@contoh.id" });

    const pertama = await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
    if (!pertama.ok) throw new Error(`order refused: ${pertama.reason}`);
    setup.clock.set(wib("2026-10-01 09:10"));
    const kedua = await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
    if (!kedua.ok) throw new Error(`order refused: ${kedua.reason}`);
    const punyaLain = await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(lain));
    if (!punyaLain.ok) throw new Error(`order refused: ${punyaLain.reason}`);

    const tab = await setup.pengurusan.pesananSaya(fixture.pemesan);

    expect(tab.map((order) => order.nomor)).toEqual([kedua.pengurusan.nomor, pertama.pengurusan.nomor]);
    expect(await setup.pengurusan.pesananSaya(lain.pemesan)).toMatchObject([{ nomor: punyaLain.pengurusan.nomor }]);
  });

  it("is empty for an Akun with no orders", async () => {
    const setup = pengurusanOnTestDatabase(db);
    expect(await setup.pengurusan.pesananSaya({ accountId: "no-such-account" })).toEqual([]);
  });
});

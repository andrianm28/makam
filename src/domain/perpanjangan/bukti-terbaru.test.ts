/**
 * The Bukti Perpanjangan a Pemegang Hak finds in Akun Saya (owner rule C4, 2026-10-05; ticket 120): the proof of the
 * latest Perpanjangan Makam that was paid and applied to the Hak Pakai, read through the Perpanjangan module's own public
 * function on a real Postgres, so the Makam tab can link it the way it links the Bukti Pemesanan.
 *
 * Fixture (as `perpanjangan.test.ts`): a Hak Pakai of 5 years first buried on 2021-10-15, so it ends on 2026-10-15; the
 * fake Clock starts on 2026-10-01, inside the window that opened on 2026-07-15.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { akunDenganEmail, hakPakaiSiap, PEMEGANG_HAK, perpanjanganOnTestDatabase, type PerpanjanganSetup } from "../../../tests/support/perpanjangan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const QRIS = { kind: "penyedia_pembayaran", channel: "QRIS" } as const;

/** The holder orders one term of Perpanjangan; the test fails when it is refused. */
async function pesan(setup: PerpanjanganSetup, hakPakaiId: string) {
  const hasil = await setup.perpanjangan.ajukan({ hakPakaiId, terms: 1, pemohon: await akunDenganEmail(setup, PEMEGANG_HAK.email) });
  if (!hasil.ok) throw new Error(`ajukan refused: ${hasil.reason}`);
  return hasil.perpanjangan;
}

/** Anyone pays the Perpanjangan's Tagihan: the payment extends the Hak Pakai and issues the Bukti Perpanjangan. */
async function bayar(setup: PerpanjanganSetup, perpanjanganId: string) {
  const tercatat = await setup.perpanjangan.perpanjanganOf(perpanjanganId);
  const [tagihan] = await setup.billing.cariTagihan(tercatat!.nomorTagihan);
  const dibayar = await setup.billing.recordPayment(tagihan!.id, { method: QRIS, reference: null });
  if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
}

describe("the Bukti Perpanjangan of a Hak Pakai, for its Pemegang Hak's Makam tab", () => {
  it("is none for a Hak Pakai that was never extended, and for one that does not exist", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);

    expect(await setup.perpanjangan.buktiPerpanjanganTerbaru(fixture.hakPakaiId)).toBeNull();
    expect(await setup.perpanjangan.buktiPerpanjanganTerbaru("hak-pakai-yang-tidak-ada")).toBeNull();
  });

  it("is none while the Perpanjangan is ordered but not paid, since the Bukti Perpanjangan is issued on payment", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);

    await pesan(setup, fixture.hakPakaiId);

    expect(await setup.perpanjangan.buktiPerpanjanganTerbaru(fixture.hakPakaiId)).toBeNull();
  });

  it("is the Bukti Perpanjangan the payment issued: its BPP number, the unguessable link of its page, and the new end date it proves", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const dipesan = await pesan(setup, fixture.hakPakaiId);

    await bayar(setup, dipesan.id);

    const bukti = await setup.perpanjangan.buktiPerpanjanganTerbaru(fixture.hakPakaiId);
    expect(bukti).toMatchObject({ nomor: "BPP/2026/000001" });
    expect(bukti!.link).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    // The same document the family was emailed: old and new end dates of that extension.
    expect(await setup.billing.buktiPerpanjanganById(bukti!.id)).toMatchObject({ link: bukti!.link, endDateLama: "2026-10-15", endDateBaru: "2031-10-15" });
  });

  it("is the latest one once the Hak Pakai was extended again, never the first", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    await bayar(setup, (await pesan(setup, fixture.hakPakaiId)).id);
    const pertama = await setup.perpanjangan.buktiPerpanjanganTerbaru(fixture.hakPakaiId);

    // Five years on, inside the window of the new end date (2031-10-15).
    setup.clock.set(wib("2031-08-01 10:00"));
    await bayar(setup, (await pesan(setup, fixture.hakPakaiId)).id);

    const terbaru = await setup.perpanjangan.buktiPerpanjanganTerbaru(fixture.hakPakaiId);
    // The BPP numbers run per year: the first of 2031.
    expect(terbaru).toMatchObject({ nomor: "BPP/2031/000001" });
    expect(terbaru!.id).not.toBe(pertama!.id);
    expect(await setup.billing.buktiPerpanjanganById(terbaru!.id)).toMatchObject({ endDateLama: "2031-10-15", endDateBaru: "2036-10-15" });
  });
});

/**
 * Akun Saya's Pesanan tab (ticket 27, spec story 100): every Pemesanan Makam of
 * that Akun, newest first — and its Makam tab's documents (story 101), the
 * Bukti Pemesanan issued for the order that granted a given Hak Pakai.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, siapkanOperatorPemesanan, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

async function konfirmasi(setup: PemesananSetup, fixture: Awaited<ReturnType<typeof saatDukaFixture>>, nomor: string) {
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter(
    (cell) => cell.kind === "petak" && !cell.status.startsWith("terisi"),
  );
  const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
    nomor,
    petakId: cells[0]!.id,
    pemakamanAt: "2026-10-02T10:00",
  });
  if (!hasil.ok) throw new Error(`confirmation refused: ${hasil.reason}`);
}

async function bayar(setup: PemesananSetup, tagihanId: string) {
  const tagihan = await setup.billing.tagihan(tagihanId);
  if (!tagihan) throw new Error("no Tagihan");
  const bayar = await setup.billing.bayar(tagihan.link);
  if (!bayar.ok) return;
  const payment = setup.payments.created.at(-1);
  if (!payment) throw new Error("no provider payment");
  const hasil = await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "paid"));
  if (!hasil.ok || hasil.outcome !== "lunas") throw new Error(`webhook did not settle: ${JSON.stringify(hasil)}`);
}

describe("Akun Saya's Pesanan tab: every order of that Akun, newest first", () => {
  it("lists both orders newest first, and nobody else's", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup, { petak: { rows: 2, cols: 2 } });
    const lain = await saatDukaFixture(setup, { name: "Makam lain", email: "lain@contoh.id" });

    const pertama = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
    if (!pertama.ok) throw new Error(`order refused: ${pertama.reason}`);
    setup.clock.set(wib("2026-10-01 10:00"));
    const kedua = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
    if (!kedua.ok) throw new Error(`order refused: ${kedua.reason}`);
    // Another Akun's own order, never on this list.
    const punyaLain = await setup.pemesanan.placeSaatDuka(orderSaatDuka(lain));
    if (!punyaLain.ok) throw new Error(`order refused: ${punyaLain.reason}`);

    const tab = await setup.pemesanan.pesananSaya(fixture.pemesan);

    expect(tab.map((order) => order.nomor)).toEqual([kedua.pemesanan.nomor, pertama.pemesanan.nomor]);
    expect(await setup.pemesanan.pesananSaya(lain.pemesan)).toMatchObject([{ nomor: punyaLain.pemesanan.nomor }]);
  });

  it("is empty for an Akun with no orders — Masuk works cold with nothing recorded yet (ticket 08)", async () => {
    const setup = pemesananOnTestDatabase(db);
    expect(await setup.pemesanan.pesananSaya({ accountId: "no-such-account" })).toEqual([]);
  });
});

describe("Akun Saya's Makam tab: the Bukti Pemesanan of the Hak Pakai's own order", () => {
  it("is found by the Hak Pakai it granted, once the order is paid", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    await siapkanOperatorPemesanan(setup);
    const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    await konfirmasi(setup, fixture, placed.pemesanan.nomor);
    setup.clock.set(wib("2026-10-02 11:00"));
    await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: placed.pemesanan.nomor, tanggal: "2026-10-02" });
    const order = await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan);
    if (!order?.tagihanId) throw new Error("no Tagihan on the confirmed order");
    await bayar(setup, order.tagihanId);

    const selesai = await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan);
    expect(selesai?.buktiPemesanan).not.toBeNull();

    const tab = await setup.inventory.makamKeluargaSaya({ email: fixture.pemesan.email! });
    expect(tab).toHaveLength(1);

    const dokumen = await setup.pemesanan.buktiUntukHakPakai(tab[0]!.hakPakaiId);
    expect(dokumen).toEqual([expect.objectContaining({ nomor: selesai!.buktiPemesanan!.nomor, link: selesai!.buktiPemesanan!.link })]);
  });

  it("is empty for a Hak Pakai id that names nothing, or that names one with no order yet", async () => {
    const setup = pemesananOnTestDatabase(db);
    expect(await setup.pemesanan.buktiUntukHakPakai("no-such-hak-pakai")).toEqual([]);
  });
});

/**
 * The Bukti Pemesanan and the order's last step (spec, Pemesanan > Saat Duka:
 * "Selesai = Tagihan Lunas + Bukti Pemesanan issued", and Billing > Documents:
 * "Bukti Pemesanan (right only, no amounts, in the Lokasi Mitra's name)"; ticket
 * 25's AC 4).
 *
 * The order of the two matters and the test keeps them apart: a burial recorded
 * first and a payment afterwards issues the Bukti too, and so does a payment
 * first and a burial afterwards (the family's money does not wait for the
 * ground). The Bukti is numbered once and never twice.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A confirmed order, its pay-after Tagihan and the Tagihan as issued. */
async function pesananDikonfirmasi(setup: PemesananSetup) {
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
  const order = await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan);
  if (!order?.tagihanId) throw new Error("no Tagihan on the confirmed order");
  return { ...fixture, nomor: placed.pemesanan.nomor, tagihanId: order.tagihanId };
}

/** Pays that order's Tagihan the way a family does: Bayar, then the provider's signed webhook. */
async function bayar(setup: PemesananSetup, tagihanId: string) {
  const tagihan = await setup.billing.tagihan(tagihanId);
  if (!tagihan) throw new Error("no Tagihan");
  const bayar = await setup.billing.bayar(tagihan.link);
  // A Tagihan already Lunas has nothing to pay: that is the "paid twice" case.
  if (!bayar.ok) return;
  const payment = setup.payments.created.at(-1);
  if (!payment) throw new Error("no provider payment");
  const hasil = await setup.billing.receivePaymentWebhook(setup.payments.webhookFor(payment.providerPaymentId, "paid"));
  if (!hasil.ok || hasil.outcome !== "lunas") throw new Error(`webhook did not settle: ${JSON.stringify(hasil)}`);
}

describe("the Bukti Pemesanan of a paid burial", () => {
  it("is issued on Lunas in the Lokasi Mitra's name, proves the right, and makes the order Selesai", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    setup.clock.set(wib("2026-10-02 11:00"));
    await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-02" });

    // Paid before the burial was recorded: the order is Dimakamkan and the money is in.
    expect((await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan))?.status).toBe("dimakamkan");
    await bayar(setup, fixture.tagihanId);

    const order = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    expect(order).toMatchObject({ status: "selesai", buktiPemesanan: { nomor: "BPM/2026/000001" } });

    // The document itself: the right in the Lokasi Mitra's name, and no money on it.
    const bukti = await setup.billing.buktiPemesananById(order!.buktiPemesanan!.id);
    expect(bukti).toMatchObject({
      nomor: "BPM/2026/000001",
      nomorPemesanan: fixture.nomor,
      lokasiName: "Makam Wakaf Al-Ikhlas",
      petakNomor: "A-01",
      pemegangHakName: "Budi Santoso",
      masa: { mulai: "2026-10-02", selesai: "2031-10-02" },
      header: { legalName: expect.stringContaining("Jaya Korpora Prima") },
    });
    expect(Object.keys(bukti ?? {})).not.toContain("total");
    // Served from an unguessable link, like every document, and never indexed.
    expect(bukti?.link).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await setup.billing.documentByLink(bukti!.link)).toMatchObject({ type: "bukti_pemesanan", bukti: { nomor: "BPM/2026/000001" } });
  });

  it("is issued when the payment comes after the burial too, and never a second time", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    setup.clock.set(wib("2026-10-02 11:00"));
    await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-02" });

    await bayar(setup, fixture.tagihanId);
    const setelahBayarPertama = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    expect(setelahBayarPertama).toMatchObject({ status: "selesai", buktiPemesanan: { nomor: "BPM/2026/000001" } });

    // A second payment of the same Tagihan (a redelivered webhook) issues no second Bukti.
    await bayar(setup, fixture.tagihanId);
    const kedua = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    expect(kedua?.buktiPemesanan).toEqual(setelahBayarPertama?.buktiPemesanan);
    expect((await setup.billing.allBuktiPemesanan()).map((satu) => satu.nomor)).toEqual(["BPM/2026/000001"]);
  });

  it("two orders get two different numbers, and an order paid but not yet buried gets none", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    const kedua = await setup.pemesanan.placeSaatDuka({
      ...orderSaatDuka(fixture),
      pemesanName: "Dewi Lestari",
      rencanaPemakamanAt: "2026-10-02T10:00",
    });
    if (!kedua.ok) throw new Error(`order refused: ${kedua.reason}`);

    // The first order is buried and then paid: the payment's effect issues its Bukti.
    setup.clock.set(wib("2026-10-02 11:00"));
    await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-02" });
    await bayar(setup, fixture.tagihanId);

    // The second order is confirmed and paid but not yet buried: no Bukti, no Selesai.
    const belum = await setup.inventory.tersediaUntukJenisMakam(fixture.lokasiMitra.id, fixture.jenisMakam.id);
    const konfirmasi = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
      nomor: kedua.pemesanan.nomor,
      petakId: belum[0]!.petakId,
      pemakamanAt: "2026-10-02T10:00",
    });
    if (!konfirmasi.ok) throw new Error(`confirmation refused: ${konfirmasi.reason}`);
    const tagihanKedua = await setup.pemesanan.orderOf(kedua.pemesanan.nomor, fixture.pemesan);
    if (!tagihanKedua?.tagihanId) throw new Error("no Tagihan on the second order");
    await bayar(setup, tagihanKedua.tagihanId);
    expect(await setup.pemesanan.orderOf(kedua.pemesanan.nomor, fixture.pemesan)).toMatchObject({
      status: "dikonfirmasi",
      buktiPemesanan: null,
    });

    // Buried second: the recording issues the Bukti and the order goes Dimakamkan → Selesai in one step.
    setup.clock.set(wib("2026-10-02 12:00"));
    const dicatat = await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: kedua.pemesanan.nomor, tanggal: "2026-10-02" });
    expect(dicatat).toMatchObject({ ok: true, pesanan: { status: "selesai" }, buktiPemesananNomor: "BPM/2026/000002" });
    expect((await setup.billing.allBuktiPemesanan()).map((satu) => satu.nomor)).toEqual(["BPM/2026/000001", "BPM/2026/000002"]);
  });

  it("is append-only: the database refuses to change or delete an issued Bukti Pemesanan", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    setup.clock.set(wib("2026-10-02 11:00"));
    await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-02" });
    await bayar(setup, fixture.tagihanId);
    const [terbit] = await setup.billing.allBuktiPemesanan();
    if (!terbit) throw new Error("no Bukti Pemesanan issued");

    // A Bukti Pemesanan is a family's proof of a grave: nothing may quietly change
    // it afterwards, exactly as for a Bukti Pembayaran and a Tagihan's lines.
    await expect(db.execute(sql`update bukti_pemesanan set pemegang_hak_name = 'Orang Lain' where id = ${terbit.id}`)).rejects.toThrow();
    await expect(db.execute(sql`delete from bukti_pemesanan where id = ${terbit.id}`)).rejects.toThrow();
    expect(await setup.billing.allBuktiPemesanan()).toEqual([terbit]);
  });

  it("states the Hak Pakai's own term: a fixed-term Bukti names both of its dates, so a null end date means a Selamanya Jenis Makam", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDikonfirmasi(setup);
    setup.clock.set(wib("2026-10-02 11:00"));
    await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-02" });
    await bayar(setup, fixture.tagihanId);

    // The fixture's Jenis Makam has a 5-year term, so the document carries its end
    // date: a `selesai` of null on a Bukti means a perpetual Hak Pakai and nothing else.
    const [terbit] = await setup.billing.allBuktiPemesanan();
    expect(terbit?.masa).toEqual({ mulai: "2026-10-02", selesai: "2031-10-02" });

    // The other half of that sentence — a Hak Pakai whose term cannot be read issues
    // no Bukti at all — is a guard in `terbitkanBukti`, and it is unreachable through
    // this module's public functions: `tenureStartAt` is only ever set (never
    // cleared) and a Hak Pakai is never deleted, so a Dimakamkan order's Hak Pakai
    // always has a term to print. It is deliberately not tested here, because a test
    // that manufactured the state would assert on a fiction rather than on a
    // reachable outcome. The wording it protects is in `src/lib/billing-labels.test.ts`.
  });
});

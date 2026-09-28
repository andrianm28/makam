/**
 * Reversing "Dibayar langsung ke Lokasi Mitra" (spec, Billing > Payment;
 * ticket 30's AC 2). See `pembayaran-langsung.ts` for the two states it reverses.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { potongan as potonganTable } from "./schema";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  bayarTagihan,
  konfirmasiPesanan,
  payoutsOnTestDatabase,
  pesananSaatDukaSiap,
  type PayoutsModul,
} from "../../../tests/support/payouts";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A Saat Duka order confirmed and paid "Dibayar langsung ke Lokasi Mitra", not yet buried or ticked. */
async function orderPaidDirectly(setup: PayoutsModul) {
  const fixture = await pesananSaatDukaSiap(setup);
  const konfirmasi = await konfirmasiPesanan(setup, fixture);
  await bayarTagihan(setup, konfirmasi.tagihanId, { kind: "langsung_ke_lokasi", lokasiName: fixture.lokasiMitra.name });
  return { ...fixture, ...konfirmasi };
}

async function buried(setup: PayoutsModul, nomor: string) {
  await db.transaction((tx) => setup.payouts.pemakamanTercatat(tx, { nomorPemesanan: nomor, pemakamanAt: wib("2026-10-02 10:00") }));
}

describe("batalkanPembayaranLangsung", () => {
  it("before the tick has run: nothing to reverse on the Potongan side, and the next tick creates the ordinary tariff items instead of a Potongan", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderPaidDirectly(setup);
    await buried(setup, order.nomor);

    const reversed = await setup.payouts.batalkanPembayaranLangsung(order.admin, { tagihanId: order.tagihanId });
    expect(reversed).toEqual({ ok: true });

    expect(await setup.payouts.tick()).toEqual({ items: 2, potongan: 0, dilewati: 0 });
    expect(await setup.payouts.pencairanJatuhTempo()).toHaveLength(1);
    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toEqual([]);
    expect(await setup.audit.entriesAbout({ kind: "pencairan_pembayaran", id: order.tagihanId })).toMatchObject([
      { action: "tagihan.batalkan_pembayaran_langsung", actor: { role: "admin_platform" }, lokasiId: null },
    ]);
  });

  it("after the tick raised the platform-fee Potongan (still berjalan): the Potongan is cancelled and the next tick creates the tariff items instead", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderPaidDirectly(setup);
    await buried(setup, order.nomor);
    await setup.payouts.tick();
    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toMatchObject([{ status: "berjalan" }]);

    const reversed = await setup.payouts.batalkanPembayaranLangsung(order.admin, { tagihanId: order.tagihanId });
    expect(reversed).toEqual({ ok: true });

    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toMatchObject([{ status: "dibatalkan" }]);
    expect(await setup.payouts.tick()).toEqual({ items: 2, potongan: 0, dilewati: 0 });
    expect(await setup.payouts.pencairanJatuhTempo()).toHaveLength(1);
  });

  it("a Potongan a Bukti Pencairan already took (or recorded paid offline) is refused: that money already moved", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderPaidDirectly(setup);
    await buried(setup, order.nomor);
    await setup.payouts.tick();
    const [debt] = await setup.payouts.potonganOfLokasi(order.lokasiMitra.id);
    if (!debt) throw new Error("no Potongan raised");
    // Stands in for a Bukti Pencairan having netted it, without the extra order
    // that would need: `terbitkanBuktiPencairan` only ever moves a Potongan to
    // exactly this state, and the guard is what is under test here.
    await db.update(potonganTable).set({ status: "terpotong" }).where(eq(potonganTable.id, debt.id));

    expect(await setup.payouts.batalkanPembayaranLangsung(order.admin, { tagihanId: order.tagihanId })).toEqual({
      ok: false,
      reason: "sudah_dipotong",
    });
  });

  it("cannot be reversed twice", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderPaidDirectly(setup);
    await buried(setup, order.nomor);
    await setup.payouts.batalkanPembayaranLangsung(order.admin, { tagihanId: order.tagihanId });

    expect(await setup.payouts.batalkanPembayaranLangsung(order.admin, { tagihanId: order.tagihanId })).toEqual({
      ok: false,
      reason: "sudah_dibatalkan",
    });
  });

  it("refused for a Tagihan that was not paid 'Dibayar langsung ke Lokasi Mitra'", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);
    await bayarTagihan(setup, konfirmasi.tagihanId);

    expect(await setup.payouts.batalkanPembayaranLangsung(fixture.admin, { tagihanId: konfirmasi.tagihanId })).toEqual({
      ok: false,
      reason: "bukan_dibayar_langsung",
    });
  });

  it("refused for a Tagihan not yet paid at all", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);

    expect(await setup.payouts.batalkanPembayaranLangsung(fixture.admin, { tagihanId: konfirmasi.tagihanId })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
  });

  it("only Admin Platform may reverse it: the Lokasi's own Admin Lokasi may not", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderPaidDirectly(setup);
    await buried(setup, order.nomor);

    expect(await setup.payouts.batalkanPembayaranLangsung(order.adminLokasi, { tagihanId: order.tagihanId })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
  });
});

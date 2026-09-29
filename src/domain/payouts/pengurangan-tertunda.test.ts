/**
 * A refund netted from a Lokasi Mitra before its Pencairan items exist (spec, Billing > Payouts and Refunds; a Pembatalan
 * of a Pemesanan Terencana inside its Masa Pembatalan; ticket 38): the items are lowered as they are made, and money the
 * items cannot cover is a Potongan, never a rupiah lost.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { bayarTagihan, konfirmasiPesanan, payoutsOnTestDatabase, pesananSaatDukaSiap } from "../../../tests/support/payouts";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("a refund netted before the Pencairan items exist", () => {
  it("lowers the items when they are made, and makes a Potongan of what a Harga Khusus share left them unable to cover", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);
    // The Lokasi Mitra bears Rp 3.000.000 of a Harga Khusus, so its items come to Rp 6.500.000 instead of Rp 9.500.000.
    const khusus = await setup.billing.tetapkanHargaKhusus(fixture.admin, {
      tagihanId: konfirmasi.tagihanId,
      amount: 3_000_000,
      alasan: "Keluarga kurang mampu, disetujui manajer",
      porsiMitra: 3_000_000,
      catatanPorsiMitra: "Lokasi Mitra menanggung Rp 3.000.000",
    });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
    await bayarTagihan(setup, khusus.tagihan.id);
    // The order is paid and its Masa Pembatalan has ended, but the tick has not made the items yet.
    await db.transaction((tx) => setup.payouts.masaPembatalanDimulai(tx, { nomorPemesanan: fixture.nomor, berakhirPada: wib("2026-10-01 09:30") }));

    // A refund of Rp 9.000.000 is netted now: no item exists to lower, so it waits for the items.
    const ditunda = await db.transaction((tx) =>
      setup.payouts.kurangiPencairanSebisanya(tx, {
        nomorPemesanan: fixture.nomor,
        lokasiId: fixture.lokasiMitra.id,
        amount: 9_000_000,
        catatan: "Pengembalian dana uji",
        oleh: fixture.admin.accountId,
      }),
    );
    expect(ditunda).toEqual({ ok: true, dikurangi: 0, ditunda: 9_000_000, sisa: 0 });
    setup.clock.set(wib("2026-10-01 10:00"));
    await setup.payouts.tick();

    // Every item is emptied (Rp 6.500.000), and the Rp 2.500.000 the family got back beyond that is claimed back.
    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([]);
    expect(await setup.payouts.potonganOfLokasi(fixture.lokasiMitra.id)).toEqual([
      expect.objectContaining({ amount: 2_500_000, alasanKind: "pengembalian_dana", status: "berjalan" }),
    ]);
  });
});

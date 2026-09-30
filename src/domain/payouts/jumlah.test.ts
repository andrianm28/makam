/**
 * What a Pencairan is worth (spec, Billing > Payouts: "Amount: the partner's
 * tariff, or the Mitra Jasa rate, unless Admin Platform overrides it after a
 * Keluhan (with a note). A Harga Khusus is borne by the Operator ... unless a
 * partner share is recorded ... 'Dibayar langsung' means no tariff Pencairan and
 * a platform-fee Potongan"; ticket 32's AC 1, 2, 3).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Rupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  bayarTagihan,
  konfirmasiPesanan,
  payoutsOnTestDatabase,
  pesananSaatDukaSiap,
  type PayoutsModul,
} from "../../../tests/support/payouts";
import { orderSaatDuka } from "../../../tests/support/pemesanan";
import { setTagihanStatusForTest } from "../../../tests/support/billing";

/** Whole rupiah, as the Tagihan lines carry it. */
const rp = (amount: number) => amount as Rupiah;

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The order paid, buried and run through the trigger, with its due items. */
async function orderDue(setup: PayoutsModul, options: Parameters<typeof pesananSaatDukaSiap>[1] = {}) {
  const fixture = await pesananSaatDukaSiap(setup, options);
  const konfirmasi = await konfirmasiPesanan(setup, fixture);
  await bayarTagihan(setup, konfirmasi.tagihanId);
  await db.transaction((tx) => setup.payouts.pemakamanTercatat(tx, { nomorPemesanan: fixture.nomor, pemakamanAt: wib("2026-10-02 10:00") }));
  await setup.payouts.tick();
  return { ...fixture, ...konfirmasi };
}

describe("what a Pencairan item is worth", () => {
  it("is the issued Tagihan's own line: a Harga Khusus reduces the Operator's share, not the Lokasi Mitra's", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);
    // The Harga Khusus is its own negative line on the Tagihan the family is
    // sent (whichever module issues it does so through Billing's own lines).
    const issued = await setup.billing.tagihan(konfirmasi.tagihanId);
    if (!issued) throw new Error("no Tagihan");
    const diganti = await setup.billing.reissueTagihan(konfirmasi.tagihanId, {
      lines: [
        ...issued.lines.map((line) => ({ ...line, amount: line.amount as Rupiah })),
        { kind: "penyesuaian_harga_khusus" as const, amount: rp(1_000_000) },
      ],
    });
    if (!diganti.ok) throw new Error(`reissue refused: ${diganti.reason}`);
    await bayarTagihan(setup, diganti.tagihan.id);
    await db.transaction((tx) => setup.payouts.pemakamanTercatat(tx, { nomorPemesanan: fixture.nomor, pemakamanAt: wib("2026-10-02 10:00") }));
    await setup.payouts.tick();

    // Rp 7.500.000 + Rp 2.000.000 as issued: the Rp 1.000.000 Price Reduction is
    // the Operator's own loss, and the Lokasi Mitra is paid its full tariff.
    const [row] = await setup.payouts.pencairanJatuhTempo();
    expect(row?.amount).toBe(9_500_000);
    const [run] = await setup.payouts.jalankanPencairan(fixture.admin);
    expect(run?.items.map((item) => [item.kind, item.amount])).toEqual([
      ["harga_hak_pakai", 7_500_000],
      ["biaya_pemakaman", 2_000_000],
    ]);
  });

  it("is lowered by the share a Lokasi Mitra agreed to bear on the order, oldest item first", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);

    const dikurangi = await db.transaction((tx) =>
      setup.payouts.kurangiPencairanPesanan(tx, {
        nomorPemesanan: order.nomor,
        lokasiId: order.lokasiMitra.id,
        amount: 3_000_000,
        alasan: "porsi_pemegang_saham",
        catatan: "Lokasi Mitra Bearing Rp 3.000.000 dari Harga Khusus",
        oleh: order.admin.accountId,
      }),
    );

    expect(dikurangi).toMatchObject({ ok: true, total: 3_000_000 });
    expect((await setup.payouts.pencairanJatuhTempo())[0]?.amount).toBe(6_500_000);
    const [run] = await setup.payouts.jalankanPencairan(order.admin);
    expect(run?.items.map((item) => [item.amount, item.catatanPenyesuaian])).toEqual([
      [4_500_000, "Lokasi Mitra Bearing Rp 3.000.000 dari Harga Khusus"],
      [2_000_000, null],
    ]);
  });

  it("items due at the same moment come back in the order's own line order (ticket 94)", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    // Every reduction rewrites the Hak Pakai row, so the database no longer
    // holds the two items in the order they were made: only a tiebreaker on
    // the ordering keeps the Hak Pakai first when both are due at once.
    for (let i = 0; i < 3; i += 1) {
      const dikurangi = await db.transaction((tx) =>
        setup.payouts.kurangiPencairanPesanan(tx, {
          nomorPemesanan: order.nomor,
          lokasiId: order.lokasiMitra.id,
          amount: 1_000,
          alasan: "porsi_pemegang_saham",
          catatan: `Bearing ke-${i + 1}`,
          oleh: order.admin.accountId,
        }),
      );
      expect(dikurangi).toMatchObject({ ok: true });
      const [run] = await setup.payouts.jalankanPencairan(order.admin);
      expect(run?.items.map((item) => item.kind)).toEqual(["harga_hak_pakai", "biaya_pemakaman"]);
    }
  });

  it("two orders due at the same moment come back one order after the other, each in its own line order (ticket 94)", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const kedua = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
    if (!kedua.ok) throw new Error(`second order refused: ${kedua.reason}`);
    const pesanan = [
      { nomor: fixture.nomor, petakId: fixture.cells[0]!.id },
      { nomor: kedua.pemesanan.nomor, petakId: fixture.cells[1]!.id },
    ];
    // The later order is paid and made due first, so the database holds its items first:
    // only the ordering, not the order the rows were written in, puts the first order ahead.
    for (const satu of [...pesanan].reverse()) {
      const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, { nomor: satu.nomor, petakId: satu.petakId, pemakamanAt: "2026-10-02T10:00" });
      if (!hasil.ok) throw new Error(`confirmation refused: ${hasil.reason}`);
      const order = await setup.pemesanan.orderUntukStaf(fixture.admin, satu.nomor);
      await bayarTagihan(setup, order!.tagihanId!);
      await db.transaction((tx) => setup.payouts.pemakamanTercatat(tx, { nomorPemesanan: satu.nomor, pemakamanAt: wib("2026-10-02 10:00") }));
    }
    await setup.payouts.tick();

    const [run] = await setup.payouts.jalankanPencairan(fixture.admin);
    expect(run?.items.map((item) => [item.nomorPemesanan, item.kind])).toEqual(
      [...pesanan.map((satu) => satu.nomor)].sort().flatMap((nomor) => [
        [nomor, "harga_hak_pakai"],
        [nomor, "biaya_pemakaman"],
      ]),
    );
  });

  it("is lowered by a Harga Khusus partner share entered before the Tagihan was paid: applied when the item is created, oldest item first (ticket 30)", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);

    // No Pencairan item exists yet (the Tagihan is still unpaid): the share is
    // only recorded on the reissued Tagihan here, and `trigger.ts` is what
    // applies it once the item is actually created below.
    const khusus = await setup.billing.tetapkanHargaKhusus(fixture.admin, {
      tagihanId: konfirmasi.tagihanId,
      amount: 3_000_000,
      alasan: "Keluarga kurang mampu, disetujui manajer",
      porsiMitra: 3_000_000,
      catatanPorsiMitra: "Lokasi Mitra Bearing Rp 3.000.000 dari Harga Khusus",
    });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);

    await bayarTagihan(setup, khusus.tagihan.id);
    await db.transaction((tx) => setup.payouts.pemakamanTercatat(tx, { nomorPemesanan: fixture.nomor, pemakamanAt: wib("2026-10-02 10:00") }));
    await setup.payouts.tick();

    const [row] = await setup.payouts.pencairanJatuhTempo();
    expect(row?.amount).toBe(6_500_000);
    const [run] = await setup.payouts.jalankanPencairan(fixture.admin);
    expect(run?.items.map((item) => [item.kind, item.amount, item.catatanPenyesuaian])).toEqual([
      ["harga_hak_pakai", 4_500_000, "Lokasi Mitra Bearing Rp 3.000.000 dari Harga Khusus"],
      ["biaya_pemakaman", 2_000_000, null],
    ]);
  });

  it("a Harga Khusus partner share that would empty an item entirely creates that item already cancelled, never at Rp 0 (ticket 30)", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);
    // The Petak's own tariff is Rp 7.500.000; a Rp 9.000.000 partner share
    // empties it completely and still has Rp 1.500.000 left for the next line.
    const khusus = await setup.billing.tetapkanHargaKhusus(fixture.admin, {
      tagihanId: konfirmasi.tagihanId,
      amount: 9_000_000,
      alasan: "Keringanan besar",
      porsiMitra: 9_000_000,
      catatanPorsiMitra: "Lokasi Mitra menanggung penuh",
    });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);

    await bayarTagihan(setup, khusus.tagihan.id);
    await db.transaction((tx) => setup.payouts.pemakamanTercatat(tx, { nomorPemesanan: fixture.nomor, pemakamanAt: wib("2026-10-02 10:00") }));
    await setup.payouts.tick();

    const [row] = await setup.payouts.pencairanJatuhTempo();
    expect(row?.amount).toBe(500_000);
    const [run] = await setup.payouts.jalankanPencairan(fixture.admin);
    expect(run?.items.map((item) => [item.kind, item.amount])).toEqual([["biaya_pemakaman", 500_000]]);
  });

  it("is lowered by what Admin Platform overrides after a Keluhan, with the note that decision needs", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const [item] = (await setup.payouts.jalankanPencairan(order.admin))[0]!.items;

    const diturunkan = await setup.payouts.turunkanJumlahPencairan(order.admin, {
      itemId: item.id,
      amount: 3_750_000,
      catatan: "Setengah, karena kerja burialnya diulang",
    });

    expect(diturunkan).toMatchObject({ ok: true, item: { amount: 3_750_000, amountAwal: 7_500_000, alasanPenyesuaian: "setelah_keluhan" } });
    expect((await setup.payouts.pencairanJatuhTempo())[0]?.amount).toBe(5_750_000);
    // The decision is a staff write, so it is in the Audit Log with its note.
    const entries = await setup.audit.entriesAbout({ kind: "pencairan_item", id: item.id });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: "pencairan.override_jumlah", reason: "Setengah, karena kerja burialnya diulang" });
  });

  it("is nothing at all when the family paid the Lokasi Mitra directly: no tariff Pencairan, a platform-fee Potongan", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);
    await bayarTagihan(setup, konfirmasi.tagihanId, { kind: "langsung_ke_lokasi", lokasiName: "Makam Wakaf Al-Ikhlas" });
    await db.transaction((tx) => setup.payouts.pemakamanTercatat(tx, { nomorPemesanan: fixture.nomor, pemakamanAt: wib("2026-10-02 10:00") }));

    expect(await setup.payouts.tick()).toEqual({ items: 0, potongan: 1, dilewati: 0 });
    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([]);
    // The Operator's own Rp 150.000 fee is now money the Lokasi Mitra owes, and it
    // rides along in the next transfer rather than being paid out to anyone.
    const potongan = await setup.payouts.potonganOfLokasi(fixture.lokasiMitra.id);
    expect(potongan).toHaveLength(1);
    expect(potongan[0]).toMatchObject({ amount: 150_000, sisa: 150_000, alasanKind: "biaya_layanan_platform", status: "berjalan" });
    expect(potongan[0]?.alasan).toContain(fixture.nomor);
    // And the tick never charges it twice, however often the worker repeats itself.
    expect(await setup.payouts.tick()).toEqual({ items: 0, potongan: 0, dilewati: 0 });
    expect(await setup.payouts.potonganOfLokasi(fixture.lokasiMitra.id)).toHaveLength(1);
  });

  it("a family refunded in full is not paid for: no item is ever made, and an item already due is cancelled", async () => {
    const setup = payoutsOnTestDatabase(db);
    // Nothing owed at all: a Tagihan the Operator gave back never becomes one.
    const fixtureRefund = await pesananSaatDukaSiap(setup);
    const konfirmasiRefund = await konfirmasiPesanan(setup, fixtureRefund);
    await setTagihanStatusForTest(db, konfirmasiRefund.tagihanId, "dikembalikan_penuh");
    await db.transaction((tx) =>
      setup.payouts.pemakamanTercatat(tx, { nomorPemesanan: fixtureRefund.nomor, pemakamanAt: wib("2026-10-02 10:00") }),
    );
    expect(await setup.payouts.tick()).toEqual({ items: 0, potongan: 0, dilewati: 0 });
    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([]);

    // And when the refund comes after the items were already due, the Refunds
    // module (ticket 31) cancels them in its own transaction: no transfer, and no
    // Potongan to claw back what was never paid.
    const order = await orderDue(setup, { email: "pemesan.kedua@contoh.id" });
    const dibatalkan = await db.transaction((tx) => setup.payouts.batalkanPencairanTagihan(tx, { tagihanId: order.tagihanId }));
    expect(dibatalkan).toMatchObject({ ok: true });
    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([]);
    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toEqual([]);
  });

  it("a partner share larger than the order is owed is refused, so no item is ever left at Rp 0", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);

    const ditolak = await db.transaction((tx) =>
      setup.payouts.kurangiPencairanPesanan(tx, {
        nomorPemesanan: order.nomor,
        lokasiId: order.lokasiMitra.id,
        amount: 20_000_000,
        alasan: "porsi_pemegang_saham",
        catatan: "Terlalu besar",
        oleh: order.admin.accountId,
      }),
    );

    expect(ditolak).toEqual({ ok: false, reason: "melebihi_pencairan_pesanan" });
    expect((await setup.payouts.pencairanJatuhTempo())[0]?.amount).toBe(9_500_000);
  });
});

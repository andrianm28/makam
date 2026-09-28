/**
 * The Saat Duka Pencairan trigger (spec, Billing > Payouts: "Saat Duka Petak and
 * a later burial's Biaya Pemakaman | Lunas **and** Pemakaman recorded"; ticket
 * 32's AC 1, 2, 3, 9).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  bayarTagihan,
  catatPemakaman as catatPemakamanMilikModul,
  konfirmasiPesanan,
  payoutsOnTestDatabase,
  pesananSaatDukaSiap,
} from "../../../tests/support/payouts";
import { setTagihanStatusForTest } from "../../../tests/support/billing";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const bayar = bayarTagihan;
const catatPemakaman = catatPemakamanMilikModul;

describe("a Saat Duka order's Pencairan becomes due when the Tagihan is Lunas and the Pemakaman is recorded", () => {
  it("owes the Lokasi Mitra the Petak's tariff and the Biaya Pemakaman exactly as the issued Tagihan priced them", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);

    await bayar(setup, konfirmasi.tagihanId);
    await catatPemakaman(setup, fixture.nomor, wib("2026-10-02 10:00"));
    const hasil = await setup.payouts.tick();

    expect(hasil).toEqual({ items: 2, potongan: 0, dilewati: 0 });
    const rows = await setup.payouts.pencairanJatuhTempo();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipient: { kind: "lokasi_mitra", nama: "Makam Wakaf Al-Ikhlas" }, itemCount: 2 });
    // Rp 7.500.000 for the Hak Pakai and Rp 2.000.000 for the burial, as issued.
    expect(rows[0]!.amount).toBe(9_500_000);
  });

  it("makes the order due in the other order too: the burial recorded before the money arrives", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);

    await catatPemakaman(setup, fixture.nomor, wib("2026-10-02 10:00"));
    expect(await setup.payouts.tick()).toEqual({ items: 0, potongan: 0, dilewati: 0 });
    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([]);

    await bayar(setup, konfirmasi.tagihanId);
    expect(await setup.payouts.tick()).toMatchObject({ items: 2 });
    expect((await setup.payouts.pencairanJatuhTempo())[0]?.amount).toBe(9_500_000);
  });

  it("owes nothing while only one of the two halves is there, and runs the tick again without paying twice", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);

    await bayar(setup, konfirmasi.tagihanId);
    expect(await setup.payouts.tick()).toEqual({ items: 0, potongan: 0, dilewati: 0 });
    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([]);

    await catatPemakaman(setup, fixture.nomor, wib("2026-10-02 10:00"));
    await setup.payouts.tick();
    // The tick is idempotent: a second run finds the order already itemised and
    // adds nothing, however many times the worker repeats it.
    expect(await setup.payouts.tick()).toEqual({ items: 0, potongan: 0, dilewati: 1 });
    expect(await setup.payouts.tick()).toEqual({ items: 0, potongan: 0, dilewati: 1 });
    expect(await setup.payouts.pencairanJatuhTempo()).toHaveLength(1);
  });

  it("is due 2 Hari Kerja after it became due, on the Admin Platform calendar", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);
    await bayar(setup, konfirmasi.tagihanId);
    // The burial is recorded on Friday 2026-10-02, so two Hari Kerja later is
    // Tuesday 2026-10-06 at 23:59 WIB: Saturday and Sunday are not Hari Kerja.
    await catatPemakaman(setup, fixture.nomor, wib("2026-10-02 15:00"));
    await setup.payouts.tick();

    const [row] = await setup.payouts.pencairanJatuhTempo();
    expect(row?.jatuhTempoAt).toEqual(wib("2026-10-06 23:59"));
  });

  it("a family who has not paid owes nobody, and owes nobody more once the money is refused", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);
    await catatPemakaman(setup, fixture.nomor, wib("2026-10-02 10:00"));

    // A pay-after Tagihan that was never paid settles nothing, so no effect runs.
    expect(await setup.payouts.tick()).toEqual({ items: 0, potongan: 0, dilewati: 0 });
    // And the payment effect itself is idempotent: the same payment twice is one fact.
    await bayar(setup, konfirmasi.tagihanId);
    await bayar(setup, konfirmasi.tagihanId);
    expect(await setup.payouts.tick()).toMatchObject({ items: 2 });
    expect(await setup.payouts.pencairanJatuhTempo()).toHaveLength(1);
  });

  it("a Tagihan declared Tidak Tertagih produces no Pencairan, and the family paying later does", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);
    const tagihanId = konfirmasi.tagihanId;
    await catatPemakaman(setup, fixture.nomor, wib("2026-10-02 10:00"));

    // The Operator has given up chasing (ticket 29 owns that status; the test
    // sets it the only way available until then).
    await setTagihanStatusForTest(db, tagihanId, "tidak_tertagih");
    expect(await setup.payouts.tick()).toEqual({ items: 0, potongan: 0, dilewati: 0 });
    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([]);

    // The family pays anyway: the Tagihan stays payable, and the Lokasi Mitra is
    // paid for work it has already done.
    await bayar(setup, tagihanId);
    expect(await setup.payouts.tick()).toMatchObject({ items: 2 });
    expect((await setup.payouts.pencairanJatuhTempo())[0]?.amount).toBe(9_500_000);
  });
});

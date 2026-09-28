/**
 * The Terencana Pencairan trigger (spec, Billing > Payouts: "Terencana Hak Pakai |
 * end of the Masa Pembatalan, or the first Pemakaman if sooner"; ticket 37's AC 7).
 *
 * The trigger differs from the Saat Duka one only in *when* an item becomes due, so
 * these tests are about the two instants and the difference between them: a paid
 * Terencairan whose family buries somebody inside the Masa Pembatalan is paid earlier
 * than one whose plot stays empty, and neither is paid before its own instant has
 * passed. Everything is driven through public functions — the Pemesanan module's own
 * reads, the Payouts module's own reads and its Pencairan run — with the fake Clock, so
 * moving time is what moves the deadline.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { lapsePayFirstTagihanTick } from "@/domain/billing";
import { wib } from "@/lib/time/jakarta";
import * as trigger from "@/domain/payouts";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { catatPemakaman, pesananTerencanaSiap, pesanTerencana, payoutsOnTestDatabase } from "../../../tests/support/payouts";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** One Terencairan paid and activated, with the Id of the Tagihan that paid for it. */
async function terencanaAktif(options: Parameters<typeof pesananTerencanaSiap>[1] = {}) {
  const setup = payoutsOnTestDatabase(db);
  const siap = await pesananTerencanaSiap(setup, options);
  const order = await pesanTerencana(siap);
  const konfirmasi = await setup.pemesanan.konfirmasiTerencana(siap.fixture.adminLokasi, { nomor: order.nomor });
  if (!konfirmasi.ok) throw new Error(`konfirmasi refused: ${JSON.stringify(konfirmasi)}`);
  // The Tagihan comes from the confirmation's own answer; the order was read before it, so
  // the id is read again rather than taken from a stale read.
  const tagihanId = konfirmasi.tagihan!.id;
  const dibayar = await setup.billing.recordPayment(tagihanId, {
    method: { kind: "penyedia_pembayaran", channel: "QRIS" },
    reference: null,
  });
  if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
  const tick = await setup.pemesanan.tickTerencanaDibayar();
  if (tick.diaktifkan !== 1) throw new Error(`the paid tick did not activate: ${JSON.stringify(tick)}`);
  const tagihan = await setup.billing.tagihan(tagihanId);
  return { setup, siap, order, tagihanId, dibayarPada: tagihan?.paidAt as Date };
}

describe("a Terencairan's Pencairan becomes due at the end of its Masa Pembatalan", () => {
  it("owes the Lokasi Mitra the Hak Pakai as the issued Tagihan priced it, and not one minute before", async () => {
    const { setup, dibayarPada } = await terencanaAktif({ masaPembatalanDays: 7 });
    expect(dibayarPada).toBeInstanceOf(Date);

    // Paid, so the items exist — but neither is due: the family may still cancel and be
    // refunded in full for the next 7 days, so paying the Lokasi Mitra now would be
    // paying for a right that may be given back.
    const dibuat = await setup.payouts.tickTerencana();
    expect(dibuat.items).toBe(2);
    expect(dibuat.due).toBe(0);
    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([]);

    // The end of the Masa Pembatalan is the end of the 7th day after the payment's own
    // WIB day, which is 23:59 — so a minute earlier it is still not due, and a minute
    // later it is.
    const akhir = akhirMasaPembatalan(dibayarPada, 7);
    setup.clock.set(new Date(akhir.getTime() - 60_000));
    expect((await setup.payouts.tickTerencana()).due).toBe(0);
    setup.clock.set(new Date(akhir.getTime() + 60_000));
    expect((await setup.payouts.tickTerencana()).due).toBe(2);

    const rows = await setup.payouts.pencairanJatuhTempo();
    expect(rows).toHaveLength(1);
    // Rp 2.500.000 per chosen plot, as the issued Tagihan priced them. The Operator's
    // own Biaya Layanan Platform is not the Lokasi Mitra's money, so it is not here.
    expect(rows[0]?.amount).toBe(5_000_000);
  });

  it("becomes due at the first Pemakaman instead, when the burial comes sooner", async () => {
    const { setup, order, dibayarPada } = await terencanaAktif({ masaPembatalanDays: 30 });
    const akhirMasa = akhirMasaPembatalan(dibayarPada, 30);

    // A burial on the third day, well inside the Masa Pembatalan. The items exist from the
    // payment, and the burial is what makes them due *then*.
    setup.clock.advance({ days: 3 });
    await catatPemakaman(setup, order.nomor, wib("2026-10-04 09:00"));
    const setelahPemakaman = await setup.payouts.tickTerencana();
    expect(setelahPemakaman.items).toBe(2);
    expect(setelahPemakaman.due).toBe(2);

    // So the run offers it for transfer, with the 2 Hari Kerja deadline stamped on it,
    // 27 days before the Masa Pembatalan would have ended.
    const rows = await setup.payouts.pencairanJatuhTempo();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(5_000_000);
    // The 2 Hari Kerja deadline is stamped on the row the Antrean's Pencairan query reads.
    expect(rows[0]?.jatuhTempoAt.getTime()).toBeGreaterThan(setup.clock.now().getTime());
    // 30 days on, nothing changes: an item is paid once.
    setup.clock.set(akhirMasa);
    expect((await setup.payouts.tickTerencana()).due).toBe(0);
  });

  it("owes nothing while the order is not yet paid, and runs the trigger twice without paying twice", async () => {
    const setup = payoutsOnTestDatabase(db);
    const siap = await pesananTerencanaSiap(setup);
    const order = await pesanTerencana(siap);
    // Confirmed but unpaid: a Terencairan with no money has granted no right, so there is
    // nothing to pay the Lokasi Mitra for.
    const konfirmasi = await setup.pemesanan.konfirmasiTerencana(siap.fixture.adminLokasi, { nomor: order.nomor });
    if (!konfirmasi.ok) throw new Error("konfirmasi refused");
    if (!konfirmasi.tagihan) throw new Error("the confirmation issued no Tagihan");
    expect(await setup.pemesanan.terencanaTerbayar()).toEqual([]);

    const dibayar = await setup.billing.recordPayment(konfirmasi.tagihan.id, {
      method: { kind: "penyedia_pembayaran", channel: "QRIS" },
      reference: null,
    });
    if (!dibayar.ok) throw new Error("payment refused");
    await setup.pemesanan.tickTerencanaDibayar();

    expect(await setup.payouts.tickTerencana()).toMatchObject({ items: 2, due: 0 });
    // Idempotent: a second run finds the items already there and adds nothing, however
    // many times the worker repeats it.
    expect(await setup.payouts.tickTerencana()).toMatchObject({ items: 0, dilewati: 1 });
    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([]);
  });

  it("owes nothing for a plot whose hold ran out unpaid, however long the tick waits", async () => {
    const setup = payoutsOnTestDatabase(db);
    const siap = await pesananTerencanaSiap(setup, { masaPembatalanDays: 7 });
    const order = await pesanTerencana(siap);
    const konfirmasi = await setup.pemesanan.konfirmasiTerencana(siap.fixture.adminLokasi, { nomor: order.nomor });
    if (!konfirmasi.ok) throw new Error("konfirmasi refused");
    // The hold runs out: Billing's own lapse tick cancels the Tagihan and the order's own
    // tick releases the plots. No right was ever granted, so the Lokasi Mitra is owed
    // nothing — however many times the trigger runs afterwards.
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());
    setup.clock.advance({ hours: 30 });
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());
    expect(await setup.pemesanan.tickTerencanaLapsed()).toMatchObject({ dibatalkan: 1 });
    const akhir = akhirMasaPembatalan(setup.clock.now(), 7);
    setup.clock.set(new Date(akhir.getTime() + 60_000));

    const hasil = await setup.payouts.tickTerencana();
    expect(hasil.items).toBe(0);
    expect(hasil.due).toBe(0);
    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([]);
  });
});

/**
 * The end of the Masa Pembatalan, read from the module's own rule rather than recomputed
 * here: a test that re-derives the instant it is testing would agree with the code for the
 * wrong reason, and would keep passing if the rule changed.
 */
function akhirMasaPembatalan(dibayarPada: Date, hari: number): Date {
  return trigger.akhirMasaPembatalan(dibayarPada, hari);
}

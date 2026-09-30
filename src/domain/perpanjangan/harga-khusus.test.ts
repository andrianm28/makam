/**
 * A Perpanjangan whose pay-first Tagihan a Harga Khusus reissued under a new id (ticket 93): the Perpanjangan stored the id it
 * was first issued, so what it says about its money must come from the Tagihan in force, not the one that was replaced.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { akunDenganEmail, hakPakaiSiap, PEMEGANG_HAK, perpanjanganOnTestDatabase } from "../../../tests/support/perpanjangan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("a Perpanjangan after a Harga Khusus reissued its Tagihan (ticket 93)", () => {
  it("still waits for payment, and its open Tagihan is the replacement the family can pay", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const pemohon = await akunDenganEmail(setup, PEMEGANG_HAK.email);
    const dipesan = await setup.perpanjangan.ajukan({ hakPakaiId: fixture.hakPakaiId, terms: 1, pemohon });
    if (!dipesan.ok) throw new Error(`ajukan refused: ${dipesan.reason}`);
    const perpanjangan = dipesan.perpanjangan;
    const [lama] = await setup.billing.cariTagihan(perpanjangan.tagihan.nomorTagihan);
    const khusus = await setup.billing.tetapkanHargaKhusus(fixture.admin, {
      tagihanId: lama!.id,
      amount: 150_000,
      alasan: "Keringanan untuk pemegang hak",
      porsiMitra: 0,
      catatanPorsiMitra: "Ditanggung Operator",
    });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
    const pengganti = khusus.tagihan;

    expect(await setup.perpanjangan.perpanjanganOf(perpanjangan.id)).toMatchObject({ status: "menunggu_pembayaran" });
    expect(await setup.perpanjangan.status(fixture.hakPakaiId, pemohon)).toMatchObject({
      boleh: true,
      tagihanTerbuka: { perpanjanganId: perpanjangan.id, nomorTagihan: pengganti.nomorTagihan, link: pengganti.link },
    });
  });

  it("paying the replacement Tagihan (after two Harga Khusus) extends the Hak Pakai once and issues the Bukti Perpanjangan", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const pemohon = await akunDenganEmail(setup, PEMEGANG_HAK.email);
    const dipesan = await setup.perpanjangan.ajukan({ hakPakaiId: fixture.hakPakaiId, terms: 1, pemohon });
    if (!dipesan.ok) throw new Error(`ajukan refused: ${dipesan.reason}`);
    const perpanjangan = dipesan.perpanjangan;
    const [asli] = await setup.billing.cariTagihan(perpanjangan.tagihan.nomorTagihan);
    // A chain of two reissues: the Tagihan in force is the second replacement.
    let sekarang = asli!.id;
    for (const amount of [150_000, 100_000]) {
      const khusus = await setup.billing.tetapkanHargaKhusus(fixture.admin, { tagihanId: sekarang, amount, alasan: "Keringanan", porsiMitra: 0, catatanPorsiMitra: "Ditanggung Operator" });
      if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
      sekarang = khusus.tagihan.id;
    }

    const dibayar = await setup.billing.recordPayment(sekarang, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);

    expect((await setup.inventory.hakPakaiUntukPerpanjangan(fixture.hakPakaiId))?.endDate).toBe("2031-10-15");
    expect(await setup.perpanjangan.perpanjanganOf(perpanjangan.id)).toMatchObject({ status: "lunas", endDateBaru: "2031-10-15" });
  });
});

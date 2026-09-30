/**
 * Cancelling a confirmed Saat Duka order whose Tagihan a Harga Khusus reissued (ticket 93): the order stored the id it was
 * first issued, so the cancellation must find the Tagihan in force through Billing, never cancel the replaced one and leave
 * the replacement payable.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, siapkanOperatorPemesanan, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A confirmed Saat Duka order whose unpaid pay-after Tagihan the Operator then reissued with a Harga Khusus. */
async function denganHargaKhusus(setup: PemesananSetup) {
  const fixture = await saatDukaFixture(setup);
  await siapkanOperatorPemesanan(setup);
  const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");
  const konfirmasi = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, { nomor: placed.pemesanan.nomor, petakId: cells[0]!.id, pemakamanAt: "2026-10-02T10:00" });
  if (!konfirmasi.ok) throw new Error(`confirmation refused: ${konfirmasi.reason}`);
  const tagihanId = (await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan))?.tagihanId;
  if (!tagihanId) throw new Error("the confirmed order names no Tagihan");
  const khusus = await setup.billing.tetapkanHargaKhusus(fixture.admin, {
    tagihanId,
    amount: 100_000,
    alasan: "Keringanan untuk keluarga",
    porsiMitra: 0,
    catatanPorsiMitra: "Ditanggung Operator",
  });
  if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
  return { ...fixture, nomor: placed.pemesanan.nomor, pengganti: khusus.tagihan };
}

describe("cancelling a Saat Duka order after a Harga Khusus (ticket 93)", () => {
  it("cancels the replacement Tagihan, so the family can no longer pay it", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await denganHargaKhusus(setup);

    const hasil = await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "Keluarga berubah pikiran" });

    expect(hasil).toMatchObject({ ok: true, pesanan: { status: "dibatalkan" }, tagihan: { nomorTagihan: fixture.pengganti.nomorTagihan, dibatalkan: true } });
    expect(await setup.billing.tagihan(fixture.pengganti.id)).toMatchObject({ status: "dibatalkan", cancelledReason: "pemesanan_dibatalkan" });
    expect(await setup.billing.recordPayment(fixture.pengganti.id, { method: { kind: "transfer_manual" }, reference: "TRF-3" })).toMatchObject({
      ok: false,
      reason: "tagihan_dibatalkan",
    });
  });
});

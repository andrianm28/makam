/**
 * The order status and the Tagihan status, side by side (spec, Pemesanan > Saat
 * Duka's two tracks; ticket 25's AC 5). They are two different things on two
 * different clocks — a burial that happened and money that has not arrived — and
 * a family that reads one as the other is misled about what is still owed.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { lewatJatuhTempoPayAfterTagihanTick } from "@/domain/billing";
import type { Actor } from "@/domain/identity";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** One order's two statuses, read the way each side reads them: the family's own page and the Lokasi's staff page. */
async function keduaStatus(setup: PemesananSetup, fixture: { pemesan: { accountId: string }; adminLokasi: Actor }, nomor: string) {
  const order = await setup.pemesanan.orderOf(nomor, fixture.pemesan);
  const tagihan = order?.tagihanId ? await setup.billing.tagihan(order.tagihanId) : null;
  const untukStaf = await setup.pemesanan.orderUntukStaf(fixture.adminLokasi, nomor);
  return {
    pemesan: { pesanan: order?.status ?? null, tagihan: tagihan?.status ?? null },
    staf: { pesanan: untukStaf?.status ?? null, tagihanId: untukStaf?.tagihanId ?? null },
  };
}

describe("the order status and the Tagihan status", () => {
  it("are two independent facts: Dimakamkan with Belum Dibayar, and each moves on its own", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    await siapkanOperatorPemesanan(setup);
    const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
    const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");
    const konfirmasi = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
      nomor: placed.pemesanan.nomor,
      petakId: cells[0]!.id,
      pemakamanAt: "2026-10-02T10:00",
    });
    if (!konfirmasi.ok) throw new Error(`confirmation refused: ${konfirmasi.reason}`);

    // Buried, unpaid: the order has moved on and the money has not.
    setup.clock.set(wib("2026-10-06 08:00"));
    await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: placed.pemesanan.nomor, tanggal: "2026-10-06" });
    expect(await keduaStatus(setup, fixture, placed.pemesanan.nomor)).toMatchObject({
      pemesan: { pesanan: "dimakamkan", tagihan: "belum_dibayar" },
      staf: { pesanan: "dimakamkan" },
    });

    // The Tagihan's own clock, and only that one, moves it to Lewat Jatuh Tempo.
    await lewatJatuhTempoPayAfterTagihanTick({ db }, wib("2026-10-09 08:00"));
    expect(await keduaStatus(setup, fixture, placed.pemesanan.nomor)).toMatchObject({
      pemesan: { pesanan: "dimakamkan", tagihan: "lewat_jatuh_tempo" },
    });

    // Paying it settles the money and the order together — and only then.
    const order = await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan);
    if (!order?.tagihanId) throw new Error("no Tagihan");
    const bayar = await setup.billing.recordPayment(order.tagihanId, { method: { kind: "transfer_manual" }, reference: null });
    expect(bayar.ok).toBe(true);
    expect(await keduaStatus(setup, fixture, placed.pemesanan.nomor)).toMatchObject({
      pemesan: { pesanan: "selesai", tagihan: "lunas" },
    });
  });
});

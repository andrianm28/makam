/**
 * The pay-after clock of a Saat Duka Tagihan (spec, Billing: "Pay-after
 * Tagihan become Lewat Jatuh Tempo, with the clock counted from the **recorded**
 * burial date. The printed due date of a Saat Duka Tagihan comes from the
 * planned burial date at confirmation; the Tagihan is not reissued if the
 * recorded date differs"; ticket 25's AC 3).
 *
 * The whole point is that the two dates differ: a burial can happen days after
 * the day the Lokasi agreed with the family, and the family's three days run
 * from the burial that happened, not from the plan.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { lewatJatuhTempoPayAfterTagihanTick } from "@/domain/billing";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A confirmed order, its pay-after Tagihan and the Tagihan as issued. */
async function pesananDenganTagihan(setup: PemesananSetup) {
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
  const tagihan = order?.tagihanId ? await setup.billing.tagihan(order.tagihanId) : null;
  if (!tagihan) throw new Error("no Tagihan on the confirmed order");
  return { ...fixture, nomor: placed.pemesanan.nomor, tagihanId: tagihan.id, tagihan };
}

describe("the pay-after clock of a Saat Duka Tagihan", () => {
  it("becomes Lewat Jatuh Tempo 3×24 h after the recorded Pemakaman, and not the planned one", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDenganTagihan(setup);
    // The printed due date is the planned burial (2 Oct 10:00) plus the Lokasi's 72 h window.
    expect(fixture.tagihan).toMatchObject({ status: "belum_dibayar", dueAt: wib("2026-10-05 10:00") });

    // The burial was agreed for 2 October and actually dug on the 6th, at 08:00.
    setup.clock.set(wib("2026-10-06 08:00"));
    const dicatat = await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-06" });
    expect(dicatat.ok).toBe(true);

    // The planned date's own deadline passes, and the Tagihan is still waiting: a burial four days late is not the family's fault.
    await lewatJatuhTempoPayAfterTagihanTick({ db }, wib("2026-10-05 10:01"));
    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({ status: "belum_dibayar" });

    // The Tagihan is not reissued: the same number, the same printed due date.
    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({
      nomorTagihan: fixture.tagihan.nomorTagihan,
      dueAt: wib("2026-10-05 10:00"),
    });

    await lewatJatuhTempoPayAfterTagihanTick({ db }, wib("2026-10-09 07:59"));
    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({ status: "belum_dibayar" });

    // 3×24 h after the burial that was recorded: Lewat Jatuh Tempo, and still payable.
    await lewatJatuhTempoPayAfterTagihanTick({ db }, wib("2026-10-09 08:00"));
    const lewat = await setup.billing.tagihan(fixture.tagihanId);
    expect(lewat).toMatchObject({ status: "lewat_jatuh_tempo", kind: "pay_after", dueAt: wib("2026-10-05 10:00") });
    expect(lewat?.cancelledReason).toBeNull();

    // Running the tick again changes nothing.
    await lewatJatuhTempoPayAfterTagihanTick({ db }, wib("2026-10-30 12:00"));
    expect(await setup.billing.tagihan(fixture.tagihanId)).toEqual(lewat);
  });

  it("a Tagihan already Lunas is left alone, and one that was never given a recorded burial never lapses on the pay-first rule", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDenganTagihan(setup);
    // Paid before the burial, as a family that settles up front does.
    const dibayar = await setup.billing.recordPayment(fixture.tagihanId, { method: { kind: "transfer_manual" }, reference: null });
    expect(dibayar.ok).toBe(true);

    setup.clock.set(wib("2026-10-06 08:00"));
    await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-06" });
    await lewatJatuhTempoPayAfterTagihanTick({ db }, wib("2026-11-01 09:00"));

    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({ status: "lunas" });
  });

  it("blocks a Ganti Pemegang Hak on its Hak Pakai while the Tagihan is Lewat Jatuh Tempo, at filing and again at approval", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDenganTagihan(setup);
    const hakPakaiId = await setup.pemesanan.hakPakaiIdForTagihan(fixture.tagihanId);
    if (!hakPakaiId) throw new Error("no Hak Pakai on the confirmed order");
    const baru = { hakPakaiId, pemegangBaru: { name: "Bapak Hasan", phoneNumber: "081322223333" }, sebab: "waris" } as const;
    const pemegang = { accountId: fixture.pemesan.accountId, email: fixture.pemesan.email };

    // Filed while the Tagihan is still fine, then it lapses: the approval refuses.
    const diajukan = await setup.pemesanan.ajukanGantiPemegangHak(pemegang, baru);
    if (!diajukan.ok) throw new Error(diajukan.reason);
    setup.clock.set(wib("2026-10-06 08:00"));
    await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: fixture.nomor, tanggal: "2026-10-06" });
    await lewatJatuhTempoPayAfterTagihanTick({ db }, wib("2026-10-09 08:00"));
    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({ status: "lewat_jatuh_tempo" });

    expect(await setup.pemesanan.setujuiPermintaanHakPakai(fixture.adminLokasi, { id: diajukan.permintaan.id })).toEqual({ ok: false, reason: "tagihan_lewat_jatuh_tempo" });
    await setup.pemesanan.batalkanPermintaanHakPakai(pemegang, { id: diajukan.permintaan.id });
    expect(await setup.pemesanan.ajukanGantiPemegangHak(pemegang, baru)).toEqual({ ok: false, reason: "tagihan_lewat_jatuh_tempo" });
  });
});

/**
 * The subject a queued direct Peringatan Staf of a Pemesanan names (ticket 96):
 * the order itself. A retry is dropped once the order is no longer Diajukan,
 * because its Lokasi has answered; until then it still needs the alert.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { orderSaatDuka, pemesananOnTestDatabase, siapkanOperatorPemesanan, saatDukaFixture, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A Saat Duka order placed at the fixture's Lokasi Mitra, with the Admin Lokasi's first assignable Petak. */
async function pesananDiajukan(setup: PemesananSetup) {
  const fixture = await saatDukaFixture(setup);
  await siapkanOperatorPemesanan(setup);
  const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  if (!blok) throw new Error("no Blok");
  const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id)).filter((cell) => cell.kind === "petak");
  return { ...fixture, id: placed.pemesanan.id, nomor: placed.pemesanan.nomor, cells };
}

/** The Admin Lokasi confirms the order, so its alerts no longer need sending. */
async function konfirmasi(setup: PemesananSetup, fixture: Awaited<ReturnType<typeof pesananDiajukan>>) {
  await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
    nomor: fixture.nomor,
    petakId: fixture.cells[0]!.id,
    pemakamanAt: "2026-10-02T10:00",
  });
}

describe("the subject of a direct Peringatan Staf of a Pemesanan", () => {
  it("says a Pemesanan Makam still needs it while Diajukan, and no longer once its Lokasi confirmed it", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const fixture = await pesananDiajukan(setup);

    expect(await setup.pemesanan.peringatanStafMasihPerlu({ kind: "pemesanan_makam", id: fixture.id })).toBe(true);

    await konfirmasi(setup, fixture);

    expect(await setup.pemesanan.peringatanStafMasihPerlu({ kind: "pemesanan_makam", id: fixture.id })).toBe(false);
  });

  it("leaves a subject it does not own to whoever does", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    expect(await setup.pemesanan.peringatanStafMasihPerlu({ kind: "bukti_pencairan", id: "apa saja" })).toBe(true);
  });

  it("drops a retried direct alert once its Pemesanan Makam was confirmed", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const fixture = await pesananDiajukan(setup);
    setup.email.failNextSend(20);

    // The first attempt fails and schedules a retry; nothing is dropped yet.
    await setup.notifications.kirimPeringatanStafTick();
    const logEmail = async () =>
      (await setup.notifications.pesanStaf(fixture.adminLokasi.accountId))
        .filter((pesan) => pesan.template === "staf_saat_duka_baru" && pesan.channel === "email");
    expect((await logEmail()).map((pesan) => pesan.status)).toEqual(["gagal"]);

    await konfirmasi(setup, fixture);
    setup.clock.advance({ minutes: 15 });
    await setup.notifications.kirimPeringatanStafTick({
      subjekMasihPerlu: (subject) => setup.pemesanan.peringatanStafMasihPerlu(subject),
    });

    // Dropped: no second send, one `dibatalkan` row, and never picked up again.
    expect((await logEmail()).map((pesan) => pesan.status).sort()).toEqual(["dibatalkan", "gagal"]);
    setup.clock.advance({ days: 2 });
    await setup.notifications.kirimPeringatanStafTick({
      subjekMasihPerlu: (subject) => setup.pemesanan.peringatanStafMasihPerlu(subject),
    });
    expect((await logEmail()).map((pesan) => pesan.status).sort()).toEqual(["dibatalkan", "gagal"]);
  });
});

/**
 * Hari-H Layanan on a Pemesanan Saat Duka at a Lokasi Mitra (spec, Layanan > Order; Pemesanan > Saat Duka; Billing > due
 * rules and Tidak Tertagih; story 23; ticket 53). The fake Clock sits at Thursday 1 Oktober 2026 09:00 WIB; the burial
 * is agreed for Jumat 2 Oktober 10:00. Through the modules' public functions only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import {
  orderSaatDuka,
  pemesananOnTestDatabase,
  saatDukaFixture,
  siapkanOperatorPemesanan,
  tawarkanLayananDi,
  type PemesananSetup,
} from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A Lokasi Mitra offering a hari-H Layanan, and a Saat Duka order that asks for it. */
async function pesananDenganLayanan(setup: PemesananSetup, options: Parameters<typeof tawarkanLayananDi>[2] = {}) {
  const fixture = await saatDukaFixture(setup);
  const { varian } = await tawarkanLayananDi(setup, fixture.lokasiMitra.id, options);
  const placed = await setup.pemesanan.placeSaatDuka({
    ...orderSaatDuka(fixture),
    rencanaPemakamanAt: "2026-10-02T10:00",
    layananHariH: [{ layananVariantId: varian.id, teks: null }],
  });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");
  return { ...fixture, varian, nomor: placed.pemesanan.nomor, petakId: cells[0]!.id };
}

async function konfirmasi(setup: PemesananSetup, fixture: Awaited<ReturnType<typeof pesananDenganLayanan>>) {
  await siapkanOperatorPemesanan(setup);
  const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
    nomor: fixture.nomor,
    petakId: fixture.petakId,
    pemakamanAt: "2026-10-02T10:00",
  });
  if (!hasil.ok) throw new Error(`confirmation refused: ${hasil.reason}`);
  return hasil;
}

describe("a Saat Duka order with hari-H Layanan", () => {
  it("is billed pay-after on the Saat Duka Tagihan, which keeps its due date and carries one Biaya Layanan Platform", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDenganLayanan(setup);
    const hasil = await konfirmasi(setup, fixture);

    const tagihan = await setup.billing.tagihan((await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan))!.tagihanId!);
    expect(hasil.tagihan.kind).toBe("pay_after");
    // Burial 2 Oktober 10:00 WIB plus the Lokasi's Saat Duka payment window: the Layanan did not move it.
    const jam = (await setup.lokasi.saatDukaPaymentWindowHours(fixture.lokasiMitra.id))!;
    expect(hasil.tagihan.dueAt.toISOString()).toBe(new Date(Date.parse("2026-10-02T03:00:00Z") + jam * 3_600_000).toISOString());
    expect(tagihan!.lines.filter((line) => line.kind === "layanan")).toMatchObject([{ amount: 150_000, label: expect.stringContaining("Tabur Bunga") }]);
    expect(tagihan!.lines.filter((line) => line.kind === "biaya_layanan_platform")).toHaveLength(1);
  });

  it("has its Pekerjaan Layanan Dijadwalkan at the confirmation, targeted at the burial day, before anything is paid", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDenganLayanan(setup);
    await konfirmasi(setup, fixture);

    const pesanan = await setup.layanan.pesananLayananOf(fixture.nomor, fixture.pemesan);
    expect(pesanan?.item).toMatchObject([{ targetDate: "2026-10-02", pekerjaan: { status: "dijadwalkan" } }]);
  });

  it("is refused when the item is not a hari-H one", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    const { varian } = await tawarkanLayananDi(setup, fixture.lokasiMitra.id, { bisaHariH: false, adaDiPetakKosong: true });
    const hasil = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), layananHariH: [{ layananVariantId: varian.id, teks: null }] });
    expect(hasil).toEqual({ ok: false, reason: "layanan_tidak_tersedia" });
  });
});

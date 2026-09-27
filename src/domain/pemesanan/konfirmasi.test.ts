/**
 * Confirming a Pemesanan Saat Duka at a Lokasi Mitra (spec, Pemesanan >
 * Saat Duka: "Confirm = assign a cleared Tersedia Petak of the chosen Jenis
 * Makam → Hak Pakai Aktif → pay-after Tagihan"; ticket 23's AC 1, 4, 6, 8).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { siapkanOperatorPemesanan, terverifikasiLokasi } from "../../../tests/support/pemesanan";
import { orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** An order placed at the fixture's Lokasi Mitra, with Pengaturan Operator entered so a Tagihan can be issued. */
async function pesananSiapDikonfirmasi(setup: PemesananSetup) {
  const fixture = await saatDukaFixture(setup);
  await siapkanOperatorPemesanan(setup);
  const placed = await setup.pemesanan.placeSaatDuka({
    ...orderSaatDuka(fixture),
    rencanaPemakamanAt: "2026-10-02T10:00",
  });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  // A Blok whose Petak the Admin Lokasi may assign: the fixture's first one.
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  if (!blok) throw new Error("no Blok");
  const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id)).filter((cell) => cell.kind === "petak");
  return { ...fixture, nomor: placed.pemesanan.nomor, blok, cells };
}

/** The first cleared Petak of a Lokasi Mitra's first Blok, as the confirm form offers it. */
async function fixturePetak(setup: PemesananSetup, fixture: { adminLokasi: Awaited<ReturnType<typeof saatDukaFixture>>["adminLokasi"]; lokasiMitra: { id: string } }) {
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak");
  return cells[0]!.id;
}

/** The Admin Lokasi's confirmation of that order: the first cleared Petak of the chosen Jenis Makam. */
function konfirmasi(fixture: Awaited<ReturnType<typeof pesananSiapDikonfirmasi>>, pemakamanAt = "2026-10-02T10:00") {
  return {
    nomor: fixture.nomor,
    petakId: fixture.cells[0]!.id,
    pemakamanAt,
  };
}

describe("the Admin Lokasi confirms a Saat Duka order", () => {
  it("confirms the order, grants an Aktif Hak Pakai for its Pemegang Hak and issues the pay-after Tagihan", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananSiapDikonfirmasi(setup);

    const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, konfirmasi(fixture));

    expect(hasil).toMatchObject({
      ok: true,
      pesanan: { nomor: fixture.nomor, status: "dikonfirmasi", petakNomor: "A-01", hakPakaiId: expect.any(String) },
      tagihan: { nomorTagihan: "TGH/2026/000001", total: 9_650_000, dueAt: wib("2026-10-05 10:00"), kind: "pay_after" },
    });

    const order = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    expect(order).toMatchObject({
      status: "dikonfirmasi",
      tagihanId: expect.any(String),
      pemakaman: { petakNomor: expect.any(String), at: wib("2026-10-02 10:00") },
    });
    // The plot is no longer available to the next family.
    expect(await setup.inventory.tersediaPerJenisMakam(fixture.lokasiMitra.id)).toEqual([
      { jenisMakamId: fixture.jenisMakam.id, count: 3 },
    ]);
  });

  it("prints the due date as the agreed burial plus the Lokasi's Saat Duka payment window, and prices all three lines", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananSiapDikonfirmasi(setup);

    await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, konfirmasi(fixture));

    const order = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    const tagihan = order?.tagihanId ? await setup.billing.tagihan(order.tagihanId) : null;
    expect(tagihan).toMatchObject({
      kind: "pay_after",
      // Planned burial 2026-10-02 10:00 + the Lokasi's 72 h window.
      dueAt: wib("2026-10-05 10:00"),
      nomorPemesanan: fixture.nomor,
      placeName: "Makam Wakaf Al-Ikhlas",
      lines: [
        { kind: "harga_hak_pakai", amount: 7_500_000 },
        { kind: "biaya_pemakaman", amount: 2_000_000 },
        { kind: "biaya_layanan_platform", amount: 150_000 },
      ],
    });
    expect(tagihan?.total).toBe(9_650_000);
  });

  it("follows the Lokasi's own Saat Duka payment window, not the default", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananSiapDikonfirmasi(setup);
    const kebijakan = await setup.lokasi.lokasiMitra(fixture.admin, fixture.lokasiMitra.id);
    if (!kebijakan.ok) throw new Error(`Lokasi Mitra refused: ${kebijakan.reason}`);
    const diubah = await setup.lokasi.setPoliciesAndFlags(fixture.admin, fixture.lokasiMitra.id, {
      policies: { ...kebijakan.lokasiMitra.policies, saatDukaPaymentWindowHours: 24 },
      flags: kebijakan.lokasiMitra.flags,
    });
    if (!diubah.ok) throw new Error(`policies refused: ${diubah.reason}`);

    await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, konfirmasi(fixture));

    const order = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    const tagihan = order?.tagihanId ? await setup.billing.tagihan(order.tagihanId) : null;
    expect(tagihan?.dueAt).toEqual(wib("2026-10-03 10:00"));
  });

  it("emails the family the confirmation, and the order's queue row closes itself", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const fixture = await pesananSiapDikonfirmasi(setup);
    expect(await setup.pemesanan.antreanKonfirmasi(fixture.lokasiMitra.id)).toEqual([
      expect.objectContaining({ nomor: fixture.nomor, pemesan: { name: "Budi Santoso", phoneNumber: "+6281234567890" } }),
    ]);

    const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, konfirmasi(fixture));
    expect(hasil.ok).toBe(true);
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    // The family heard about the order when it was placed, and again now it is confirmed.
    const mailed = setup.email.sent.filter((message) => message.to === "pemesan@contoh.id" && message.subject.includes(fixture.nomor));
    expect(mailed).toHaveLength(2);
    const kabar = mailed.find((message) => message.subject.includes("dikonfirmasi"));
    expect(kabar?.text).toContain("A-01");
    expect(kabar?.text).toContain("Pemakaman tetap berjalan");
    // The row closes itself: a confirmed order is no longer waiting for confirmation.
    expect(await setup.pemesanan.antreanKonfirmasi(fixture.lokasiMitra.id)).toEqual([]);
  });

  it("refuses Admin Platform, another Lokasi's Admin Lokasi, a Petak of another Jenis Makam and an order already confirmed", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananSiapDikonfirmasi(setup);
    const lain = await terverifikasiLokasi(setup, { name: "Makam Sawah Besar", city: "Kabupaten Bekasi" });

    // Admin Platform may only chase the Lokasi by phone (its Tier 1 row), never confirm.
    expect(await setup.pemesanan.konfirmasiSaatDuka(fixture.admin, konfirmasi(fixture))).toEqual({ ok: false, reason: "tidak_berwenang" });
    // Another Lokasi Mitra's Admin Lokasi may not confirm this Lokasi's order either.
    expect(await setup.pemesanan.konfirmasiSaatDuka(lain.adminLokasi, konfirmasi(fixture))).toEqual({ ok: false, reason: "tidak_berwenang" });

    // A Petak of another Jenis Makam is not this order's plot.
    expect(
      await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
        ...konfirmasi(fixture),
        petakId: "9f0ff812-a323-49c3-a434-33b1bb2e3fff",
      }),
    ).toEqual({ ok: false, reason: "petak_tidak_ditemukan" });

    // A first confirmation stands; a second one, on another plot, is refused and changes nothing.
    const pertama = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, konfirmasi(fixture));
    expect(pertama.ok).toBe(true);
    const kedua = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
      ...konfirmasi(fixture),
      petakId: fixture.cells[1]!.id,
    });
    expect(kedua).toEqual({ ok: false, reason: "pesanan_sudah_dikonfirmasi" });
    const order = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    expect(order?.pemakaman?.petakNomor).toBe(pertama.ok ? pertama.pesanan.petakNomor : null);
    // The second plot was never taken.
    const hakPakaiLain = await setup.inventory
      .asStaff(fixture.adminLokasi)
      .hakPakaiOfPetak(fixture.lokasiMitra.id, fixture.cells[1]!.id);
    expect(hakPakaiLain).toBeNull();
  });

  it("counts a late confirmation on the Lokasi: confirmed after the deadline its Jam Operasional gave", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananSiapDikonfirmasi(setup);

    // The deadline was 2026-10-01 11:00 (two service hours from 09:00).
    expect(await setup.pemesanan.konfirmasiTerlambat(fixture.lokasiMitra.id)).toBe(0);
    setup.clock.set(wib("2026-10-01 13:00"));
    expect((await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, konfirmasi(fixture))).ok).toBe(true);

    expect(await setup.pemesanan.konfirmasiTerlambat(fixture.lokasiMitra.id)).toBe(1);
    expect(await setup.pemesanan.konfirmasiTerlambat("5d1f4c2e-0000-4000-8000-000000009999")).toBe(0);
  });

  it("leaves nothing behind when the Tagihan cannot be issued: the order stays Diajukan and its plot free", async () => {
    const setup = pemesananOnTestDatabase(db);
    // No phone anywhere: a Tagihan has nobody to be addressed to, so it cannot be issued.
    const fixture = await saatDukaFixture(setup);
    const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), phoneNumber: "" });
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    await siapkanOperatorPemesanan(setup);
    const petakId = await fixturePetak(setup, fixture);

    const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
      nomor: placed.pemesanan.nomor,
      petakId,
      pemakamanAt: "2026-10-02T10:00",
    });

    expect(hasil).toEqual({ ok: false, reason: "kontak_pemesan_kosong" });
    const order = await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan);
    expect(order).toMatchObject({ status: "diajukan", tagihanId: null, pemakaman: null });
    expect(await setup.pemesanan.orderUntukStaf(fixture.adminLokasi, placed.pemesanan.nomor)).toMatchObject({
      status: "diajukan",
      petakNomor: null,
    });
  });

  it("refuses a confirmation for an unknown order", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananSiapDikonfirmasi(setup);

    expect(
      await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
        nomor: "MKM-2026-999999",
        petakId: fixture.cells[0]!.id,
        pemakamanAt: "2026-10-02T10:00",
      }),
    ).toEqual({ ok: false, reason: "pesanan_tidak_ditemukan" });
  });
});

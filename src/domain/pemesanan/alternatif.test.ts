/**
 * The alternative a Lokasi Mitra offers instead of turning a family away
 * (spec, Pemesanan > Saat Duka: "Tawarkan alternatif (another Jenis Makam / day,
 * accept or decline by the Pemesan; declining becomes a Tolak)"; stories 31, 32;
 * ticket 24's AC 2 and 7). The family answers with one tap on the new all-in
 * total, and a refusal is a Tolak like any other — never a status of its own.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { jenisMakamInput, orderSaatDuka, pemesananOnTestDatabase, saatDukaFixture, terverifikasiLokasi, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/**
 * One Lokasi Mitra with a second, cheaper Jenis Makam ("Khana 3 x 3 m",
 * Rp 6.500.000) and a Blok of cleared plots of it, so a Lokasi has something
 * real to offer and a real price for it. It is cheaper because `quote()` holds a
 * card's all-in total against the Rp 10.000.000 QRIS cap, and anything dearer
 * cannot be offered at all.
 */
async function duaJenisMakam(setup: PemesananSetup) {
  const fixture = await saatDukaFixture(setup);
  const dibuat = await setup.tariffs.createJenisMakam(fixture.admin, fixture.lokasiMitra.id, {
    ...jenisMakamInput("Khana 3 × 3 m"),
    tariff: { ...jenisMakamInput().tariff, hargaHakPakai: 6_500_000 },
  });
  if (!dibuat.ok) throw new Error(`Jenis Makam refused: ${dibuat.reason}`);
  const blok = await setup.inventory.createBlok(fixture.adminLokasi, fixture.lokasiMitra.id, {
    name: "B",
    rows: 1,
    cols: 1,
    jenisMakamId: dibuat.jenisMakam.id,
  });
  if (!blok.ok) throw new Error(`Blok refused: ${blok.reason}`);
  // A fresh Blok's Petak still needs clearing, or it cannot be assigned at all.
  for (const cell of await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.blok.id)) {
    const cleared = await setup.inventory.clearPetak(fixture.adminLokasi, fixture.lokasiMitra.id, cell.id, { mode: "tersedia" });
    if (!cleared.ok) throw new Error(`clearPetak refused: ${cleared.reason}`);
  }
  return { ...fixture, khana: dibuat.jenisMakam, blokB: blok.blok };
}

/** One placed order with a planned burial on 2026-10-02, waiting for its Lokasi. */
async function pesananDenganRencana(setup: PemesananSetup) {
  const fixture = await duaJenisMakam(setup);
  const placed = await setup.pemesanan.placeSaatDuka({
    ...orderSaatDuka(fixture),
    rencanaPemakamanAt: "2026-10-02T10:00",
  });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  return { ...fixture, nomor: placed.pemesanan.nomor };
}

describe("the alternative a Lokasi Mitra offers on a Saat Duka order", () => {
  it("shows the family the new all-in total from quote(), and the order is still waiting for its confirmation", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDenganRencana(setup);

    const offer = await setup.pemesanan.tawarkanAlternatif(fixture.adminLokasi, {
      nomor: fixture.nomor,
      jenisMakamId: fixture.khana.id,
      pemakamanAt: "2026-10-03T09:00",
    });

    expect(offer).toMatchObject({ ok: true, pesanan: { nomor: fixture.nomor, status: "diajukan" }, alternatif: { total: 8_650_000 } });
    // 6.500.000 Hak Pakai + 2.000.000 Biaya Pemakaman + 150.000 Biaya Layanan Platform,
    // the same three lines a Tagihan for that Jenis Makam would carry.
    expect(offer.ok ? offer.alternatif.lines : []).toEqual([
      { label: "Harga Hak Pakai \u2013 Khana 3 \u00d7 3 m", amount: 6_500_000 },
      { label: "Biaya Pemakaman", amount: 2_000_000 },
      { label: "Biaya Layanan Platform", amount: 150_000 },
    ]);
    // The order page shows the offer with the same total, so the family decides on the real number.
    expect(await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan)).toMatchObject({
      status: "diajukan",
      // What was ordered is untouched until the family answers.
      jenisMakam: { id: fixture.jenisMakam.id },
      rencanaPemakamanAt: wib("2026-10-02 10:00"),
      alternatif: {
        jenisMakam: { id: fixture.khana.id, name: "Khana 3 × 3 m" },
        pemakamanAt: wib("2026-10-03 09:00"),
        total: 8_650_000,
      },
    });
  });

  it("accepts with one tap, moving the order on with the new Jenis Makam and day, and recomputing the confirmation deadline", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDenganRencana(setup);
    await setup.pemesanan.tawarkanAlternatif(fixture.adminLokasi, { nomor: fixture.nomor, jenisMakamId: fixture.khana.id, pemakamanAt: "" });
    // Two hours of the Lokasi's Jam Operasional (07:00–15:00) from the original 09:00 submission: 11:00.
    expect((await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan))?.konfirmasiDueAt).toEqual(wib("2026-10-01 11:00"));

    // The family answers on the next working morning, long past that first deadline.
    setup.clock.set(wib("2026-10-02 08:00"));
    const hasil = await setup.pemesanan.terimaAlternatif(fixture.pemesan, { nomor: fixture.nomor });

    expect(hasil).toMatchObject({ ok: true, pesanan: { nomor: fixture.nomor, status: "diajukan", alasan: null } });
    const order = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    expect(order).toMatchObject({
      status: "diajukan",
      jenisMakam: { id: fixture.khana.id, name: "Khana 3 × 3 m" },
      // Only the Jenis Makam changed here, so the day's plan stands as it was.
      rencanaPemakamanAt: wib("2026-10-02 10:00"),
      alternatif: null,
      // The deadline is counted from the acceptance, never carried over from the
      // day the order was placed: 08:00 + 2 service hours of a 07:00–15:00 day.
      konfirmasiDueAt: wib("2026-10-02 10:00"),
    });
    // The new Jenis Makam really has a plot to assign, which is why the deadline was promised again.
    expect(await setup.inventory.tersediaPerJenisMakam(fixture.lokasiMitra.id)).toEqual(
      expect.arrayContaining([{ jenisMakamId: fixture.khana.id, count: 1 }]),
    );
  });

  it("turns a refused alternative into a Tolak, counted on the Lokasi, with the family's own reason off the list", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDenganRencana(setup);
    await setup.pemesanan.tawarkanAlternatif(fixture.adminLokasi, { nomor: fixture.nomor, jenisMakamId: fixture.khana.id, pemakamanAt: "" });

    const hasil = await setup.pemesanan.tolakAlternatif(fixture.pemesan, { nomor: fixture.nomor });

    // A refusal is a Tolak (AC 7): the same status, the same list of reasons, the
    // same Tier 1 call and the same count — never a status of its own.
    expect(hasil).toMatchObject({ ok: true, pesanan: { nomor: fixture.nomor, status: "ditolak", alasan: "alternatif_ditolak" } });
    expect(await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan)).toMatchObject({
      status: "ditolak",
      alasan: "Keluarga menolak alternatif yang ditawarkan",
      alternatif: null,
    });
    expect(await setup.pemesanan.ditolak(fixture.lokasiMitra.id)).toBe(1);
    expect(setup.ditolak).toHaveLength(1);
    expect(setup.ditolak[0]).toMatchObject({ nomor: fixture.nomor, alasan: "Keluarga menolak alternatif yang ditawarkan" });
    // The Tier 1 call the decline owes is opened exactly as the Lokasi's own Tolak opens it.
    expect(await setup.pemesanan.saatDukaDitolak()).toEqual([expect.objectContaining({ nomor: fixture.nomor })]);
  });

  it("emails the family the alternative with its total, so one tap is possible off the site too", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const fixture = await pesananDenganRencana(setup);

    await setup.pemesanan.tawarkanAlternatif(fixture.adminLokasi, { nomor: fixture.nomor, jenisMakamId: fixture.khana.id, pemakamanAt: "2026-10-03T09:00" });
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const kabar = setup.email.sent.find((message) => message.to === "pemesan@contoh.id" && message.text.includes("Khana 3 × 3 m"));
    expect(kabar?.text).toContain("Total semua biaya: Rp 8.650.000");
    expect(kabar?.text).toContain(`/pesanan/${fixture.nomor}`);
  });

  it("shows the family no total at all once the offer can no longer be priced, and never a free burial", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDenganRencana(setup);
    await setup.pemesanan.tawarkanAlternatif(fixture.adminLokasi, { nomor: fixture.nomor, jenisMakamId: fixture.khana.id, pemakamanAt: "" });

    // The offered Jenis Makam's price goes up the next morning until its all-in
    // total passes the QRIS cap, so `quote()` no longer answers for it: what was
    // on the table an hour ago can no longer be priced.
    setup.clock.set(wib("2026-10-02 08:00"));
    const naik = await setup.tariffs.setJenisMakamTariff(fixture.admin, fixture.khana.id, {
      ...jenisMakamInput().tariff,
      hargaHakPakai: 9_000_000,
      effectiveOn: "2026-10-02",
      reason: "Kenaikan tarif October",
    });
    if (!naik.ok) throw new Error(`tariff refused: ${naik.reason}`);

    const order = await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan);
    // No total is not a total of zero: to a family burying someone, zero reads as
    // a free plot, and the screen would then offer a one tap that is refused.
    expect(order?.alternatif).toMatchObject({ jenisMakam: { id: fixture.khana.id }, total: null, lines: [] });
    expect(order?.alternatif?.total).not.toBe(0);
    // The one tap is refused for the same reason the screen must not show a number.
    expect(await setup.pemesanan.terimaAlternatif(fixture.pemesan, { nomor: fixture.nomor })).toEqual({
      ok: false,
      reason: "harga_tidak_tersedia",
    });
  });

  it("refuses an offer that is neither another Jenis Makam nor another day, and an answer to an order with no offer", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDenganRencana(setup);
    const lain = await terverifikasiLokasi(setup, { name: "Makam Sawah Besar", city: "Kabupaten Bekasi" });

    // Nothing different offered at all.
    expect(await setup.pemesanan.tawarkanAlternatif(fixture.adminLokasi, { nomor: fixture.nomor, jenisMakamId: "", pemakamanAt: "" })).toEqual({
      ok: false,
      reason: "alternatif_kosong",
    });
    // The same day the order already plans is not an alternative.
    expect(
      await setup.pemesanan.tawarkanAlternatif(fixture.adminLokasi, { nomor: fixture.nomor, jenisMakamId: "", pemakamanAt: "2026-10-02T10:00" }),
    ).toEqual({ ok: false, reason: "alternatif_kosong" });
    // A Jenis Makam of another Lokasi Mitra is not this order's to change to.
    expect(
      await setup.pemesanan.tawarkanAlternatif(fixture.adminLokasi, { nomor: fixture.nomor, jenisMakamId: "9f0ff812-a323-49c3-a434-33b1bb2e3fff", pemakamanAt: "" }),
    ).toEqual({ ok: false, reason: "jenis_makam_tidak_ditemukan" });
    // Admin Platform and another Lokasi's Admin Lokasi may not answer for it either.
    expect(
      await setup.pemesanan.tawarkanAlternatif(fixture.admin, { nomor: fixture.nomor, jenisMakamId: fixture.khana.id, pemakamanAt: "" }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(
      await setup.pemesanan.tawarkanAlternatif(lain.adminLokasi, { nomor: fixture.nomor, jenisMakamId: fixture.khana.id, pemakamanAt: "" }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });

    // Nothing was written by any refusal, so the order is untouched.
    expect(await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan)).toMatchObject({ status: "diajukan", jenisMakam: { id: fixture.jenisMakam.id }, alternatif: null });

    // With no offer on the table there is nothing to accept or refuse.
    expect(await setup.pemesanan.terimaAlternatif(fixture.pemesan, { nomor: fixture.nomor })).toEqual({ ok: false, reason: "tidak_ada_alternatif" });
    expect(await setup.pemesanan.tolakAlternatif(fixture.pemesan, { nomor: fixture.nomor })).toEqual({ ok: false, reason: "tidak_ada_alternatif" });
  });

  it("answers only the family's own order, and only while it is still waiting", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananDenganRencana(setup);
    const lain = await saatDukaFixture(setup, { email: "keluarga.lain@contoh.id" });
    const placedLain = await setup.pemesanan.placeSaatDuka(orderSaatDuka(lain));
    if (!placedLain.ok) throw new Error(`order refused: ${placedLain.reason}`);
    await setup.pemesanan.tawarkanAlternatif(fixture.adminLokasi, { nomor: fixture.nomor, jenisMakamId: fixture.khana.id, pemakamanAt: "" });

    // Another Akun may not answer for this family.
    expect(await setup.pemesanan.terimaAlternatif(lain.pemesan, { nomor: fixture.nomor })).toEqual({ ok: false, reason: "pesanan_tidak_ditemukan" });
    expect(await setup.pemesanan.tolakAlternatif(lain.pemesan, { nomor: fixture.nomor })).toEqual({ ok: false, reason: "pesanan_tidak_ditemukan" });
    // A Terencana order of the same family is not an alternative's subject either.
    expect(await setup.pemesanan.terimaAlternatif(fixture.pemesan, { nomor: "MKM-2026-999999" })).toEqual({ ok: false, reason: "pesanan_tidak_ditemukan" });

    expect((await setup.pemesanan.terimaAlternatif(fixture.pemesan, { nomor: fixture.nomor })).ok).toBe(true);
    // Answered once: there is no second answer to give.
    expect(await setup.pemesanan.terimaAlternatif(fixture.pemesan, { nomor: fixture.nomor })).toEqual({ ok: false, reason: "tidak_ada_alternatif" });
    expect(await setup.pemesanan.tolakAlternatif(fixture.pemesan, { nomor: fixture.nomor })).toEqual({ ok: false, reason: "tidak_ada_alternatif" });
    // The other family's order is untouched by any of it.
    expect(await setup.pemesanan.orderOf(placedLain.pemesanan.nomor, lain.pemesan)).toMatchObject({ status: "diajukan", alternatif: null });
  });
});

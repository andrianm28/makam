/**
 * Cancelling a Saat Duka order (spec, story 34; Pemesanan > Saat Duka: "Cancelling
 * means Hak Pakai Dibatalkan, Petak Tersedia, and hari-H Layanan refunded unless
 * already Sedang Dikerjakan. No cancellation fee."; ticket 24's AC 5, 6 and 7).
 *
 * The two cases are the whole of the feature and they are nothing alike:
 *
 * - **Before the confirmation** nothing has been billed and nothing is held, so
 *   the order becomes Dibatalkan and that is all. "Nothing billed" is proved by
 *   the document series: a Tagihan takes a `TGH` number, so a number that starts
 *   again at 000001 is a Tagihan that was never issued.
 * - **After it** the cancellation gives back a right and takes back a bill, and
 *   all of it in one commit: order Dibatalkan, Hak Pakai Dibatalkan, Petak back
 *   on the Lokasi's list as Tersedia, Tagihan Dibatalkan — and any money that had
 *   come in recorded for refund, less the Biaya Layanan Platform, which is never
 *   refunded. Four writes that must not be able to happen apart are the reason
 *   this is one transaction rather than four calls in a row.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { orderSaatDuka, pemesanDenganEmail, pemesananOnTestDatabase, siapkanOperatorPemesanan, saatDukaFixture, terverifikasiLokasi, type PemesananSetup } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** One placed Saat Duka order waiting for its Lokasi, its Admin Lokasi and a cleared Petak to confirm. */
async function pesananMenunggu(setup: PemesananSetup) {
  const fixture = await saatDukaFixture(setup);
  const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  if (!blok) throw new Error("no Blok");
  const cells = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id)).filter((cell) => cell.kind === "petak");
  return { ...fixture, nomor: placed.pemesanan.nomor, petakId: cells[0]!.id };
}

/** That order confirmed at the first cleared Petak, as the Admin Lokasi does it. */
async function terkonfirmasi(setup: PemesananSetup, options: { bayar?: boolean } = {}) {
  const fixture = await pesananMenunggu(setup);
  await siapkanOperatorPemesanan(setup);
  const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
    nomor: fixture.nomor,
    petakId: fixture.petakId,
    pemakamanAt: "2026-10-02T10:00",
  });
  if (!hasil.ok) throw new Error(`confirmation refused: ${hasil.reason}`);
  // The order names its own Tagihan, which is where a caller reads the id from.
  const tagihanId = (await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan))?.tagihanId;
  if (!tagihanId) throw new Error("the confirmed order names no Tagihan");
  let tagihan = await setup.billing.tagihan(tagihanId);
  if (!tagihan) throw new Error("no Tagihan");
  if (options.bayar) {
    const bayar = await setup.billing.recordPayment(tagihanId, { method: { kind: "transfer_manual" }, reference: "TRF-1" });
    if (!bayar.ok) throw new Error(`payment refused: ${bayar.reason}`);
    tagihan = (await setup.billing.tagihan(tagihanId)) ?? tagihan;
  }
  return { ...fixture, tagihan, tagihanId };
}

describe("cancelling a Saat Duka order before it is confirmed", () => {
  it("makes the order Dibatalkan and bills nothing at all", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananMenunggu(setup);

    // Pengaturan Operator is in place, so a Tagihan *could* be issued: the test
    // that follows confirms an order and finds one in the same series.
    await siapkanOperatorPemesanan(setup);

    const hasil = await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "Keluarga berubah pikiran" });

    expect(hasil).toMatchObject({ ok: true, pesanan: { nomor: fixture.nomor, status: "dibatalkan" }, tagihan: null, petak: null });
    expect(await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan)).toMatchObject({
      status: "dibatalkan",
      alasan: "Keluarga berubah pikiran",
      tagihanId: null,
      pemakaman: null,
    });
    // Not one Tagihan was issued: the TGH series still starts at 1, where a
    // confirmation would have taken 000001 for itself.
    expect(await setup.billing.nextDocumentNumber("TGH")).toBe("TGH/2026/000001");
    // And no plot was ever held, so the Lokasi's list is exactly as it was.
    expect(await setup.inventory.tersediaPerJenisMakam(fixture.lokasiMitra.id)).toEqual([{ jenisMakamId: fixture.jenisMakam.id, count: 4 }]);
  });

  it("needs no reason before the confirmation, and closes the order's own work rows", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananMenunggu(setup);

    expect((await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "" })).ok).toBe(true);
    expect(await setup.pemesanan.antreanKonfirmasi(fixture.lokasiMitra.id)).toEqual([]);
    expect(await setup.pemesanan.saatDukaDitolak()).toEqual([]);
    expect(await setup.pemesanan.ditolak(fixture.lokasiMitra.id)).toBe(0);
  });

  it("refuses another family's order, an unknown order, and an order that has already ended", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananMenunggu(setup);
    const lain = await saatDukaFixture(setup, { email: "keluarga.lain@contoh.id" });

    expect(await setup.pemesanan.batalkanSaatDuka(lain.pemesan, { nomor: fixture.nomor, alasan: "" })).toEqual({
      ok: false,
      reason: "pesanan_tidak_ditemukan",
    });
    expect(await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: "MKM-2026-999999", alasan: "" })).toEqual({
      ok: false,
      reason: "pesanan_tidak_ditemukan",
    });
    // A second cancellation of the same order changes nothing.
    expect((await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "" })).ok).toBe(true);
    expect(await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "" })).toEqual({
      ok: false,
      reason: "pesanan_sudah_ditutup",
    });
  });
});

describe("cancelling a Saat Duka order after it is confirmed", () => {
  it("in one step: the order Dibatalkan, the Hak Pakai Dibatalkan, the Petak Tersedia again and the Tagihan Dibatalkan", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await terkonfirmasi(setup);

    // Before: the plot is taken, the right is active, the Tagihan is open.
    expect(await setup.inventory.tersediaPerJenisMakam(fixture.lokasiMitra.id)).toEqual([{ jenisMakamId: fixture.jenisMakam.id, count: 3 }]);
    expect(await setup.inventory.asStaff(fixture.adminLokasi).hakPakaiOfPetak(fixture.lokasiMitra.id, fixture.petakId)).toMatchObject({ status: "aktif" });
    expect(fixture.tagihan.status).toBe("belum_dibayar");

    const hasil = await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "Keluarga memutuskan menunda" });

    expect(hasil).toMatchObject({
      ok: true,
      pesanan: { nomor: fixture.nomor, status: "dibatalkan" },
      tagihan: { nomorTagihan: fixture.tagihan.nomorTagihan, dibatalkan: true, jumlahDikembalikan: 0 },
      petak: { nomor: "A-01" },
    });
    expect(await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan)).toMatchObject({
      status: "dibatalkan",
      // The reason in the family's own words: a cancellation is not a Tolak and
      // borrows nothing from its closed list.
      alasan: "Keluarga memutuskan menunda",
    });
    // The right is given back and the plot is sellable again, not merely unsold.
    expect(await setup.inventory.asStaff(fixture.adminLokasi).hakPakaiOfPetak(fixture.lokasiMitra.id, fixture.petakId)).toMatchObject({
      status: "dibatalkan",
    });
    expect(await setup.inventory.tersediaPerJenisMakam(fixture.lokasiMitra.id)).toEqual([{ jenisMakamId: fixture.jenisMakam.id, count: 4 }]);
    expect((await setup.inventory.tersediaUntukJenisMakam(fixture.lokasiMitra.id, fixture.jenisMakam.id)).map((unit) => unit.petakId)).toContain(
      fixture.petakId,
    );
    // The bill is cancelled with the order, so the Operator chases nobody.
    expect(await setup.billing.tagihan(fixture.tagihan.id)).toMatchObject({ status: "dibatalkan", cancelledReason: "pemesanan_dibatalkan" });
  });

  it("gives the plot to the next family: a released Petak is sellable again, not merely free on paper", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await terkonfirmasi(setup);
    expect((await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "Batal" })).ok).toBe(true);

    // The same Blok, the same Petak: the next family's order takes it.
    const kedua = await pemesanDenganEmail(setup, "pemesan.kedua@contoh.id", "Dewi Lestari");
    const placed = await setup.pemesanan.placeSaatDuka({
      ...orderSaatDuka(fixture),
      pemesan: kedua.pemesan,
      pemesanName: "Dewi Lestari",
      almarhumName: "Ahmad Taufik",
    });
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    const konfirmasi = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
      nomor: placed.pemesanan.nomor,
      petakId: fixture.petakId,
      pemakamanAt: "2026-10-06T09:00",
    });

    expect(konfirmasi).toMatchObject({ ok: true, pesanan: { petakNomor: "A-01" } });
    // And the first family's cancelled right is still there to be read, as a record.
    expect(await setup.inventory.asStaff(fixture.adminLokasi).hakPakaiOfPetak(fixture.lokasiMitra.id, fixture.petakId)).toMatchObject({
      pemegangHak: { name: "Budi Santoso" },
    });
  });

  it("records a refund for money that had come in, less the Biaya Layanan Platform, and nothing when none had", async () => {
    const setup = pemesananOnTestDatabase(db);
    const sudahBayar = await terkonfirmasi(setup, { bayar: true });
    const belumBayar = await terkonfirmasi(setup);

    expect((await setup.pemesanan.batalkanSaatDuka(sudahBayar.pemesan, { nomor: sudahBayar.nomor, alasan: "Batal" })).ok).toBe(true);
    expect((await setup.pemesanan.batalkanSaatDuka(belumBayar.pemesan, { nomor: belumBayar.nomor, alasan: "Batal" })).ok).toBe(true);

    // 9.650.000 paid, of which the 150.000 Biaya Layanan Platform is never refunded.
    const dibayar = await setup.billing.tagihan(sudahBayar.tagihan.id);
    expect(dibayar).toMatchObject({
      status: "dibatalkan",
      pengembalianDiminta: { jumlah: 9_500_000 },
    });
    // No money in, nothing to give back: the request is not invented.
    expect(await setup.billing.tagihan(belumBayar.tagihan.id)).toMatchObject({ status: "dibatalkan", pengembalianDiminta: null });
  });

  it("needs a reason once it is confirmed, and refuses it without touching the plot, the right or the Tagihan", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await terkonfirmasi(setup);

    expect(await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "   " })).toEqual({
      ok: false,
      reason: "alasan_wajib",
    });
    // Every one of the four things the cancellation does is untouched by the refusal.
    expect(await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan)).toMatchObject({ status: "dikonfirmasi" });
    expect(await setup.inventory.asStaff(fixture.adminLokasi).hakPakaiOfPetak(fixture.lokasiMitra.id, fixture.petakId)).toMatchObject({ status: "aktif" });
    expect(await setup.inventory.tersediaPerJenisMakam(fixture.lokasiMitra.id)).toEqual([{ jenisMakamId: fixture.jenisMakam.id, count: 3 }]);
    expect(await setup.billing.tagihan(fixture.tagihan.id)).toMatchObject({ status: "belum_dibayar" });
  });

  it("rolls the whole cancellation back when a refusal comes after a write, leaving the plot held and the order truthful", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await terkonfirmasi(setup, { bayar: true });

    // The bill is cancelled first, on its own, through Billing's own door — the
    // only module that may cancel a Tagihan. That is how the one failure this
    // ticket can produce *after* a write has already happened is arranged: by the
    // time the cancellation asks for the Tagihan, the Hak Pakai has been given
    // back inside its transaction. (Once ticket 25 lets a pay-after Tagihan be
    // cancelled on its own, this stops being a construction and becomes a race.)
    const lebihDulu = await setup.billing.batalkanTagihan(fixture.tagihan.id, { alasan: "pemesanan_dibatalkan" });
    if (!lebihDulu.ok) throw new Error(`Tagihan refused: ${lebihDulu.reason}`);

    const hasil = await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "Keluarga memutuskan menunda" });

    expect(hasil).toEqual({ ok: false, reason: "tagihan_sudah_dibatalkan" });
    // The write that had already happened is gone. Written one after another, the
    // right would read Dibatalkan, the plot would read Tersedia, and the order
    // would still be Dikonfirmasi — a plot on sale over a family that was told it
    // still held one. Nothing of the cancellation is kept.
    expect(await setup.inventory.asStaff(fixture.adminLokasi).hakPakaiOfPetak(fixture.lokasiMitra.id, fixture.petakId)).toMatchObject({
      status: "aktif",
      pemegangHak: { name: "Budi Santoso" },
    });
    expect(await setup.inventory.tersediaPerJenisMakam(fixture.lokasiMitra.id)).toEqual([{ jenisMakamId: fixture.jenisMakam.id, count: 3 }]);
    expect(await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan)).toMatchObject({ status: "dikonfirmasi", alasan: null });
    // And the family was told nothing about a cancellation that did not happen.
    expect(setup.dibatalkan).toEqual([]);
  });

  it("lets the Admin Lokasi record it on the family's behalf, and no other Lokasi's or Admin Platform's", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await terkonfirmasi(setup);
    const lain = await terverifikasiLokasi(setup, { name: "Makam Sawah Besar", city: "Kabupaten Bekasi" });

    expect(
      await setup.pemesanan.batalkanUntukPemesan(lain.adminLokasi, { nomor: fixture.nomor, alasan: "Keluarga minta batal" }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.pemesanan.batalkanUntukPemesan(fixture.admin, { nomor: fixture.nomor, alasan: "Keluarga minta batal" })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    // The refusals changed nothing at all.
    expect(await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan)).toMatchObject({ status: "dikonfirmasi" });

    const hasil = await setup.pemesanan.batalkanUntukPemesan(fixture.adminLokasi, { nomor: fixture.nomor, alasan: "Keluarga minta batal lewat telepon" });

    expect(hasil).toMatchObject({ ok: true, pesanan: { status: "dibatalkan" } });
    expect(await setup.pemesanan.orderOf(fixture.nomor, fixture.pemesan)).toMatchObject({ alasan: "Keluarga minta batal lewat telepon" });
    // The family is told, and told that the Lokasi recorded it.
    expect(setup.dibatalkan).toEqual([
      expect.objectContaining({ nomor: fixture.nomor, olehLokasi: true, alasan: "Keluarga minta batal lewat telepon" }),
    ]);
  });

  it("emails the family what was given back, and that no cancellation fee is charged", async () => {
    const setup = pemesananOnTestDatabase(db, { notifications: true });
    const fixture = await terkonfirmasi(setup, { bayar: true });

    await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "Batal, dana digunakan untuk anggota keluarga lain" });
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    const kabar = setup.email.sent.find((message) => message.to === "pemesan@contoh.id" && message.text.includes("dibatalkan"));
    expect(kabar?.text).toContain("A-01");
    expect(kabar?.text).toContain("Rp 9.500.000");
    expect(kabar?.text).toContain("Tidak ada biaya pembatalan");
  });
});

/**
 * The Lokasi Mitra's answer to a Pemesanan Terencana, and what the answer is worth
 * (spec, Pemesanan > Terencana; ticket 37's AC 1, 2, 5, 6).
 *
 * Every transition is driven through the module's public functions and read back
 * through them — the family's own `terencanaOf`, the Denah's own read of whether a
 * plot is still held, and the neighbour modules' own reads for what the answer made
 * (a Tagihan, a Hak Pakai, a Bukti Pemesanan, a queue row, a family message). Nothing
 * here asserts on a table layout or a private helper, and the Clock is the fake one, so
 * every deadline below is proved by moving time.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { pemesananOnTestDatabase, siapkanOperatorPemesanan, type PemesananSetup } from "../../../tests/support/pemesanan";
import { signedInAdminPlatform } from "../../../tests/support/publish";
import { terencanaLokasi, type TerencanaLokasi, type TerencanaOptions } from "../../../tests/support/terencana";
import { pemesanDenganEmail } from "../../../tests/support/pemesanan";
import { unitIds } from "../../../tests/support/pemesanan";
import { lapsePayFirstTagihanTick } from "@/domain/billing";
import { formatWib } from "@/lib/time/jakarta";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** What the wizard's Kirim sends: a family planning a grave for a named Calon Penghuni. */
const kirim = {
  pemesanName: "Rina Wulandari",
  phoneNumber: "081234567890",
  pemegangHak: { mode: "pemesan" as const },
  calonPenghuni: { mode: "lain" as const, name: "Neneng Sutrisno" },
};

type Siap = Awaited<ReturnType<typeof siap>>;

/**
 * A Terencana-ready Lokasi Mitra with its own Admin Lokasi, a Pemesan with an Akun, and
 * Pengaturan Operator entered (a Tagihan cannot be issued without the Operator's header).
 * It returns the setup itself beside those three, so a test drives the module as
 * `setup.pemesanan` and names the Lokasi as `fixture` — the same shape every other
 * fixture in this tree has.
 */
async function siap(setup: PemesananSetup, options: TerencanaOptions = {}) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const fixture = await terencanaLokasi(setup, admin, options);
  await siapkanOperatorPemesanan(setup);
  const { pemesan } = await pemesanDenganEmail(setup, "kelarga.terencana@contoh.id");
  return { ...setup, admin, fixture, pemesan };
}

/** Places an order for the named plots, as the wizard's Kirim does. */
async function pesan(setup: Siap, nomor: readonly string[] = ["A-01", "A-02"]) {
  const semua = await unitIds(setup, setup.fixture, nomor);
  const hasil = await setup.pemesanan.placeTerencana({
    ...kirim,
    pemesan: siap.pemesan,
    lokasiId: setup.fixture.lokasiMitra.id,
    units: nomor.map((satu) => ({ petakId: semua[satu]! })),
  });
  if (!hasil.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(hasil)}`);
  return { order: hasil.pemesanan, semua };
}

/** What the Denah says about each plot: is it still pickable, held, or sold. */
async function statusPlot(setup: PemesananSetup, fixture: TerencanaLokasi, nomor: readonly string[]) {
  const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
  const cell = (satu: string) => denah?.bloks.flatMap((blok) => blok.cells).find((satu2) => satu2.nomorMakam === satu)?.status ?? null;
  return nomor.map(cell);
}

describe("a Pemesanan Terencana waits for the Lokasi's answer", () => {
  it("is promised a confirmation by the end of the Lokasi's next working day, counted on its own calendar", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    // The fake Clock sits inside the Lokasi's Jam Operasional (Thursday 09:00 WIB), and
    // its next working day is Friday: the end of that day, not 24 h from now and not
    // the end of today.
    const { order } = await pesan(siap);

    const tercatat = await setup.pemesanan.terencanaOf(order.nomor, pemesan);
    expect(tercatat?.konfirmasiDueAt?.toISOString()).toBe("2026-10-02T07:00:00.000Z");
    expect(formatWib(tercatat!.konfirmasiDueAt!)).toBe("02/10/2026 15.00.00 WIB");
  });

  it("shows up in the Lokasi's Konfirmasi Terencana row and closes itself when it is answered", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);

    const menunggu = await setup.pemesanan.antreanKonfirmasiTerencana(fixture.lokasiMitra.id);
    expect(menunggu).toHaveLength(1);
    expect(menunggu[0]).toMatchObject({
      nomor: order.nomor,
      unit: [
        { jenis: "petak", nomor: "A-01" },
        { jenis: "petak", nomor: "A-02" },
      ],
      calon: { name: "Neneng Sutrisno" },
    });

    const konfirmasi = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: order.nomor });
    expect(konfirmasi.ok).toBe(true);
    expect(await setup.pemesanan.antreanKonfirmasiTerencana(fixture.lokasiMitra.id)).toEqual([]);
  });

  it("raises a Tier 3 row for Admin Platform once it is late, and cancels nothing", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);

    // Before the deadline: no late row at all.
    expect(await setup.pemesanan.konfirmasiTerencanaTerlambat()).toEqual([]);
    setup.clock.advance({ hours: 30 });

    const lewat = await setup.pemesanan.konfirmasiTerencanaTerlambat();
    expect(lewat.map((satu) => satu.nomor)).toEqual([order.nomor]);
    // Late is not cancelled: the plots stay held and the order stays Diajukan, because a
    // Terencairan has no automatic cancel (spec, Pemesanan > Terencana).
    expect((await setup.pemesanan.terencanaOf(order.nomor, pemesan))?.status).toBe("diajukan");
    expect(await statusPlot(setup, fixture, ["A-01", "A-02"])).toEqual(["sedang_dipesan", "sedang_dipesan"]);

    // And the row closes the moment the Lokasi answers.
    await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: order.nomor });
    expect(await setup.pemesanan.konfirmasiTerencanaTerlambat()).toEqual([]);
  });

  it("may only be answered by that Lokasi's own Admin Lokasi", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);
    // Admin Platform may chase the Lokasi by phone (the Tier 3 row) but never answer
    // for it, so its confirmation is refused and the order is untouched.
    const ditolak = await setup.pemesanan.tolakTerencana(fixture.admin, { nomor: order.nomor, alasan: "Tidak jadi" });
    expect(ditolak).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect((await setup.pemesanan.terencanaOf(order.nomor, pemesan))?.status).toBe("diajukan");
  });
});

describe("confirming a Pemesanan Terencana", () => {
  it("issues a pay-first Tagihan due when the payment hold ends, and grants no Hak Pakai yet", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);

    const hasil = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: order.nomor });
    if (!hasil.ok) throw new Error(`konfirmasi refused: ${JSON.stringify(hasil)}`);

    // Pay-first, due 24 h from the confirmation (the Lokasi's own policy), which is not
    // the confirmation deadline and not the submission.
    const tagihan = await setup.billing.tagihan(hasil.tagihan!.id);
    expect(tagihan).toMatchObject({ kind: "pay_first", status: "belum_dibayar", total: 2 * 2_500_000 + 150_000 });
    expect(tagihan?.dueAt.toISOString()).toBe("2026-10-02T02:00:00.000Z");
    // One Harga Hak Pakai line per chosen plot, naming the plot, and one platform fee.
    expect(tagihan?.lines.map((line) => line.label)).toEqual([
      "Harga Hak Pakai – Reguler 2 × 1 m A-01",
      "Harga Hak Pakai – Reguler 2 × 1 m A-02",
      "Biaya Layanan Platform",
    ]);
    // The right is granted on payment, not on confirmation: the Denah still shows them held.
    expect(await statusPlot(setup, fixture, ["A-01", "A-02"])).toEqual(["sedang_dipesan", "sedang_dipesan"]);
    expect((await setup.pemesanan.terencanaOf(order.nomor, pemesan))?.status).toBe("dikonfirmasi");
  });

  it("counts the hold from the confirmation, on the Lokasi's own hold policy", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    // A second Lokasi Mitra, with a shorter hold than the 24 h default, confirmed six
    // hours after its order was placed.
    const cepat = await terencanaLokasi(setup, fixture.admin, { name: "Makam Hold Pendek" });
    const semua = await unitIds(siap, cepat, ["A-01"]);
    setup.clock.advance({ hours: 6 });
    const hasil = await setup.pemesanan.placeTerencana({
      ...kirim,
      pemesan: siap.pemesan,
      lokasiId: cepat.lokasiMitra.id,
      units: [{ petakId: semua["A-01"]! }],
    });
    if (!hasil.ok) throw new Error(`placeTerencana refused: ${JSON.stringify(hasil)}`);
    const konfirmasi = await setup.pemesanan.konfirmasiTerencana(cepat.adminLokasi, { nomor: hasil.pemesanan.nomor });
    if (!konfirmasi.ok) throw new Error("konfirmasi refused");

    // The hold runs from the **confirmation** (15:00 WIB), not from the submission six
    // hours earlier and not from the confirmation deadline, so the Tagihan is due exactly
    // 24 h after this confirmation.
    const tagihan = await setup.billing.tagihan(konfirmasi.tagihan!.id);
    expect(tagihan?.dueAt.toISOString()).toBe("2026-10-02T08:00:00.000Z");
  });

  it("refuses a second confirmation, and leaves the first Tagihan standing", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);
    const pertama = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: order.nomor });
    if (!pertama.ok) throw new Error("konfirmasi refused");

    const kedua = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: order.nomor });
    expect(kedua).toEqual({ ok: false, reason: "pesanan_sudah_ditutup" });
    expect(await setup.pemesanan.terencanaOf(order.nomor, pemesan)).toMatchObject({ status: "dikonfirmasi" });
    // One Tagihan, not two: the refused confirmation wrote nothing.
    expect((await setup.billing.tagihan(pertama.tagihan!.id))?.nomorTagihan).toBe("TGH/2026/000001");
  });

  it("tells the family what to pay, and queues the one reminder the Terencairan rule has", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);

    const hasil = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: order.nomor });
    if (!hasil.ok) throw new Error("konfirmasi refused");

    expect(setup.terencana.at(-1)).toMatchObject({
      event: "dikonfirmasi",
      nomor: order.nomor,
      unit: [
        { jenis: "petak", nomor: "A-01" },
        { jenis: "petak", nomor: "A-02" },
      ],
      calon: { name: "Neneng Sutrisno" },
    });
    expect(setup.tagihanTerbit.at(-1)).toMatchObject({
      nomorTagihan: hasil.tagihan!.nomorTagihan,
      nomorPemesanan: order.nomor,
      email: pemesan.email,
    });
  });
});

describe("declining a Pemesanan Terencana", () => {
  it("makes it Ditolak with the reason, releases its plots, and tells the family", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);

    const hasil = await setup.pemesanan.tolakTerencana(fixture.adminLokasi, { nomor: order.nomor, alasan: "Blok itu sedang dirapikan" });
    if (!hasil.ok) throw new Error(`tolak refused: ${JSON.stringify(hasil)}`);

    expect(hasil).toMatchObject({ status: "ditolak", plotsDirilis: 2, tagihan: null });
    expect(await setup.pemesanan.terencanaOf(order.nomor, pemesan)).toMatchObject({
      status: "ditolak",
      alasan: "Blok itu sedang dirapikan",
      // The Pemesan is sent back to the wizard's Lokasi step to pick again (story 49),
      // which the announcement is what tells them; nothing was billed either way.
      tagihanId: null,
    });
    // The plots are free for another family: the hold went with the decline.
    expect(await statusPlot(setup, fixture, ["A-01", "A-02"])).toEqual(["bisa_dipilih", "bisa_dipilih"]);
    expect(setup.terencana.at(-1)).toMatchObject({ event: "ditolak", nomor: order.nomor, alasan: "Blok itu sedang dirapikan" });
    // No Tagihan was ever issued, so there is nothing to cancel and nothing to pay.
    expect(setup.tagihanTerbit).toEqual([]);
  });

  it("refuses to decline an order that has already been answered", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);
    await setup.pemesanan.tolakTerencana(fixture.adminLokasi, { nomor: order.nomor, alasan: "Tidak jadi" });

    expect(await setup.pemesanan.tolakTerencana(fixture.adminLokasi, { nomor: order.nomor, alasan: "Berubah pikiran" })).toEqual({
      ok: false,
      reason: "pesanan_sudah_ditutup",
    });
  });
});

describe("withdrawing a Pemesanan Terencana before paying", () => {
  it("makes it Dibatalkan, releases its plots and charges nothing", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);

    const hasil = await setup.pemesanan.tarikTerencana(pemesan, { nomor: order.nomor });
    if (!hasil.ok) throw new Error(`tarik refused: ${JSON.stringify(hasil)}`);

    expect(hasil).toMatchObject({ status: "dibatalkan", plotsDirilis: 2, tagihan: null });
    expect(await setup.pemesanan.terencanaOf(order.nomor, pemesan)).toMatchObject({ status: "dibatalkan", tagihanId: null });
    expect(await statusPlot(setup, fixture, ["A-01", "A-02"])).toEqual(["bisa_dipilih", "bisa_dipilih"]);
    expect(setup.terencana.at(-1)).toMatchObject({ event: "dibatalkan", nomor: order.nomor });
    // Nothing was charged: no Tagihan was issued before the confirmation, so there is
    // nothing to void and no money to return.
    expect(setup.tagihanTerbit).toEqual([]);
  });

  it("voids the Tagihan when the Lokasi had already confirmed, so nothing is left payable", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);
    const konfirmasi = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: order.nomor });
    if (!konfirmasi.ok) throw new Error("konfirmasi refused");

    const hasil = await setup.pemesanan.tarikTerencana(pemesan, { nomor: order.nomor });
    if (!hasil.ok) throw new Error(`tarik refused: ${JSON.stringify(hasil)}`);

    expect(hasil.plotsDirilis).toBe(2);
    const tagihan = await setup.billing.tagihan(konfirmasi.tagihan!.id);
    expect(tagihan).toMatchObject({ status: "dibatalkan", cancelledReason: "dibatalkan_pemesan" });
    expect(await statusPlot(setup, fixture, ["A-01", "A-02"])).toEqual(["bisa_dipilih", "bisa_dipilih"]);
  });

  it("is nobody else's order to withdraw, and is refused once the money is in", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);
    const lain = (await pemesanDenganEmail(setup, "orang.lain@contoh.id")).pemesan;

    expect(await setup.pemesanan.tarikTerencana(lain, { nomor: order.nomor })).toEqual({ ok: false, reason: "pesanan_tidak_ditemukan" });
    // A paid order is a Pembatalan (ticket 38), which the refund rules own; a withdrawal
    // never touches it.
    const konfirmasi = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: order.nomor });
    if (!konfirmasi.ok) throw new Error("konfirmasi refused");
    const dibayar = await setup.billing.recordPayment(konfirmasi.tagihan!.id, {
      method: { kind: "penyedia_pembayaran", channel: "QRIS" },
      reference: null,
    });
    if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
    await setup.pemesanan.tickTerencanaDibayar();

    expect(await setup.pemesanan.tarikTerencana(pemesan, { nomor: order.nomor })).toEqual({ ok: false, reason: "sudah_dibayar" });
  });
});

describe("a payment hold that runs out", () => {
  it("lapses the Tagihan at its due date and then cancels the order, releasing the plots", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);
    const konfirmasi = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: order.nomor });
    if (!konfirmasi.ok) throw new Error("konfirmasi refused");
    const tagihan = await setup.billing.tagihan(konfirmasi.tagihan!.id);

    // One minute before the hold ends, nothing has happened: Billing's own lapse tick
    // and this order's own tick both find nothing, and the order keeps its plots.
    setup.clock.set(new Date(tagihan!.dueAt.getTime() - 60_000));
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());
    expect(await setup.pemesanan.tickTerencanaLapsed()).toEqual({ dibatalkan: 0, plotsDirilis: 0 });
    expect((await setup.pemesanan.terencanaOf(order.nomor, pemesan))?.status).toBe("dikonfirmasi");

    // At the due date the Tagihan lapses (Billing's tick) and the order follows it into
    // Dibatalkan with the spec's own reason, giving its plots back.
    setup.clock.set(tagihan!.dueAt);
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());
    expect(await setup.billing.tagihan(konfirmasi.tagihan!.id)).toMatchObject({
      status: "dibatalkan",
      cancelledReason: "batas_pembayaran_lewat",
    });
    expect(await setup.pemesanan.tickTerencanaLapsed()).toEqual({ dibatalkan: 1, plotsDirilis: 2 });
    expect(await setup.pemesanan.terencanaOf(order.nomor, pemesan)).toMatchObject({
      status: "dibatalkan",
      alasan: "batas pembayaran lewat",
    });
    expect(await statusPlot(setup, fixture, ["A-01", "A-02"])).toEqual(["bisa_dipilih", "bisa_dipilih"]);
  });

  it("is idempotent: a second run releases nothing, and the plots stay free exactly once", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);
    const konfirmasi = await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: order.nomor });
    if (!konfirmasi.ok) throw new Error("konfirmasi refused");
    const tagihan = await setup.billing.tagihan(konfirmasi.tagihan!.id);
    setup.clock.set(new Date(tagihan!.dueAt.getTime() + 60_000));
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());

    // Two workers at once, then a third run: only the first has work, and the guard on
    // the order's own status is what stops the others.
    const [a, b] = await Promise.all([setup.pemesanan.tickTerencanaLapsed(), setup.pemesanan.tickTerencanaLapsed()]);
    expect(a.dibatalkan + b.dibatalkan).toBe(1);
    expect(a.plotsDirilis + b.plotsDirilis).toBe(2);
    expect(await setup.pemesanan.tickTerencanaLapsed()).toEqual({ dibatalkan: 0, plotsDirilis: 0 });
    expect(await statusPlot(setup, fixture, ["A-01", "A-02"])).toEqual(["bisa_dipilih", "bisa_dipilih"]);
  });

  it("leaves an order alone while its Tagihan is still payable, however late the confirmation was", async () => {
    const setup = pemesananOnTestDatabase(db);
    const { fixture, pemesan } = await siap(setup);
    const { order } = await pesan(siap);
    await setup.pemesanan.konfirmasiTerencana(fixture.adminLokasi, { nomor: order.nomor });
    // A day of "the worker was down": the hold is long over, and nothing has paid.
    setup.clock.advance({ hours: 48 });

    // The lapse happens in Billing's own tick, which is the only thing that can cancel a
    // Tagihan; before it runs, this tick finds a Tagihan that is still Belum Dibayar and
    // leaves the order alone. Reading the Tagihan rather than a return value is what
    // makes the two halves independent of each other's order.
    expect(await setup.pemesanan.tickTerencanaLapsed()).toEqual({ dibatalkan: 0, plotsDirilis: 0 });
    expect((await setup.pemesanan.terencanaOf(order.nomor, pemesan))?.status).toBe("dikonfirmasi");
  });
});

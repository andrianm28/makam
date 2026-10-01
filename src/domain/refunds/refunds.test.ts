/**
 * Refunds end to end (spec, Billing > Refunds; Work Queues > Tier 3 "refund
 * transfers"; ticket 31's ACs), driven only through the public interfaces of
 * Refunds, Billing, Payouts and Pemesanan.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/domain/identity";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  bayarTagihan,
  catatPemakaman,
  konfirmasiPesanan,
  pesananSaatDukaSiap,
} from "../../../tests/support/payouts";
import { buktiTransfer, refundsOnTestDatabase, type RefundsSetup } from "../../../tests/support/refunds";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The signed-in Pemesan of a fixture's order, as the guard would hand it to the module. */
function pemesanActor(pemesan: { accountId: string; email: string }): Actor {
  return { ...pemesan, phoneNumber: null, roles: ["pemesan"], lokasiIds: [], totp: "tidak_perlu", sessionId: "sesi-uji" };
}

const pemakaman = wib("2026-10-02 10:00");
const hariTransfer = "2026-10-01";
const rekening = { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Budi Santoso" };

/** A confirmed, paid Saat Duka order, still before its burial (a Saat Duka cancellation's own boundary, ticket 24). */
async function pesananTerbayar(setup: RefundsSetup) {
  const fixture = await pesananSaatDukaSiap(setup);
  const konfirmasi = await konfirmasiPesanan(setup, fixture);
  await bayarTagihan(setup, konfirmasi.tagihanId);
  return { ...fixture, ...konfirmasi };
}

/** That same order cancelled by the family, the way ticket 24 built it. */
async function pesananDibatalkan(setup: RefundsSetup) {
  const fixture = await pesananTerbayar(setup);
  const dibatalkan = await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "Keluarga berubah pikiran" });
  if (!dibatalkan.ok) throw new Error(`cancellation refused: ${dibatalkan.reason}`);
  return fixture;
}

/** A fully paid out order: Lunas, buried, ticked and its Bukti Pencairan already issued to the Lokasi Mitra. */
async function pesananSudahDicairkan(setup: RefundsSetup) {
  const fixture = await pesananTerbayar(setup);
  await catatPemakaman(setup, fixture.nomor, pemakaman);
  await setup.payouts.tick();
  const [row] = await setup.payouts.jalankanPencairan(fixture.admin);
  if (!row?.items.length) throw new Error("no due Pencairan item");
  const terbit = await setup.payouts.terbitkanBuktiPencairan(fixture.admin, {
    // Every due item, so the whole order (Petak tariff and Biaya Pemakaman) is
    // already paid out, not just its first item.
    itemIds: row.items.map((item) => item.id),
    ditransferPada: hariTransfer,
    bukti: buktiTransfer,
  });
  if (!terbit.ok) throw new Error(`Bukti Pencairan refused: ${terbit.reason}`);
  return fixture;
}

/** The one open request of a cancelled order, after the tick has materialised it. */
async function permintaanTerbuka(setup: RefundsSetup) {
  await setup.refunds.tick();
  const [permintaan] = await setup.refunds.permintaanTerbuka();
  if (!permintaan) throw new Error("no open request");
  return permintaan;
}

describe("materialising a cancelled, paid Tagihan", () => {
  it("turns a Pemesan's own cancellation into an open request that keeps the Biaya Layanan Platform", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananDibatalkan(setup);

    expect(await setup.refunds.tick()).toEqual({ materialised: 1 });
    const terbuka = await setup.refunds.permintaanTerbuka();
    expect(terbuka).toHaveLength(1);
    expect(terbuka[0]).toMatchObject({
      tagihanId: fixture.tagihanId,
      sumber: "pembatalan",
      pihakBersalah: "pemesan",
      biayaLayananPlatformDikembalikan: false,
      goodwill: false,
      penuh: true,
      jumlah: 9_500_000,
      status: "diajukan",
    });
  });

  it("returns the Biaya Layanan Platform too when the fault is the Lokasi's, the Mitra Jasa's or the Operator's", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananTerbayar(setup);
    // A cancellation that is not the Pemesan's: Billing cancels the bill, and the
    // caller (Terlambat, Berhenti) names whose fault it was.
    const dibatalkan = await setup.billing.batalkanTagihan(fixture.tagihanId, { alasan: "pemesanan_dibatalkan" });
    if (!dibatalkan.ok) throw new Error(`cancellation refused: ${dibatalkan.reason}`);
    // Billing's own figure keeps the fee; the spec's rule, not that figure, decides here.
    expect(dibatalkan.pengembalian?.jumlah).toBe(9_500_000);

    expect(await setup.refunds.ajukanDariPembatalan(fixture.tagihanId, { pihakBersalah: "lokasi" })).toEqual({ ok: true });
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ pihakBersalah: "lokasi", biayaLayananPlatformDikembalikan: true, jumlah: 9_650_000 });
    expect(permintaan?.lines.map((line) => line.label).length).toBeGreaterThan(2);
    // The tick never adds a second request for the same cancellation.
    expect(await setup.refunds.tick()).toEqual({ materialised: 0 });
  });

  it("is idempotent: ticking twice never doubles the request", async () => {
    const setup = refundsOnTestDatabase(db);
    await pesananDibatalkan(setup);

    expect(await setup.refunds.tick()).toEqual({ materialised: 1 });
    expect(await setup.refunds.tick()).toEqual({ materialised: 0 });
    expect(await setup.refunds.permintaanTerbuka()).toHaveLength(1);
  });

  it("materialises nothing for a Tagihan cancelled before any payment came in", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    await konfirmasiPesanan(setup, fixture);
    const dibatalkan = await setup.pemesanan.batalkanSaatDuka(fixture.pemesan, { nomor: fixture.nomor, alasan: "Batal" });
    expect(dibatalkan.ok).toBe(true);

    expect(await setup.refunds.tick()).toEqual({ materialised: 0 });
    expect(await setup.refunds.permintaanTerbuka()).toEqual([]);
  });
});

describe("approval, the Tier 3 refund transfer row and the transfer", () => {
  it("appears on approval with a 2 Hari Kerja deadline, closes when the proof is uploaded, and shows that proof on the Bukti's own link", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananDibatalkan(setup);
    const permintaan = await permintaanTerbuka(setup);
    const pemesan = pemesanActor(fixture.pemesan);

    expect(await setup.refunds.pengembalianJatuhTempo()).toEqual([]);
    // The Pemesan of the order enters the account before approval.
    expect(await setup.refunds.isiRekeningPemesan(pemesan, { nomorPemesanan: fixture.nomor, rekening })).toMatchObject({ ok: true });

    const setuju = await setup.refunds.setujuiPengembalian(fixture.admin, { permintaanId: permintaan.id });
    if (!setuju.ok) throw new Error(`approval refused: ${setuju.reason}`);
    expect(setuju.permintaan.status).toBe("disetujui");
    // 2026-10-01 (Thursday) + 2 Hari Kerja on the Admin Platform calendar
    // (Monday–Friday) = the close of Monday 2026-10-05 (ticket 11).
    expect(setuju.permintaan.tenggatTransferPada).toEqual(wib("2026-10-05 23:59"));
    expect((await setup.refunds.pengembalianJatuhTempo()).map((row) => row.id)).toEqual([permintaan.id]);

    const terbit = await setup.refunds.terbitkanBuktiPengembalianDana(fixture.admin, {
      permintaanId: permintaan.id,
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    if (!terbit.ok) throw new Error(`transfer refused: ${terbit.reason}`);
    expect(terbit.bukti).toMatchObject({
      nomor: "RFD/2026/000001",
      tagihanId: fixture.tagihanId,
      amount: 9_500_000,
      biayaLayananPlatformDikembalikan: false,
      rekening,
    });

    // The Tier 3 row closes the moment the proof is uploaded (AC 3).
    expect(await setup.refunds.pengembalianJatuhTempo()).toEqual([]);
    // A refunded Tagihan already Dibatalkan moves on to Dikembalikan penuh (AC 7).
    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({ status: "dikembalikan_penuh" });
    // Since ticket 89 a Saat Duka confirmation records the Tagihan's family
    // contact, so the Bukti Pengembalian Dana reaches the Pemesan by email and
    // no Telepon Pemesan row is needed for it.
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(
      setup.email.sent.filter((message) => message.to === fixture.pemesan.email && message.text.includes(terbit.bukti.link)),
    ).toHaveLength(1);
    expect(await setup.notifications.teleponPemesanTerbuka()).not.toContainEqual(
      expect.objectContaining({ subjectKind: "tagihan", subjectId: fixture.tagihanId, sebab: "tanpa_email" }),
    );

    // The document's own link carries the proof, as a short-lived signed URL.
    const dokumen = await setup.refunds.buktiPengembalianDana(terbit.bukti.link);
    expect(dokumen?.buktiTransferUrl).toEqual(expect.stringContaining("pengembalian/"));
    expect(dokumen).not.toHaveProperty("buktiTransferKey");
    expect(await setup.refunds.buktiPengembalianDana("bukan-tautan")).toBeNull();
  });

  it("cannot be transferred before a bank account is on file", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananDibatalkan(setup);
    const permintaan = await permintaanTerbuka(setup);
    await setup.refunds.setujuiPengembalian(fixture.admin, { permintaanId: permintaan.id });

    expect(
      await setup.refunds.terbitkanBuktiPengembalianDana(fixture.admin, { permintaanId: permintaan.id, ditransferPada: hariTransfer, bukti: buktiTransfer }),
    ).toEqual({ ok: false, reason: "rekening_belum_diisi" });
  });

  it("only Admin Platform may approve or transfer", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananDibatalkan(setup);
    const permintaan = await permintaanTerbuka(setup);

    expect(await setup.refunds.setujuiPengembalian(fixture.adminLokasi, { permintaanId: permintaan.id })).toMatchObject({
      ok: false,
      reason: "tidak_berwenang",
    });
  });
});

describe("the refund's bank account", () => {
  it("is the Pemesan's to enter only on their own order, locked once approved, and changed after that only by Admin Platform with a reason", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananDibatalkan(setup);
    const permintaan = await permintaanTerbuka(setup);
    const pemesan = pemesanActor(fixture.pemesan);
    const orangLain = pemesanActor({ accountId: "akun-lain", email: "lain@contoh.id" });

    // Someone whose order it is not finds nothing to write to.
    expect(await setup.refunds.isiRekeningPemesan(orangLain, { nomorPemesanan: fixture.nomor, rekening })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
    expect(await setup.refunds.isiRekeningPemesan(pemesan, { nomorPemesanan: fixture.nomor, rekening })).toMatchObject({ ok: true });
    // The Pemesan may still correct it until the refund is approved.
    const diperbaiki = { ...rekening, nomor: "7123450000" };
    expect(await setup.refunds.isiRekeningPemesan(pemesan, { nomorPemesanan: fixture.nomor, rekening: diperbaiki })).toMatchObject({
      ok: true,
      permintaan: { rekening: diperbaiki },
    });

    await setup.refunds.setujuiPengembalian(fixture.admin, { permintaanId: permintaan.id });
    expect(await setup.refunds.isiRekeningPemesan(pemesan, { nomorPemesanan: fixture.nomor, rekening })).toEqual({ ok: false, reason: "terkunci" });

    // Admin Platform changes it, and only with a reason.
    expect(await setup.refunds.isiRekeningAdmin(fixture.admin, { permintaanId: permintaan.id, rekening, alasan: "  " })).toEqual({
      ok: false,
      reason: "input_tidak_valid",
    });
    expect(await setup.refunds.isiRekeningAdmin(fixture.admin, { permintaanId: permintaan.id, rekening, alasan: "Salah ketik, dikonfirmasi lewat telepon" })).toMatchObject({
      ok: true,
      permintaan: { rekening },
    });

    // Every write is in the Audit Log, and no entry holds a whole account number.
    const entri = await setup.audit.entriesAbout({ kind: "permintaan_pengembalian", id: permintaan.id });
    expect(entri.map((entry) => entry.action)).toEqual([
      "pengembalian.isi_rekening_pemesan",
      "pengembalian.isi_rekening_pemesan",
      "pengembalian.setujui",
      "pengembalian.isi_rekening",
    ]);
    const teks = JSON.stringify(entri);
    expect(teks).toContain("****6789");
    expect(teks).not.toContain("7123456789");
    expect(teks).not.toContain("7123450000");
    expect(entri.at(-1)?.reason).toBe("Salah ketik, dikonfirmasi lewat telepon");
  });
});

describe("netted from the partner: money already paid out becomes a Potongan", () => {
  it("records a Potongan for the Lokasi Mitra that had already been paid, never on a fresh transfer", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananSudahDicairkan(setup);

    // The netted, fault-based refund of a Keluhan or Pembatalan has no caller
    // yet (see the ticket's Comments); this exercises Refunds' own reaction to
    // money that already left, on a Tagihan whose Lokasi Mitra was paid before
    // the refund was ever asked for.
    const dibatalkan = await setup.billing.batalkanTagihan(fixture.tagihanId, { alasan: "pemesanan_dibatalkan" });
    if (!dibatalkan.ok) throw new Error(`cancellation refused: ${dibatalkan.reason}`);
    expect(dibatalkan.pengembalian?.jumlah).toBe(9_500_000);

    const permintaan = await permintaanTerbuka(setup);
    await setup.refunds.setujuiPengembalian(fixture.admin, { permintaanId: permintaan.id });
    await setup.refunds.isiRekeningAdmin(fixture.admin, { permintaanId: permintaan.id, rekening, alasan: "Diminta lewat telepon" });

    expect(await setup.payouts.potonganOfLokasi(fixture.lokasiMitra.id)).toEqual([]);

    const terbit = await setup.refunds.terbitkanBuktiPengembalianDana(fixture.admin, {
      permintaanId: permintaan.id,
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    expect(terbit.ok).toBe(true);

    const potongan = await setup.payouts.potonganOfLokasi(fixture.lokasiMitra.id);
    expect(potongan).toHaveLength(1);
    expect(potongan[0]).toMatchObject({ amount: 9_500_000, alasanKind: "pengembalian_dana", status: "berjalan" });
  });
});

describe("goodwill: Operator-funded, never netted", () => {
  it("refunds from the Operator's own funds without touching the Lokasi Mitra's Pencairan or Potongan", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananSudahDicairkan(setup);
    const tagihan = await setup.billing.tagihan(fixture.tagihanId);
    if (!tagihan) throw new Error("no Tagihan");

    const diajukan = await setup.refunds.ajukanGoodwill(fixture.admin, {
      tagihanId: fixture.tagihanId,
      nomorTagihan: tagihan.nomorTagihan,
      nomorPemesanan: fixture.nomor,
      jumlah: 500_000,
      catatan: "Permintaan maaf atas keterlambatan",
    });
    if (!diajukan.ok) throw new Error(`goodwill request refused: ${diajukan.reason}`);
    expect(diajukan.permintaan).toMatchObject({ goodwill: true, penuh: false, jumlah: 500_000 });

    await setup.refunds.setujuiPengembalian(fixture.admin, { permintaanId: diajukan.permintaan.id });
    await setup.refunds.isiRekeningAdmin(fixture.admin, { permintaanId: diajukan.permintaan.id, rekening, alasan: "Diminta lewat telepon" });
    const terbit = await setup.refunds.terbitkanBuktiPengembalianDana(fixture.admin, {
      permintaanId: diajukan.permintaan.id,
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    if (!terbit.ok) throw new Error(`transfer refused: ${terbit.reason}`);
    expect(terbit.bukti.amount).toBe(500_000);

    // Never netted: no Potongan, whatever Payouts already paid the Lokasi Mitra.
    expect(await setup.payouts.potonganOfLokasi(fixture.lokasiMitra.id)).toEqual([]);
    // A partial refund leaves the Tagihan Dikembalikan sebagian, not penuh.
    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({ status: "dikembalikan_sebagian" });
  });
});

describe("a refund of some lines of a paid Tagihan (an order cancelled one item at a time)", () => {
  /** The first refundable line of a paid order's Tagihan, as a caller (a Layanan job) names it. */
  async function barisPertama(setup: RefundsSetup, tagihanId: string) {
    const tagihan = await setup.billing.tagihan(tagihanId);
    if (!tagihan) throw new Error("no Tagihan");
    const line = tagihan.lines.find((satu) => satu.kind !== "biaya_layanan_platform");
    const fee = tagihan.lines.find((satu) => satu.kind === "biaya_layanan_platform");
    if (!line || !fee) throw new Error("no item line or no fee line");
    return { tagihan, fee, baris: { label: line.label, amount: line.amount, lokasiId: line.provider.kind === "lokasi_mitra" ? line.provider.lokasiId : null } };
  }

  it("keeps the Biaya Layanan Platform when the Pemesan cancels, and is a partial request through the same approval, transfer and Bukti", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananTerbayar(setup);
    const { baris } = await barisPertama(setup, fixture.tagihanId);

    const diajukan = await setup.refunds.ajukanBaris(fixture.tagihanId, { pihakBersalah: "pemesan", lines: [baris] });
    if (!diajukan.ok) throw new Error(`refused: ${diajukan.reason}`);
    expect(diajukan).toMatchObject({ jumlah: baris.amount, biayaLayananPlatformDikembalikan: false });

    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ tagihanId: fixture.tagihanId, penuh: false, goodwill: false, pihakBersalah: "pemesan", jumlah: baris.amount, status: "diajukan" });
    expect(permintaan.lines).toEqual([baris]);

    expect((await setup.refunds.setujuiPengembalian(fixture.admin, { permintaanId: permintaan.id })).ok).toBe(true);
    await setup.refunds.isiRekeningAdmin(fixture.admin, { permintaanId: permintaan.id, rekening, alasan: "Diminta lewat telepon" });
    const terbit = await setup.refunds.terbitkanBuktiPengembalianDana(fixture.admin, { permintaanId: permintaan.id, ditransferPada: hariTransfer, bukti: buktiTransfer });
    if (!terbit.ok) throw new Error(`transfer refused: ${terbit.reason}`);
    expect(terbit.bukti.amount).toBe(baris.amount);
    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({ status: "dikembalikan_sebagian" });
  });

  it("returns the Biaya Layanan Platform too when the fault is the Lokasi's, and only once for the Tagihan", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananTerbayar(setup);
    const { baris, fee } = await barisPertama(setup, fixture.tagihanId);

    const pertama = await setup.refunds.ajukanBaris(fixture.tagihanId, { pihakBersalah: "lokasi", lines: [{ ...baris, amount: 1_000 }] });
    if (!pertama.ok) throw new Error(`refused: ${pertama.reason}`);
    expect(pertama).toMatchObject({ jumlah: 1_000 + fee.amount, biayaLayananPlatformDikembalikan: true });

    // A second lateness on the same Tagihan joins the open request and does not return the fee again.
    const kedua = await setup.refunds.ajukanBaris(fixture.tagihanId, { pihakBersalah: "lokasi", lines: [{ ...baris, amount: 2_000 }] });
    if (!kedua.ok) throw new Error(`refused: ${kedua.reason}`);
    expect(kedua).toMatchObject({ permintaanId: pertama.permintaanId, jumlah: 2_000, biayaLayananPlatformDikembalikan: false });
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect(permintaan.jumlah).toBe(3_000 + fee.amount);
  });

  it("keeps every line when two cancellations join the open request at the same moment (concurrent, on the row lock)", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananTerbayar(setup);
    const { baris } = await barisPertama(setup, fixture.tagihanId);
    const pertama = await setup.refunds.ajukanBaris(fixture.tagihanId, { pihakBersalah: "pemesan", lines: [{ ...baris, amount: 1_000 }] });
    if (!pertama.ok) throw new Error(`refused: ${pertama.reason}`);

    const [a, b] = await Promise.all([
      setup.refunds.ajukanBaris(fixture.tagihanId, { pihakBersalah: "pemesan", lines: [{ ...baris, label: "Baris A", amount: 2_000 }] }),
      setup.refunds.ajukanBaris(fixture.tagihanId, { pihakBersalah: "pemesan", lines: [{ ...baris, label: "Baris B", amount: 4_000 }] }),
    ]);
    expect(a.ok && b.ok).toBe(true);

    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect(permintaan.jumlah).toBe(7_000);
    expect(permintaan.lines.map((line) => line.label).sort()).toEqual(["Baris A", "Baris B", baris.label].sort());
  });

  it("refuses more than the Tagihan was paid and an unknown Tagihan, and gives a request raised after approval its own row", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananTerbayar(setup);
    const { tagihan, baris } = await barisPertama(setup, fixture.tagihanId);

    expect(await setup.refunds.ajukanBaris(fixture.tagihanId, { pihakBersalah: "pemesan", lines: [{ ...baris, amount: tagihan.total + 1 }] })).toEqual({ ok: false, reason: "melebihi_tagihan" });
    expect(await setup.refunds.ajukanBaris("00000000-0000-4000-8000-000000000000", { pihakBersalah: "pemesan", lines: [baris] })).toEqual({ ok: false, reason: "tagihan_tidak_ditemukan" });

    const diajukan = await setup.refunds.ajukanBaris(fixture.tagihanId, { pihakBersalah: "pemesan", lines: [{ ...baris, amount: 1_000 }] });
    if (!diajukan.ok) throw new Error(`refused: ${diajukan.reason}`);
    await setup.refunds.setujuiPengembalian(fixture.admin, { permintaanId: diajukan.permintaanId });
    // An approved request can no longer take lines, so the next one waits as its own request, paid by its own transfer.
    const kedua = await setup.refunds.ajukanBaris(fixture.tagihanId, { pihakBersalah: "pemesan", lines: [{ ...baris, amount: 1_000 }] });
    if (!kedua.ok) throw new Error(`refused: ${kedua.reason}`);
    expect(kedua.permintaanId).not.toBe(diajukan.permintaanId);
    const permintaan = await setup.refunds.permintaanTerbuka();
    expect(permintaan).toHaveLength(2);
    expect(permintaan.map((row) => row.jumlah)).toEqual([1_000, 1_000]);
  });

  it("is a full refund only when the lines really are everything the fault rule returns: the fee kept, nothing else left behind", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananTerbayar(setup);
    const { tagihan, baris } = await barisPertama(setup, fixture.tagihanId);
    const semuaBaris = tagihan.lines
      .filter((satu) => satu.kind !== "biaya_layanan_platform")
      .map((satu) => ({ label: satu.label, amount: satu.amount, lokasiId: satu.provider.kind === "lokasi_mitra" ? satu.provider.lokasiId : null }));

    // A part of the tariff is not "penuh", and neither is the whole tariff less one rupiah.
    expect(await setup.refunds.ajukanBaris(fixture.tagihanId, { pihakBersalah: "pemesan", penuh: true, lines: [baris] })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await setup.refunds.ajukanBaris(fixture.tagihanId, { pihakBersalah: "pemesan", penuh: true, lines: [{ ...semuaBaris[0], amount: semuaBaris[0].amount - 1 }, ...semuaBaris.slice(1)] })).toEqual({
      ok: false,
      reason: "input_tidak_valid",
    });

    const diajukan = await setup.refunds.ajukanBaris(fixture.tagihanId, { pihakBersalah: "pemesan", penuh: true, lines: semuaBaris });
    if (!diajukan.ok) throw new Error(`refused: ${diajukan.reason}`);
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ penuh: true, biayaLayananPlatformDikembalikan: false, jumlah: tagihan.total - 150_000 });
    await setup.refunds.setujuiPengembalian(fixture.admin, { permintaanId: permintaan.id });
    await setup.refunds.isiRekeningAdmin(fixture.admin, { permintaanId: permintaan.id, rekening, alasan: "Diminta lewat telepon" });
    const terbit = await setup.refunds.terbitkanBuktiPengembalianDana(fixture.admin, { permintaanId: permintaan.id, ditransferPada: hariTransfer, bukti: buktiTransfer });
    expect(terbit.ok).toBe(true);
    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({ status: "dikembalikan_penuh" });
  });
});

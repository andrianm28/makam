/**
 * Refunds end to end (spec, Billing > Refunds; Work Queues > Tier 3 "refund
 * transfers"; ticket 31's ACs), driven only through the public interfaces of
 * Refunds, Billing, Payouts and Pemesanan.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
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

/** That same order cancelled by the family, the way ticket 24 built it: money back less the Biaya Layanan Platform. */
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

describe("materialising ticket 24's Saat Duka cancellation refund", () => {
  it("turns the Tagihan Billing flagged into an open request, fee kept, nothing to refund the Lokasi for", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananDibatalkan(setup);

    const tagihan = await setup.billing.tagihan(fixture.tagihanId);
    expect(tagihan).toMatchObject({ status: "dibatalkan", pengembalianDiminta: { jumlah: 9_500_000 } });

    expect(await setup.refunds.tick()).toEqual({ materialised: 1 });
    const terbuka = await setup.refunds.permintaanTerbuka();
    expect(terbuka).toHaveLength(1);
    expect(terbuka[0]).toMatchObject({
      tagihanId: fixture.tagihanId,
      sumber: "pembatalan_pemesan",
      pihakBersalah: "pemesan",
      biayaLayananPlatformDikembalikan: false,
      goodwill: false,
      penuh: true,
      jumlah: 9_500_000,
      status: "diajukan",
    });
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

describe("approval and the Tier 3 refund transfer row", () => {
  it("appears on approval with a 2 Hari Kerja deadline, and needs a bank account before it can be transferred", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananDibatalkan(setup);
    await setup.refunds.tick();
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    if (!permintaan) throw new Error("no open request");

    expect(await setup.refunds.pengembalianJatuhTempo()).toEqual([]);

    const setuju = await setup.refunds.setujuiPengembalian(fixture.admin, { permintaanId: permintaan.id });
    if (!setuju.ok) throw new Error(`approval refused: ${setuju.reason}`);
    expect(setuju.permintaan.status).toBe("disetujui");
    // 2026-10-01 (Thursday) + 2 Hari Kerja on the Admin Platform calendar
    // (Monday–Friday) = the close of Monday 2026-10-05, the same calendar
    // Payouts' own Pencairan deadline uses (ticket 11).
    expect(setuju.permintaan.tenggatTransferPada).toEqual(wib("2026-10-05 23:59"));

    const jatuhTempo = await setup.refunds.pengembalianJatuhTempo();
    expect(jatuhTempo.map((row) => row.id)).toEqual([permintaan.id]);

    const ditolakTanpaRekening = await setup.refunds.terbitkanBuktiPengembalianDana(fixture.admin, {
      permintaanId: permintaan.id,
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    expect(ditolakTanpaRekening).toEqual({ ok: false, reason: "rekening_belum_diisi" });

    const diisi = await setup.refunds.isiRekeningPemesan({ tagihanId: fixture.tagihanId, rekening });
    expect(diisi).toMatchObject({ ok: true, permintaan: { rekening } });

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
    // A Saat Duka Tagihan's family contact is never recorded in
    // notifications_tagihan_kontak (only a Tagihan kind that calls
    // Billing/Notifications' own `tagihanTerbit` gets one, which a Saat Duka
    // order's confirmation does not — its own family messages go through the
    // Pemesanan-keyed announcements instead). Its refund still reaches the
    // family: exactly ADR 0004's designed fallback, a Telepon Pemesan row.
    const telepon = await setup.notifications.teleponPemesanTerbuka();
    expect(telepon).toContainEqual(
      expect.objectContaining({ subjectKind: "tagihan", subjectId: fixture.tagihanId, sebab: "tanpa_email" }),
    );
  });

  it("only Admin Platform may approve or transfer", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananDibatalkan(setup);
    await setup.refunds.tick();
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    if (!permintaan) throw new Error("no open request");

    expect(await setup.refunds.setujuiPengembalian(fixture.adminLokasi, { permintaanId: permintaan.id })).toMatchObject({
      ok: false,
      reason: "tidak_berwenang",
    });
  });
});

describe("netted from the partner: money already paid out becomes a Potongan", () => {
  it("records a Potongan for the Lokasi Mitra that had already been paid, never on a fresh transfer", async () => {
    const setup = refundsOnTestDatabase(db);
    const fixture = await pesananSudahDicairkan(setup);

    // The fault-based, netted refund a future Keluhan or Pembatalan would raise
    // is not wired to a real caller yet (ticket 31's own honest scope, see the
    // ticket's Comments); this exercises Refunds' own reaction to money that
    // already left through Billing's own cancellation flag, on a Tagihan whose
    // Lokasi Mitra was already paid before the refund was ever asked for.
    const dibatalkan = await setup.billing.batalkanTagihan(fixture.tagihanId, { alasan: "pemesanan_dibatalkan" });
    if (!dibatalkan.ok) throw new Error(`cancellation refused: ${dibatalkan.reason}`);
    expect(dibatalkan.pengembalian?.jumlah).toBe(9_500_000);

    expect(await setup.refunds.tick()).toEqual({ materialised: 1 });
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    if (!permintaan) throw new Error("no open request");
    await setup.refunds.setujuiPengembalian(fixture.admin, { permintaanId: permintaan.id });
    await setup.refunds.isiRekeningPemesan({ tagihanId: fixture.tagihanId, rekening });

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

    const diajukan = await setup.refunds.ajukanGoodwill(fixture.admin, {
      tagihanId: fixture.tagihanId,
      nomorTagihan: (await setup.billing.tagihan(fixture.tagihanId))!.nomorTagihan,
      nomorPemesanan: fixture.nomor,
      jumlah: 500_000,
      catatan: "Permintaan maaf atas keterlambatan",
    });
    if (!diajukan.ok) throw new Error(`goodwill request refused: ${diajukan.reason}`);
    expect(diajukan.permintaan).toMatchObject({ goodwill: true, penuh: false, jumlah: 500_000 });

    await setup.refunds.setujuiPengembalian(fixture.admin, { permintaanId: diajukan.permintaan.id });
    await setup.refunds.isiRekeningAdmin(fixture.admin, { permintaanId: diajukan.permintaan.id, rekening });
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

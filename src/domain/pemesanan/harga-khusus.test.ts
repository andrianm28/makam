/**
 * A Harga Khusus on one order (spec, Billing: "A Harga Khusus appears as a
 * negative 'Penyesuaian Harga Khusus' line", and a reissue "keeps the original
 * due date, so a reissue never extends the time to pay"; Payouts: "borne by the
 * Operator … unless a partner share is recorded: Admin Platform may enter on the
 * order the amount the Lokasi Mitra agreed to bear, with a required note (default
 * 0)"; ticket 30's AC 3, 4, 5, 6).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { actorOf, logIn } from "../../../tests/support/identity";
import { cellsOf } from "../../../tests/support/inventory";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  orderSaatDuka,
  pemesananOnTestDatabase,
  saatDukaFixture,
  siapkanOperatorPemesanan,
  terverifikasiLokasi,
  type PemesananSetup,
} from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A confirmed order at the fixture's Lokasi Mitra, with its pay-after Tagihan of Rp 9.650.000. */
async function pesananTerkonfirmasi(setup: PemesananSetup) {
  const fixture = await saatDukaFixture(setup);
  await siapkanOperatorPemesanan(setup);
  const placed = await setup.pemesanan.placeSaatDuka({
    ...orderSaatDuka(fixture),
    rencanaPemakamanAt: "2026-10-02T10:00",
  });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
  if (!blok) throw new Error("no Blok");
  const [petak] = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok.id)).filter((cell) => cell.kind === "petak");
  const hasil = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, {
    nomor: placed.pemesanan.nomor,
    petakId: petak!.id,
    pemakamanAt: "2026-10-02T10:00",
  });
  if (!hasil.ok) throw new Error(`confirmation refused: ${hasil.reason}`);
  // The order itself names the Tagihan its confirmation issued.
  const order = await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan);
  if (!order?.tagihanId) throw new Error("no Tagihan on the order");
  return { ...fixture, nomor: placed.pemesanan.nomor, tagihanId: order.tagihanId };
}

/** Admin Platform's Harga Khusus on that order: what it takes off, and why. */
function hargaKhusus(nomor: string, jumlah: number, partner?: { share: number; note: string }) {
  return {
    nomor,
    jumlah,
    alasan: "Keluarga dalam kesulitan",
    partnerShare: partner?.share,
    partnerShareNote: partner?.note,
  };
}

describe("Admin Platform sets a Harga Khusus on an order", () => {
  it("the Tagihan is cancelled and replaced, never edited: a new number, the same lines plus a negative Penyesuaian, the same due date", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananTerkonfirmasi(setup);
    const sebelum = await setup.billing.tagihan(fixture.tagihanId);
    setup.clock.set(wib("2026-10-01 12:00"));

    const hasil = await setup.pemesanan.tambahHargaKhusus(fixture.admin, hargaKhusus(fixture.nomor, 2_000_000));

    expect(hasil).toMatchObject({
      ok: true,
      tagihan: { nomorTagihan: "TGH/2026/000002", status: "belum_dibayar", total: 7_650_000, dueAt: wib("2026-10-05 10:00") },
    });
    if (!hasil.ok) return;
    // Every line the original was issued with, unchanged, and the reduction as its own negative line.
    expect(hasil.tagihan.lines).toEqual([
      ...(sebelum?.lines ?? []),
      { kind: "penyesuaian_harga_khusus", label: "Penyesuaian Harga Khusus", amount: -2_000_000, provider: { kind: "operator" } },
    ]);
    // The old Tagihan is Dibatalkan and replaced, and its own lines are as they were issued.
    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({
      status: "dibatalkan",
      cancelledReason: "diganti",
      replacedByNomorTagihan: "TGH/2026/000002",
      lines: sebelum?.lines,
    });
    // The order follows its replacement.
    expect(await setup.pemesanan.pembayaranOrder(fixture.nomor)).toMatchObject({ tagihanId: hasil.tagihan.id });
  });

  it("a partner share is entered with a required note, and defaults to 0: the Operator bears the whole reduction", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananTerkonfirmasi(setup);

    await setup.pemesanan.tambahHargaKhusus(fixture.admin, hargaKhusus(fixture.nomor, 2_000_000));

    // No share entered: 0, with no note, exactly as the default says.
    expect(await setup.pemesanan.pembayaranOrder(fixture.nomor)).toMatchObject({ partnerShare: 0, partnerShareNote: null });
  });

  it("a non-zero partner share is kept on the order, with its note, for the Pencairan of that order", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananTerkonfirmasi(setup);
    setup.clock.set(wib("2026-10-01 12:00"));

    const hasil = await setup.pemesanan.tambahHargaKhusus(
      fixture.admin,
      hargaKhusus(fixture.nomor, 2_000_000, { share: 500_000, note: "Lokasi Mitra mengiadakan sebagian" }),
    );

    expect(hasil.ok).toBe(true);
    expect(await setup.pemesanan.pembayaranOrder(fixture.nomor)).toMatchObject({
      partnerShare: 500_000,
      partnerShareNote: "Lokasi Mitra mengiadakan sebagian",
    });
    // Audited twice in one write: the reissue, and the share that goes with it.
    const entri = (await setup.audit.allEntriesForLokasi(fixture.lokasiMitra.id)).filter((entry) => entry.action.startsWith("harga_khusus."));
    expect(entri).toEqual([
      expect.objectContaining({
        action: "harga_khusus.ubah",
        actor: { accountId: fixture.admin.accountId, role: "admin_platform" },
        entity: { kind: "tagihan", id: fixture.tagihanId },
        reason: "Keluarga dalam kesulitan",
        before: { nomorTagihan: "TGH/2026/000001", total: 9_650_000 },
        after: expect.objectContaining({ nomorTagihan: "TGH/2026/000002", total: 7_650_000, penyesuaian: 2_000_000 }),
      }),
      expect.objectContaining({
        action: "harga_khusus.partner_share",
        entity: { kind: "pemesanan_makam", id: expect.any(String) },
        after: { partnerShare: 500_000, partnerShareNote: "Lokasi Mitra mengiadakan sebagian" },
      }),
    ]);
  });

  it("a share without a note is refused, and so is one larger than the reduction it shares", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananTerkonfirmasi(setup);

    expect(await setup.pemesanan.tambahHargaKhusus(fixture.admin, hargaKhusus(fixture.nomor, 2_000_000, { share: 500_000, note: "" }))).toEqual({
      ok: false,
      reason: "partner_share_wajib_ada_catatan",
    });
    expect(
      await setup.pemesanan.tambahHargaKhusus(fixture.admin, hargaKhusus(fixture.nomor, 2_000_000, { share: 2_500_000, note: "Lebih besar" })),
    ).toEqual({ ok: false, reason: "partner_share_melebihi_penyesuaian" });
    // A share of nothing needs no note: that is the default, said out loud.
    expect((await setup.pemesanan.tambahHargaKhusus(fixture.admin, hargaKhusus(fixture.nomor, 2_000_000, { share: 0, note: "" }))).ok).toBe(true);
    expect(await setup.pemesanan.pembayaranOrder(fixture.nomor)).toMatchObject({ partnerShare: 0, partnerShareNote: null });
  });

  it("a share is frozen once a Pencairan has been issued for the order: the amount already transferred cannot move", async () => {
    const ditanya: string[] = [];
    const setup = pemesananOnTestDatabase(db, {
      // Stands in for the Payouts module's own read, which ticket 32 brings.
      pencairanTerbit: async (nomor) => {
        ditanya.push(nomor);
        return true;
      },
    });
    const fixture = await pesananTerkonfirmasi(setup);

    const hasil = await setup.pemesanan.tambahHargaKhusus(
      fixture.admin,
      hargaKhusus(fixture.nomor, 2_000_000, { share: 500_000, note: "Lokasi Mitra mengiadakan sebagian" }),
    );

    expect(hasil).toEqual({ ok: false, reason: "partner_share_sudah_terkunci" });
    expect(ditanya).toEqual([fixture.nomor]);
    // The reduction itself is still the Operator's to give: only the share is frozen.
    expect((await setup.pemesanan.tambahHargaKhusus(fixture.admin, hargaKhusus(fixture.nomor, 2_000_000))).ok).toBe(true);
    expect(await setup.pemesanan.pembayaranOrder(fixture.nomor)).toMatchObject({ partnerShare: 0 });
  });

  it("a Harga Khusus larger than the Tagihan's total is refused and changes nothing", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananTerkonfirmasi(setup);
    const sebelum = await setup.billing.tagihan(fixture.tagihanId);

    const hasil = await setup.pemesanan.tambahHargaKhusus(fixture.admin, hargaKhusus(fixture.nomor, 9_650_001));

    expect(hasil).toEqual({ ok: false, reason: "harga_khusus_melebihi_total" });
    expect(await setup.billing.tagihan(fixture.tagihanId)).toEqual(sebelum);
    expect(await setup.pemesanan.pembayaranOrder(fixture.nomor)).toMatchObject({ tagihanId: fixture.tagihanId, partnerShare: 0 });
  });

  it("only Admin Platform may set one, never an Admin Lokasi of that Lokasi Mitra nor a Pemesan", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananTerkonfirmasi(setup);
    const lain = await terverifikasiLokasi(setup, { name: "Makam Sawah Besar", city: "Kabupaten Bekasi" });
    const sebelum = await setup.billing.tagihan(fixture.tagihanId);

    expect(await setup.pemesanan.tambahHargaKhusus(fixture.adminLokasi, hargaKhusus(fixture.nomor, 2_000_000))).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.pemesanan.tambahHargaKhusus(lain.adminLokasi, hargaKhusus(fixture.nomor, 2_000_000))).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    // A Pemesan is no staff at all: the money is the Operator's to reduce, not theirs to ask for.
    const pemesan = await actorOf(setup.identity, (await logIn(setup, "keluarga.lain@contoh.id")).cookies);
    expect(await setup.pemesanan.tambahHargaKhusus(pemesan, hargaKhusus(fixture.nomor, 2_000_000))).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await setup.billing.tagihan(fixture.tagihanId)).toEqual(sebelum);
  });

  it("an order with no Tagihan yet cannot get one: the Lokasi has not confirmed it", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await saatDukaFixture(setup);
    await siapkanOperatorPemesanan(setup);
    const placed = await setup.pemesanan.placeSaatDuka(orderSaatDuka(fixture));
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);

    const hasil = await setup.pemesanan.tambahHargaKhusus(fixture.admin, hargaKhusus(placed.pemesanan.nomor, 2_000_000));

    expect(hasil).toEqual({ ok: false, reason: "tagihan_belum_ada" });
  });

  it("a Tagihan that is already paid is never replaced: the reduction would ask the family for money it has already given", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananTerkonfirmasi(setup);
    const paid = await setup.billing.recordPayment(fixture.tagihanId, { method: { kind: "tunai" }, reference: null });
    if (!paid.ok) throw new Error(`not paid: ${paid.reason}`);

    const hasil = await setup.pemesanan.tambahHargaKhusus(fixture.admin, hargaKhusus(fixture.nomor, 1_000_000));

    expect(hasil).toEqual({ ok: false, reason: "tagihan_tidak_bisa_diganti" });
    expect(await setup.billing.tagihan(fixture.tagihanId)).toMatchObject({ status: "lunas", lines: paid.bukti.tagihan.lines });
  });

  it("a second Harga Khusus adds its own Penyesuaian line, and a share agreed earlier stands unless a new one is entered", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await pesananTerkonfirmasi(setup);
    setup.clock.set(wib("2026-10-01 12:00"));

    await setup.pemesanan.tambahHargaKhusus(fixture.admin, hargaKhusus(fixture.nomor, 1_000_000, { share: 300_000, note: "Sepotong biaya pemakaman" }));
    const kedua = await setup.pemesanan.tambahHargaKhusus(fixture.admin, hargaKhusus(fixture.nomor, 500_000));

    expect(kedua).toMatchObject({ ok: true, tagihan: { nomorTagihan: "TGH/2026/000003", total: 8_150_000 } });
    if (!kedua.ok) return;
    // One negative line per Harga Khusus, each on the Tagihan that carries it.
    expect(
      kedua.tagihan.lines.filter((line) => line.kind === "penyesuaian_harga_khusus").map((line) => line.amount),
    ).toEqual([-1_000_000, -500_000]);
    // The share the Lokasi Mitra agreed to is not withdrawn by leaving the field empty.
    expect(await setup.pemesanan.pembayaranOrder(fixture.nomor)).toMatchObject({
      partnerShare: 300_000,
      partnerShareNote: "Sepotong biaya pemakaman",
    });
  });

  it("a Harga Khusus covering the whole total leaves a Rp 0 Tagihan: Lunas at once, with its Bukti Pembayaran and the effects fired once", async () => {
    const metode: string[] = [];
    const setup = pemesananOnTestDatabase(db, {
      paymentEffects: [{ name: "test.observe", run: async (_tx, payment) => void metode.push(payment.method.kind) }],
    });
    const fixture = await pesananTerkonfirmasi(setup);
    setup.clock.set(wib("2026-10-01 12:00"));

    // The whole Rp 9.650.000 is given away, so the family owes nothing.
    const hasil = await setup.pemesanan.tambahHargaKhusus(fixture.admin, hargaKhusus(fixture.nomor, 9_650_000));

    expect(hasil).toMatchObject({ ok: true, tagihan: { total: 0, status: "lunas" } });
    expect(metode).toEqual(["tanpa_pembayaran"]);
    if (!hasil.ok) return;
    const dokumen = await setup.billing.documentByLink(hasil.tagihan.link);
    if (dokumen?.type !== "tagihan" || !dokumen.buktiLink) throw new Error("no Bukti Pembayaran");
    const bukti = await setup.billing.documentByLink(dokumen.buktiLink);
    if (bukti?.type !== "bukti_pembayaran") throw new Error("no Bukti Pembayaran");
    expect(bukti.bukti.method).toEqual({ kind: "tanpa_pembayaran" });
    expect(bukti.bukti.tagihan.lines.at(-1)).toMatchObject({ label: "Penyesuaian Harga Khusus", amount: -9_650_000 });
  });
});

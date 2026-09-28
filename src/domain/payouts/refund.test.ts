/**
 * Refunds and Bukti Pengembalian Dana (spec, Billing > Refunds; ticket 31).
 *
 * The whole flow is one story with three gates, and the tests are named for the
 * states a family and an Admin Platform would use:
 *
 * - something asks, and the Biaya Layanan Platform is decided by **whose fault**
 *   it is (AC 1) — the one rule of this ticket, and the one the spec states as a
 *   table;
 * - nothing leaves without an approval, and the approval opens a Tier 3 Antrean
 *   row due in 2 Hari Kerja (AC 2, 3);
 * - the transfer issues `RFD/…`, moves the Tagihan to Dikembalikan Sebagian or
 *   Penuh, and tells the Pemesan (AC 4, 5, 7);
 * - money already paid out to a Lokasi Mitra becomes a Potongan, and a goodwill
 *   refund never does (AC 6);
 * - and the Saat Duka cancellation of ticket 24 flows through the whole thing
 *   (AC 7), which is where the divergence recorded in the file header of
 *   `./refund.ts` becomes visible: for that case the fault rule and ticket 24's
 *   recorded amount are the **same number**, and for every other case they differ
 *   by exactly the fee. Both are asserted below, because a test that only showed
 *   the agreeing case would hide the disagreement entirely.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { biayaLayananPlatformDikembalikan } from "@/domain/payouts";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  adminLokasiOf,
  bayarTagihan,
  buktiTransfer,
  konfirmasiPesanan,
  payoutsOnTestDatabase,
  pesananSaatDukaSiap,
  type PayoutsModul,
} from "../../../tests/support/payouts";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The date Admin Platform enters: the fake Clock's today, so the transfer has happened. */
const hariTransfer = "2026-10-01";

/** The account a family is refunded to: a person's statement, never a derived value. */
const rekening = {
  bankName: "Bank Mandiri",
  accountNumber: "1122334455",
  accountHolder: "Budi Santoso",
};

/**
 * One Saat Duka order at a Lokasi Mitra, confirmed and **paid**, so a refund has
 * money to be about: Rp 9.650.000, of which Rp 150.000 is the Biaya Layanan
 * Platform. A 9.500.000 refund is everything but the Operator's own fee.
 */
async function dibayar(setup: PayoutsModul, options: { email?: string; name?: string } = {}) {
  const fixture = await pesananSaatDukaSiap(setup, options);
  const konfirmasi = await konfirmasiPesanan(setup, fixture);
  await bayarTagihan(setup, konfirmasi.tagihanId);
  // The Tagihan as issued, read through Billing: the refund copies the bill's own
  // addressee and lines, and the test reads them from the same public read.
  const tagihan = await setup.billing.tagihan(konfirmasi.tagihanId);
  if (!tagihan) throw new Error("no Tagihan");
  return { ...fixture, ...konfirmasi, tagihan };
}

/** Records one order's Pemakaman, standing in for the Pemakaman module (ticket 25). */
async function catatPemakaman(setup: PayoutsModul, nomorPemesanan: string, pemakamanAt: Date) {
  await setup.db.transaction((tx) => setup.payouts.pemakamanTercatat(tx, { nomorPemesanan, pemakamanAt }));
}

/** Asks for a refund of that Tagihan the way a module whose business caused it does. */
async function minta(setup: PayoutsModul, order: Awaited<ReturnType<typeof dibayar>>, overrides: Record<string, unknown> = {}) {
  return setup.db.transaction((tx) =>
    setup.payouts.catatPermintaanPengembalian(tx, {
      tagihanId: order.tagihanId,
      sebab: "keluhan",
      fault: "pemesan",
      penanggung: "mitra",
      ...overrides,
    }),
  );
}

/** A refund approved, with its account recorded, ready for the transfer. */
async function siapDitransfer(setup: PayoutsModul, order: Awaited<ReturnType<typeof dibayar>>, overrides: Record<string, unknown> = {}) {
  const diminta = await minta(setup, order, overrides);
  if (!diminta.ok) throw new Error(`refund refused: ${diminta.reason}`);
  const disetujui = await setup.payouts.setujuiPengembalian(order.admin, { pengembalianId: diminta.pengembalian.id });
  if (!disetujui.ok) throw new Error(`approval refused: ${disetujui.reason}`);
  const adaRekening = await setup.db.transaction((tx) =>
    setup.payouts.catatRekeningPengembalian(tx, { pengembalianId: diminta.pengembalian.id, rekening }),
  );
  if (!adaRekening.ok) throw new Error(`account refused: ${adaRekening.reason}`);
  return diminta.pengembalian.id;
}

describe("the Biaya Layanan Platform, by whose fault the refund is", () => {
  it("is kept when the Pemesan cancels, and refunded when the fault is the Lokasi's, the Mitra Jasa's or the Operator's", () => {
    // The spec's table, as the one rule this ticket has (spec, Billing > Refunds).
    expect(biayaLayananPlatformDikembalikan("pemesan")).toBe(false);
    expect(biayaLayananPlatformDikembalikan("lokasi")).toBe(true);
    expect(biayaLayananPlatformDikembalikan("mitra_jasa")).toBe(true);
    expect(biayaLayananPlatformDikembalikan("operator")).toBe(true);
  });

  it("is a kept Rp 150.000 on a Pemesan's own cancellation, and part of the money back when it is not the Pemesan's fault", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);

    const olehPemesan = await minta(setup, order, { fault: "pemesan" });
    // A different cause, because one bill may hold one live request per cause:
    // the second "keluhan" below would correctly be refused as a duplicate.
    const olehLokasi = await minta(setup, order, { sebab: "pembatalan", fault: "lokasi" });

    if (!olehPemesan.ok || !olehLokasi.ok) throw new Error("a request was refused");
    // 9.650.000 paid: the Pemesan's own cancellation returns the 9.500.000 that is
    // not the Operator's fee, and says the 150.000 stayed.
    expect(olehPemesan.pengembalian).toMatchObject({
      jumlah: 9_500_000,
      biayaLayananPlatform: 150_000,
      biayaLayananPlatformDikembalikan: false,
      penanggung: "mitra",
    });
    expect(olehPemesan.pengembalian.baris.map((line) => [line.label, line.jumlah])).toEqual([
      ["Harga Hak Pakai – Reguler 1 × 2 m", 7_500_000],
      ["Biaya Pemakaman", 2_000_000],
    ]);
    // The same bill, refunded because the Lokasi is at fault: now the whole of it
    // comes back, fee included.
    expect(olehLokasi.pengembalian).toMatchObject({
      jumlah: 9_650_000,
      biayaLayananPlatform: 0,
      biayaLayananPlatformDikembalikan: true,
    });
    expect(olehLokasi.pengembalian.baris.map((line) => line.label)).toEqual([
      "Harga Hak Pakai – Reguler 1 × 2 m",
      "Biaya Pemakaman",
      "Biaya Layanan Platform",
    ]);
  });

  it("refuses to name back the fee on a Pemesan's own cancellation, whoever asks", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);

    // The rule is the spec's, not the caller's to widen: naming the fee line by hand
    // is refused exactly as leaving it to the rule and adding it is.
    expect(await minta(setup, order, { fault: "pemesan", baris: [{ posisi: 2, jumlah: 150_000 }] })).toEqual({
      ok: false,
      reason: "baris_tidak_valid",
    });
    // A line that is not the bill's own, and an amount above it, are refused too.
    expect(await minta(setup, order, { fault: "lokasi", baris: [{ posisi: 9, jumlah: 1_000 }] })).toEqual({
      ok: false,
      reason: "baris_tidak_valid",
    });
    expect(await minta(setup, order, { fault: "lokasi", baris: [{ posisi: 0, jumlah: 7_500_001 }] })).toEqual({
      ok: false,
      reason: "jumlah_tidak_valid",
    });
  });
});

describe("a refund request", () => {
  it("asks for nothing on a bill that never took money, and says a goodwill refund must say why", async () => {
    const setup = payoutsOnTestDatabase(db);
    const fixture = await pesananSaatDukaSiap(setup);
    const konfirmasi = await konfirmasiPesanan(setup, fixture);

    // Confirmed but unpaid: there is no money to give back, so nothing is invented.
    expect(
      await setup.db.transaction((tx) =>
        setup.payouts.catatPermintaanPengembalian(tx, {
          tagihanId: konfirmasi.tagihanId,
          sebab: "keluhan",
          fault: "lokasi",
          penanggung: "mitra",
        }),
      ),
    ).toEqual({ ok: false, reason: "belum_dibayar" });
    // Goodwill is the Operator's own money given away, so it always says why.
    expect(
      await setup.db.transaction((tx) =>
        setup.payouts.catatPermintaanPengembalian(tx, {
          tagihanId: konfirmasi.tagihanId,
          sebab: "goodwill",
          fault: "operator",
          penanggung: "operator",
        }),
      ),
    ).toEqual({ ok: false, reason: "catatan_wajib" });
  });

  it("never nets a goodwill refund from a partner, whatever the caller asked for", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);

    // Asking for a goodwill refund to be charged to the Lokasi Mitra is refused by
    // the module writing the one thing that is true: goodwill is the Operator's
    // own money (spec, Refunds), so there is no shape of it that reaches a partner.
    const diminta = await minta(setup, order, {
      sebab: "goodwill",
      fault: "operator",
      penanggung: "mitra",
      catatan: "Keluarga dalam kesulitan",
    });

    if (!diminta.ok) throw new Error(`a goodwill request was refused: ${diminta.reason}`);
    expect(diminta.pengembalian).toMatchObject({ penanggung: "operator", catatan: "Keluarga dalam kesulitan" });
  });

  it("waits for an Admin Platform, and cannot be asked for twice for the same cause", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);
    const pertama = await minta(setup, order);
    if (!pertama.ok) throw new Error(`a request was refused: ${pertama.reason}`);

    expect(pertama.pengembalian).toMatchObject({ status: "diminta", disetujuiPada: null, jatuhTempoAt: null });
    // The same cause twice is one request, not two approvals for the same rupiah.
    expect(await minta(setup, order)).toEqual({ ok: false, reason: "sudah_diminta" });
    // And it is the only one waiting for a decision.
    expect(await setup.payouts.pengembalianDiminta()).toMatchObject([{ id: pertama.pengembalian.id, jumlah: 9_500_000 }]);
  });
});

describe("approving a refund", () => {
  it("is Admin Platform's alone, and opens a Tier 3 Antrean row due in 2 Hari Kerja", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);
    const adminLokasi = await adminLokasiOf(setup, order.admin, order.lokasiMitra.id, 1);
    const diminta = await minta(setup, order);
    if (!diminta.ok) throw new Error(`a request was refused: ${diminta.reason}`);

    // Nobody else may move this money (spec, story 161).
    expect(await setup.payouts.setujuiPengembalian(adminLokasi, { pengembalianId: diminta.pengembalian.id })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    // An Admin Platform who has not passed TOTP may not either.
    expect(
      await setup.payouts.setujuiPengembalian({ ...order.admin, totp: "perlu_daftar" }, { pengembalianId: diminta.pengembalian.id }),
    ).toEqual({ ok: false, reason: "perlu_totp" });

    const disetujui = await setup.payouts.setujuiPengembalian(order.admin, { pengembalianId: diminta.pengembalian.id });

    expect(disetujui).toMatchObject({ ok: true, pengembalian: { status: "disetujui", disetujuiOleh: order.admin.accountId } });
    // The deadline is stamped once, at approval, and read from there.
    expect((await setup.payouts.pengembalian(diminta.pengembalian.id))?.jatuhTempoAt).toEqual(wib("2026-10-05 23:59"));
    // Which is what the Antrean shows: one Tier 3 row per approved refund, gone the
    // moment the transfer is recorded.
    const antrean = (await setup.queues.antrean(order.admin)).filter((row) => row.type === "pengembalian");
    expect(antrean).toMatchObject([
      {
        tier: 3,
        label: "Transfer pengembalian dana",
        subjectKind: "pengembalian",
        subjectId: diminta.pengembalian.id,
        deadline: wib("2026-10-05 23:59"),
        // Tier 3 never alerts (spec, Work Queues: only Tier 1 and 2 do).
        alerts: false,
      },
    ]);
    // And the approval is in the Entri Audit, because money needs a record.
    expect(await setup.audit.entriesAbout({ kind: "pengembalian", id: diminta.pengembalian.id })).toMatchObject([
      {
        action: "pengembalian.setujui",
        actor: { role: "admin_platform" },
        before: { status: "diminta" },
        after: { status: "disetujui", jumlah: 9_500_000 },
      },
    ]);
  });

  it("is one-way: an approved refund is not approved again", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);
    const pengembalianId = await siapDitransfer(setup, order);

    expect(await setup.payouts.setujuiPengembalian(order.admin, { pengembalianId })).toEqual({
      ok: false,
      reason: "sudah_disetujui",
    });
  });
});

describe("transferring a refund", () => {
  it("moves no money without an approval, and no money to an account nobody gave", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);
    const diminta = await minta(setup, order);
    if (!diminta.ok) throw new Error(`a request was refused: ${diminta.reason}`);

    // A request nobody approved cannot be paid, whatever else is true of it.
    expect(
      await setup.payouts.terbitkanBuktiPengembalian(order.admin, {
        pengembalianId: diminta.pengembalian.id,
        ditransferPada: hariTransfer,
        bukti: buktiTransfer,
      }),
    ).toEqual({ ok: false, reason: "belum_disetujui" });

    await setup.payouts.setujuiPengembalian(order.admin, { pengembalianId: diminta.pengembalian.id });
    // Approved, but nobody has said where the money goes (AC 5).
    expect(
      await setup.payouts.terbitkanBuktiPengembalian(order.admin, {
        pengembalianId: diminta.pengembalian.id,
        ditransferPada: hariTransfer,
        bukti: buktiTransfer,
      }),
    ).toEqual({ ok: false, reason: "rekening_belum_ada" });
  });

  it("issues an RFD that names the Tagihan, lists the lines, says the fee was kept and carries the proof, and tells the Pemesan", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);
    const pengembalianId = await siapDitransfer(setup, order);

    const terbit = await setup.payouts.terbitkanBuktiPengembalian(order.admin, {
      pengembalianId,
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });

    expect(terbit).toMatchObject({
      ok: true,
      bukti: {
        nomorBukti: "RFD/2026/000001",
        nomorTagihan: order.tagihan.nomorTagihan,
        jumlah: 9_500_000,
        ditransferPada: hariTransfer,
        // AC 4: whether the Operator's fee was given back, and the amount that stayed.
        biayaLayananPlatform: { dikembalikan: false, jumlah: 150_000 },
        baris: [
          { label: "Harga Hak Pakai – Reguler 1 × 2 m", jumlah: 7_500_000 },
          { label: "Biaya Pemakaman", jumlah: 2_000_000 },
        ],
        rekening,
      },
    });
    if (!terbit.ok) return;
    // It is a document behind its own unguessable link, headed with the Operator's values.
    const dokumen = await setup.payouts.buktiPengembalian(terbit.bukti.link);
    expect(dokumen).toMatchObject({
      type: "bukti_pengembalian_dana",
      nomorBukti: "RFD/2026/000001",
      pemesan: { nama: "Budi Santoso" },
      biayaLayananPlatform: { dikembalikan: false, jumlah: 150_000 },
    });
    expect((await setup.payouts.buktiPengembalianPdf(terbit.bukti.link))?.fileName).toBe("RFD-2026-000001.pdf");
    // The family is told once, with the link to its own Bukti Pengembalian Dana.
    expect(setup.dikirimPengembalian).toEqual([
      {
        tagihanId: order.tagihanId,
        pemesan: { nama: "Budi Santoso", telepon: order.tagihan.addressee.phoneNumber, akunId: order.tagihan.addressee.accountId },
        nomorTagihan: order.tagihan.nomorTagihan,
        nomorPemesanan: order.nomor,
        nomorBukti: "RFD/2026/000001",
        url: `https://makam.test/dokumen/${terbit.bukti.link}`,
        ditransferPada: hariTransfer,
        jumlah: 9_500_000,
        biayaLayananPlatformDikembalikan: false,
      },
    ]);
  });

  it("leaves the Tagihan Dikembalikan Sebagian when the fee stayed, and Dikembalikan Penuh when it came back", async () => {
    const setup = payoutsOnTestDatabase(db);
    const sebagian = await dibayar(setup);
    const penuh = await dibayar(setup, { email: "keluarga.lain@contoh.id", name: "Dewi Lestari" });

    const idSebagian = await siapDitransfer(setup, sebagian);
    const idPenuh = await siapDitransfer(setup, penuh, { fault: "lokasi" });

    const terbitSebagian = await setup.payouts.terbitkanBuktiPengembalian(sebagian.admin, {
      pengembalianId: idSebagian,
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    const terbitPenuh = await setup.payouts.terbitkanBuktiPengembalian(penuh.admin, {
      pengembalianId: idPenuh,
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });

    // 9.500.000 of 9.650.000 came back: part of the bill, and the Tagihan says so.
    expect(terbitSebagian).toMatchObject({ ok: true, tagihan: { status: "dikembalikan_sebagian" } });
    expect(await setup.billing.tagihan(sebagian.tagihanId)).toMatchObject({ status: "dikembalikan_sebagian" });
    // The whole of it came back, so the bill is finished with.
    expect(terbitPenuh).toMatchObject({ ok: true, tagihan: { status: "dikembalikan_penuh" } });
    expect(await setup.billing.tagihan(penuh.tagihanId)).toMatchObject({ status: "dikembalikan_penuh" });
  });

  it("is refused for a date in the future, an unsupported proof, and never pays twice", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);
    const pengembalianId = await siapDitransfer(setup, order);

    expect(
      await setup.payouts.terbitkanBuktiPengembalian(order.admin, {
        pengembalianId,
        ditransferPada: "2026-12-31",
        bukti: buktiTransfer,
      }),
    ).toEqual({ ok: false, reason: "tanggal_tidak_valid" });
    expect(
      await setup.payouts.terbitkanBuktiPengembalian(order.admin, {
        pengembalianId,
        ditransferPada: hariTransfer,
        bukti: { body: new Uint8Array([1, 2, 3]), contentType: "application/pdf" },
      }),
    ).toEqual({ ok: false, reason: "berkas_tidak_didukung" });

    const pertama = await setup.payouts.terbitkanBuktiPengembalian(order.admin, {
      pengembalianId,
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    expect(pertama).toMatchObject({ ok: true, bukti: { nomorBukti: "RFD/2026/000001" } });
    if (!pertama.ok) return;
    // Money that has left the bank is not asked for again, and a second transfer
    // gets no second number.
    expect(
      await setup.payouts.terbitkanBuktiPengembalian(order.admin, {
        pengembalianId,
        ditransferPada: hariTransfer,
        bukti: buktiTransfer,
      }),
    ).toEqual({ ok: false, reason: "belum_disetujui" });
    // The Bukti the link shows is still the one and only RFD.
    expect(await setup.payouts.buktiPengembalian(pertama.bukti.link)).toMatchObject({ nomorBukti: "RFD/2026/000001" });
  });

  it("closes its own Tier 3 Antrean row when the proof is uploaded", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);
    const pengembalianId = await siapDitransfer(setup, order);
    expect(await setup.payouts.pengembalianSiapDitransfer()).toMatchObject([{ id: pengembalianId, jumlah: 9_500_000 }]);

    await setup.payouts.terbitkanBuktiPengembalian(order.admin, {
      pengembalianId,
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });

    // The row reads the flow's own state, so it closes itself: nothing is waiting.
    expect(await setup.payouts.pengembalianSiapDitransfer()).toEqual([]);
    expect((await setup.queues.antrean(order.admin)).filter((row) => row.type === "pengembalian")).toEqual([]);
  });
});

describe("the partner's side of a refund", () => {
  it("nets a refund from a partner that has not been paid out yet off that order's own Pencairan", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);
    await catatPemakaman(setup, order.nomor, wib("2026-10-02 10:00"));
    await setup.payouts.tick();

    const pengembalianId = await siapDitransfer(setup, order);
    const terbit = await setup.payouts.terbitkanBuktiPengembalian(order.admin, {
      pengembalianId,
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });

    expect(terbit).toMatchObject({ ok: true });
    // The 9.500.000 that came back is 7.500.000 of Hak Pakai plus 2.000.000 of
    // Biaya Pemakaman — the Lokasi Mitra's own share. It comes straight off the
    // order's items, so the Lokasi is paid for nothing and owes nothing.
    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toEqual([]);
    const diLokasi = await setup.payouts.pencairanLokasi(order.admin, order.lokasiMitra.id);
    if (!diLokasi.ok) throw new Error(`the Lokasi's own Pencairan was refused: ${diLokasi.reason}`);
    // The order is no longer offered to the Lokasi Mitra at all: its items were
    // taken off in full rather than left as Rp 0 lines nothing could be paid for.
    expect(diLokasi.lokasi.pesanan).toEqual([]);
    expect(await setup.payouts.jalankanPencairan(order.admin)).toEqual([]);
  });

  it("records a Potongan when the partner was already paid out", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);
    await catatPemakaman(setup, order.nomor, wib("2026-10-02 10:00"));
    await setup.payouts.tick();
    // The Lokasi Mitra is paid first, so the money is gone by the time the refund
    // is transferred: the returned share becomes a debt its next Pencairan nets.
    const [row] = await setup.payouts.jalankanPencairan(order.admin);
    const dicairkan = await setup.payouts.terbitkanBuktiPencairan(order.admin, {
      itemIds: row!.items.map((item) => item.id),
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    if (!dicairkan.ok) throw new Error(`the partner transfer was refused: ${dicairkan.reason}`);

    const pengembalianId = await siapDitransfer(setup, order);
    const terbit = await setup.payouts.terbitkanBuktiPengembalian(order.admin, {
      pengembalianId,
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });

    expect(terbit).toMatchObject({ ok: true, bukti: { link: expect.any(String) } });
    // 7.500.000 + 2.000.000 of the Lokasi Mitra's own share, as a debt it now owes.
    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toMatchObject([
      { amount: 9_500_000, alasanKind: "pengembalian_dana", status: "berjalan", terpotongSebesar: 0 },
    ]);
  });

  it("never charges a partner for a goodwill refund, which is the Operator's own money", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);
    await catatPemakaman(setup, order.nomor, wib("2026-10-02 10:00"));
    await setup.payouts.tick();

    const pengembalianId = await siapDitransfer(setup, order, {
      sebab: "goodwill",
      fault: "operator",
      penanggung: "operator",
      catatan: "Keluarga dalam kesulitan",
    });
    const terbit = await setup.payouts.terbitkanBuktiPengembalian(order.admin, {
      pengembalianId,
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });

    expect(terbit).toMatchObject({ ok: true, bukti: { penanggung: "operator" } });
    // The whole 9.650.000 came back, fee included, and the Lokasi Mitra is untouched:
    // it neither loses a Potongan nor has its Pencairan lowered.
    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toEqual([]);
    const run = await setup.payouts.jalankanPencairan(order.admin);
    expect(run[0]).toMatchObject({ jumlahItem: 9_500_000, potonganDipotong: 0, neto: 9_500_000 });
  });
});

describe("the Saat Duka cancellation of ticket 24", () => {
  it("flows through the whole refund, and the fault rule agrees with what the cancellation recorded", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);

    // The cancellation is ticket 24's own, driven through the real Pemesanan module:
    // it cancels the bill and records what should come back, less the Operator's fee.
    const batal = await setup.pemesanan.batalkanSaatDuka(order.pemesan, { nomor: order.nomor, alasan: "Keluarga berubah pikiran" });
    expect(batal).toMatchObject({ ok: true, tagihan: { dibatalkan: true, jumlahDikembalikan: 9_500_000 } });

    // The request is on the bill, and this flow can find it without being told.
    const [permintaan] = await setup.payouts.permintaanTagihan();
    expect(permintaan).toMatchObject({ tagihanId: order.tagihanId, jumlahDiminta: 9_500_000 });

    // Asking for it as a Pemesan's own cancellation gives **the same number** the
    // cancellation recorded — the fault rule and ticket 24's arithmetic coincide
    // here, which is why one test cannot stand for both.
    const diminta = await setup.db.transaction((tx) =>
      setup.payouts.catatPermintaanPengembalian(tx, {
        tagihanId: permintaan.tagihanId,
        sebab: "pemesanan_dibatalkan",
        fault: "pemesan",
        penanggung: "mitra",
      }),
    );
    if (!diminta.ok) throw new Error(`a request was refused: ${diminta.reason}`);
    expect(diminta.pengembalian.jumlah).toBe(permintaan.jumlahDiminta);

    const disetujui = await setup.payouts.setujuiPengembalian(order.admin, { pengembalianId: diminta.pengembalian.id });
    if (!disetujui.ok) throw new Error(`approval refused: ${disetujui.reason}`);
    await setup.db.transaction((tx) =>
      setup.payouts.catatRekeningPengembalian(tx, { pengembalianId: diminta.pengembalian.id, rekening }),
    );
    const terbit = await setup.payouts.terbitkanBuktiPengembalian(order.admin, {
      pengembalianId: diminta.pengembalian.id,
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });

    expect(terbit).toMatchObject({
      ok: true,
      bukti: { nomorBukti: "RFD/2026/000001", jumlah: 9_500_000 },
      tagihan: { status: "dikembalikan_sebagian" },
    });
    // The family really has its money: 9.500.000 of the 9.650.000 it paid.
    expect(setup.dikirimPengembalian).toMatchObject([{ jumlah: 9_500_000, nomorBukti: "RFD/2026/000001" }]);
  });

  it("differs from the cancellation's recorded amount by exactly the fee whenever the fault is not the Pemesan's", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await dibayar(setup);
    await setup.pemesanan.batalkanSaatDuka(order.pemesan, { nomor: order.nomor, alasan: "Batal" });
    const [permintaan] = await setup.payouts.permintaanTagihan();

    // The recorded divergence, asserted rather than described: ticket 24 kept the
    // fee for its cancellation, and the spec's table gives it back whenever the
    // fault is not the Pemesan's. The two numbers are the fee apart — which of
    // them is right for a non-Pemesan-fault refund is the owner's decision and is
    // recorded in the ticket's Comments, not settled here.
    const diminta = await setup.db.transaction((tx) =>
      setup.payouts.catatPermintaanPengembalian(tx, {
        tagihanId: permintaan.tagihanId,
        sebab: "ptsp_ditolak",
        fault: "operator",
        penanggung: "operator",
      }),
    );
    if (!diminta.ok) throw new Error(`a request was refused: ${diminta.reason}`);
    expect(diminta.pengembalian.jumlah - permintaan.jumlahDiminta).toBe(150_000);
  });
});

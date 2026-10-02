/**
 * Potongan, and the two views that read Pencairan (spec, Billing > Payouts;
 * CONTEXT.md; ticket 32's AC 4, 7, 8).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  adminLokasiOf,
  bayarTagihan,
  buktiTransfer,
  catatPemakaman,
  konfirmasiPesanan,
  mitraJasa,
  payoutsOnTestDatabase,
  pesananSaatDukaSiap,
  type PayoutsModul,
} from "../../../tests/support/payouts";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const pemakaman = wib("2026-10-02 10:00");
/** The date Admin Platform enters for a transfer: the fake Clock's today. */
const hariTransfer = "2026-10-01";

/** One paid, buried and triggered order: a Lokasi Mitra with Rp 9.500.000 waiting. */
async function orderDue(setup: PayoutsModul, options: { email?: string; name?: string } = {}) {
  const fixture = await pesananSaatDukaSiap(setup, options);
  const konfirmasi = await konfirmasiPesanan(setup, fixture);
  await bayarTagihan(setup, konfirmasi.tagihanId);
  await catatPemakaman(setup, fixture.nomor, pemakaman);
  await setup.payouts.tick();
  return { ...fixture, ...konfirmasi };
}

/** One job of a Mitra Jasa, recorded the way the Layanan module (ticket 51) will. */
async function pekerjaanMitraJasa(setup: PayoutsModul, akunId: string, lokasiId: string | null, due: boolean) {
  const itemId = await db.transaction(async (tx) => {
    const dibuat = await setup.payouts.catatItemLayananMitraJasa(tx, {
      akunId,
      nama: "Rina Partial",
      lokasiId,
      pekerjaan: "Pekerjaan #PKJ-0007",
      layanan: "Pembersihan Makam",
      tanggal: "2026-10-03",
      tarif: 350_000,
      nomorPemesanan: null,
    });
    if (!dibuat.ok) throw new Error(`item refused: ${dibuat.reason}`);
    return dibuat.id;
  });
  if (due) await db.transaction((tx) => setup.payouts.jadikanJatuhTempo(tx, itemId));
  return itemId;
}

describe("a Potongan", () => {
  it("is netted once, and a debt bigger than the whole run is never half-paid: it carries forward", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const besar = await setup.payouts.catatPotongan(order.admin, {
      lokasiId: order.lokasiMitra.id,
      amount: 20_000_000,
      alasanKind: "pengembalian_dana",
      alasan: "Pengembalian dana dua bulan",
    });
    if (!besar.ok) throw new Error(`Potongan refused: ${besar.reason}`);
    const [row] = await setup.payouts.jalankanPencairan(order.admin);

    // The run offers the whole debt and says there is nothing left to send.
    expect(row?.jumlahItem).toBe(9_500_000);
    expect(row?.potongan.map((entry) => [entry.amount, entry.dipotong])).toEqual([[20_000_000, 9_500_000]]);
    expect(row?.neto).toBeNull();
    const ditolak = await setup.payouts.terbitkanBuktiPencairan(order.admin, {
      itemIds: row!.items.map((item) => item.id),
      potonganIds: [besar.potongan.id],
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    expect(ditolak).toEqual({ ok: false, reason: "netto_negatif" });

    // The transfer itself still goes through when it names no debt, and the debt is
    // untouched: nothing was taken, so the whole Rp 20.000.000 carries forward.
    const terbit = await setup.payouts.terbitkanBuktiPencairan(order.admin, {
      itemIds: row!.items.map((item) => item.id),
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    expect(terbit).toMatchObject({ ok: true, bukti: { amount: 9_500_000, potonganCount: 0 } });
    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toMatchObject([
      { status: "berjalan", terpotongSebesar: 0, sisa: 20_000_000 },
    ]);
  });

  it("becomes an offline request at once when its Lokasi Mitra goes Berhenti, and only that Lokasi's", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const potongan = await setup.payouts.catatPotongan(order.admin, {
      lokasiId: order.lokasiMitra.id,
      amount: 2_000_000,
      alasanKind: "lainnya",
      alasan: "Koreksi transfer",
    });
    if (!potongan.ok) throw new Error(`Potongan refused: ${potongan.reason}`);

    expect(await setup.payouts.potonganBerhenti("00000000-0000-4000-8000-000000000000")).toEqual([]);
    expect(await setup.payouts.potonganBerhenti(order.lokasiMitra.id)).toEqual([potongan.potongan.id]);
    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toMatchObject([{ status: "perlu_offline", sisa: 2_000_000 }]);
    expect(await setup.payouts.potonganPerluOffline()).toHaveLength(1);
    // Harmless to repeat.
    expect(await setup.payouts.potonganBerhenti(order.lokasiMitra.id)).toEqual([]);
  });

  it("stays owed after 60 days as an offline request, which Admin Platform records when it is paid", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const potongan = await setup.payouts.catatPotongan(order.admin, {
      lokasiId: order.lokasiMitra.id,
      amount: 2_000_000,
      alasanKind: "lainnya",
      alasan: "Koreksi transfer",
    });
    if (!potongan.ok) throw new Error(`Potongan refused: ${potongan.reason}`);

    // 59 days old: still a line in the next transfer, not an offline request.
    expect(await setup.payouts.tickPotongan(wib("2026-11-29 09:00"))).toEqual([]);
    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toMatchObject([{ status: "berjalan" }]);

    // The 61st day: an offline request, which is a request and not a write-off.
    expect(await setup.payouts.tickPotongan(wib("2026-12-01 09:00"))).toEqual([potongan.potongan.id]);
    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toMatchObject([
      { status: "perlu_offline", perluOfflinePada: wib("2026-12-01 09:00"), sisa: 2_000_000 },
    ]);
    expect(await setup.payouts.potonganPerluOffline()).toHaveLength(1);
    // A tick again changes nothing: the status only ever moves this way.
    expect(await setup.payouts.tickPotongan(wib("2027-01-01 09:00"))).toEqual([]);

    setup.clock.set(wib("2026-12-20 10:00"));
    const lunas = await setup.payouts.catatPotonganLunas(order.admin, { potonganId: potongan.potongan.id, dibayarPada: "2026-12-20" });
    expect(lunas).toMatchObject({ ok: true, potongan: { status: "lunas", tercatatPada: wib("2026-12-20 00:00") } });
    expect(await setup.payouts.potonganPerluOffline()).toEqual([]);
    // And it is in the Audit Log, as every staff write is.
    expect(await setup.audit.entriesAbout({ kind: "potongan", id: potongan.potongan.id })).toMatchObject([
      { action: "pencairan.catat_potongan", lokasiId: order.lokasiMitra.id },
      { action: "pencairan.catat_potongan_lunas", lokasiId: order.lokasiMitra.id },
    ]);
  });

  it("is never charged to nobody, and never netted against a Mitra Jasa", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const { actor: mitra } = await mitraJasa(setup, order.admin);

    // A Mitra Jasa is a person with an Akun, not a Lokasi Mitra: it may not record
    // a debt at all, and an id that is nobody's Lokasi Mitra is nothing found.
    expect(
      await setup.payouts.catatPotongan(mitra, {
        lokasiId: mitra.accountId,
        amount: 100_000,
        alasanKind: "lainnya",
        alasan: "Tidak ada Lokasi Mitra di sini",
      }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(
      await setup.payouts.catatPotongan(order.admin, {
        lokasiId: "00000000-0000-4000-8000-000000000000",
        amount: 100_000,
        alasanKind: "lainnya",
        alasan: "Lokasi yang tidak ada",
      }),
    ).toEqual({ ok: false, reason: "tidak_ditemukan" });
    const adminLokasi = await adminLokasiOf(setup, order.admin, order.lokasiMitra.id, 1);
    expect(
      await setup.payouts.catatPotongan(adminLokasi, {
        lokasiId: order.lokasiMitra.id,
        amount: 100_000,
        alasanKind: "lainnya",
        alasan: "Bukan urusan Admin Lokasi",
      }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });

    // A job of the Mitra Jasa's, made due the way ticket 51's Keluhan window will,
    // while the Lokasi Mitra in the same run carries a Potongan.
    const itemId = await pekerjaanMitraJasa(setup, mitra.accountId, null, true);
    const potongan = await setup.payouts.catatPotongan(order.admin, {
      lokasiId: order.lokasiMitra.id,
      amount: 100_000,
      alasanKind: "lainnya",
      alasan: "Koreksi",
    });
    if (!potongan.ok) throw new Error(`Potongan refused: ${potongan.reason}`);
    const baris = await setup.payouts.jalankanPencairan(order.admin);
    const milikMitra = baris.find((entry) => entry.recipient.kind === "mitra_jasa")!;
    expect(milikMitra.potongan).toEqual([]);

    const ditolak = await setup.payouts.terbitkanBuktiPencairan(order.admin, {
      itemIds: [itemId],
      potonganIds: [potongan.potongan.id],
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    expect(ditolak).toEqual({ ok: false, reason: "potongan_ke_mitra_jasa_tidak_boleh" });
    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toMatchObject([{ status: "berjalan" }]);
  });
});

describe("a Mitra Jasa's own Pencairan and Bukti Pencairan", () => {
  it("shows the job, the Layanan, the date and the rate, and nothing else", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const { actor: mitra } = await mitraJasa(setup, order.admin);

    // Not due until its own trigger (ticket 51) says so: the Lokasi's trigger never
    // makes a Mitra Jasa's job payable.
    const itemId = await pekerjaanMitraJasa(setup, mitra.accountId, order.lokasiMitra.id, false);
    const menunggu = await setup.payouts.pencairanMitraJasa(mitra);
    expect(menunggu).toMatchObject({ ok: true, pekerjaan: [{ status: "belum_jatuh_tempo", bukti: null }] });
    expect(await setup.payouts.pencairanJatuhTempo()).toMatchObject([{ recipient: { kind: "lokasi_mitra" } }]);

    await db.transaction((tx) => setup.payouts.jadikanJatuhTempo(tx, itemId));
    const sebelum = await setup.payouts.pencairanMitraJasa(mitra);
    expect(sebelum).toMatchObject({
      ok: true,
      pekerjaan: [
        {
          itemId,
          pekerjaan: "Pekerjaan #PKJ-0007",
          layanan: "Pembersihan Makam",
          tanggal: "2026-10-03",
          tarif: 350_000,
          status: "jatuh_tempo",
          bukti: null,
        },
      ],
    });

    const terbit = await setup.payouts.terbitkanBuktiPencairan(order.admin, {
      itemIds: [itemId],
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    expect(terbit).toMatchObject({ ok: true, bukti: { nomorBukti: "BKP/2026/000001", amount: 350_000 } });
    if (!terbit.ok) return;
    expect(setup.dikirim[0]?.recipient).toEqual({
      kind: "mitra_jasa",
      akunId: mitra.accountId,
      nama: "Rina Partial",
      lokasiId: order.lokasiMitra.id,
    });

    // The Bukti Pencairan carries the job, the Layanan, the date and the rate — and
    // has no field an order number, a Lokasi or a family could travel in.
    const dokumen = await setup.payouts.buktiPencairan(terbit.bukti.link);
    expect(dokumen).toEqual({
      type: "bukti_pencairan_mitra_jasa",
      nomorBukti: "BKP/2026/000001",
      link: terbit.bukti.link,
      recipient: { nama: "Rina Partial" },
      amount: 350_000,
      ditransferPada: hariTransfer,
      header: {
        legalName: "PT Jaya Korpora Prima",
        address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
        phone: "(021) 555-0101",
        email: "halo@makam.co.id",
      },
      pekerjaan: [{ pekerjaan: "Pekerjaan #PKJ-0007", layanan: "Pembersihan Makam", tanggal: "2026-10-03", tarif: 350_000 }],
    });
    const sesudah = await setup.payouts.pencairanMitraJasa(mitra);
    expect(sesudah).toMatchObject({ ok: true, pekerjaan: [{ status: "dicairkan", bukti: { nomorBukti: "BKP/2026/000001" } }] });
  });

  it("is nobody else's: an Admin Platform and an Admin Lokasi are refused", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const { actor: mitra } = await mitraJasa(setup, order.admin);
    const adminLokasi = await adminLokasiOf(setup, order.admin, order.lokasiMitra.id, 1);
    await pekerjaanMitraJasa(setup, mitra.accountId, order.lokasiMitra.id, true);

    expect(await setup.payouts.pencairanMitraJasa(order.admin)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.payouts.pencairanMitraJasa(adminLokasi)).toEqual({ ok: false, reason: "tidak_berwenang" });
    // And the Mitra Jasa's own list is its own rows only.
    const sendiri = await setup.payouts.pencairanMitraJasa(mitra);
    expect(sendiri.ok).toBe(true);
    if (!sendiri.ok) return;
    expect(sendiri.pekerjaan).toHaveLength(1);
    // The Lokasi Mitra's own Admin Lokasi does not see it either: it is the Mitra
    // Jasa's rate, not the Lokasi's own money.
    const milikLokasi = await setup.payouts.pencairanLokasi(adminLokasi, order.lokasiMitra.id);
    if (!milikLokasi.ok) throw new Error(`the Lokasi view was refused: ${milikLokasi.reason}`);
    expect(milikLokasi.lokasi.pesanan.flatMap((pesanan) => pesanan.items)).toHaveLength(2);
  });
});

describe("the Admin Lokasi's own Pencairan", () => {
  it("is per order with the Bukti Pencairan that settled it, and nothing from another Lokasi Mitra", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const lain = await orderDue(setup, { name: "Makam Sawah Besar", email: "keluarga.lain@contoh.id" });
    const adminLokasi = await adminLokasiOf(setup, order.admin, order.lokasiMitra.id, 1);
    const adminLokasiLain = await adminLokasiOf(setup, order.admin, lain.lokasiMitra.id, 2);
    const potongan = await setup.payouts.catatPotongan(order.admin, {
      lokasiId: order.lokasiMitra.id,
      amount: 500_000,
      alasanKind: "lainnya",
      alasan: "Koreksi",
    });
    if (!potongan.ok) throw new Error(`Potongan refused: ${potongan.reason}`);

    // Nothing is transferred yet: the order is Jatuh tempo and there is no Bukti.
    const menunggu = await setup.payouts.pencairanLokasi(adminLokasi, order.lokasiMitra.id);
    if (!menunggu.ok) throw new Error(`the Lokasi view was refused: ${menunggu.reason}`);
    expect(menunggu.lokasi.pesanan).toHaveLength(1);
    expect(menunggu.lokasi.pesanan[0]?.nomorPemesanan).toBe(order.nomor);
    expect(menunggu.lokasi.pesanan[0]?.status).toBe("jatuh_tempo");
    expect(menunggu.lokasi.pesanan[0]?.amount).toBe(9_500_000);
    expect(menunggu.lokasi.pesanan[0]?.bukti).toBeNull();
    expect(menunggu.lokasi.pesanan[0]?.items.map((item) => item.amount)).toEqual([7_500_000, 2_000_000]);
    expect(menunggu.lokasi.bukti).toEqual([]);
    expect(menunggu.lokasi.potongan).toMatchObject([{ amount: 500_000, sisa: 500_000, status: "berjalan" }]);

    // The transfer settles it, with the Potongan line on the Bukti Pencairan.
    const [row] = await setup.payouts.jalankanPencairan(order.admin);
    const terbit = await setup.payouts.terbitkanBuktiPencairan(order.admin, {
      itemIds: row!.items.map((item) => item.id),
      potonganIds: [potongan.potongan.id],
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    expect(terbit).toMatchObject({ ok: true, bukti: { amount: 9_000_000 } });

    const setelah = await setup.payouts.pencairanLokasi(adminLokasi, order.lokasiMitra.id);
    if (!setelah.ok) throw new Error(`the Lokasi view was refused: ${setelah.reason}`);
    expect(setelah.lokasi.pesanan[0]?.status).toBe("dicairkan");
    expect(setelah.lokasi.pesanan[0]?.bukti).toMatchObject({ nomorBukti: "BKP/2026/000001", amount: 9_000_000 });
    expect(setelah.lokasi.bukti).toHaveLength(1);
    expect(setelah.lokasi.bukti[0]?.potongan).toEqual([{ amount: 500_000, alasan: "Koreksi" }]);
    expect(setelah.lokasi.potongan).toMatchObject([{ status: "terpotong", sisa: 0 }]);

    // The other Lokasi Mitra's Admin Lokasi sees its own order and not this one,
    // and neither of them may read the other's.
    const milikLain = await setup.payouts.pencairanLokasi(adminLokasiLain, lain.lokasiMitra.id);
    if (!milikLain.ok) throw new Error(`the Lokasi view was refused: ${milikLain.reason}`);
    expect(milikLain.lokasi.pesanan.map((pesanan) => pesanan.nomorPemesanan)).toEqual([lain.nomor]);
    expect(await setup.payouts.pencairanLokasi(adminLokasi, lain.lokasiMitra.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.payouts.pencairanLokasi(adminLokasiLain, order.lokasiMitra.id)).toEqual({ ok: false, reason: "tidak_berwenang" });
  });
});

/**
 * The Pencairan run and the Bukti Pencairan it issues (spec, Billing > Payouts:
 * "one row per recipient with due items minus Potongan. Items can be held out
 * with a reason. Admin Platform transfers by hand, uploads the proof and enters
 * the date, which issues one Bukti Pencairan"; ticket 32's AC 5).
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
  payoutsOnTestDatabase,
  pesananSaatDukaSiap,
  type PayoutsModul,
} from "../../../tests/support/payouts";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const pemakaman = wib("2026-10-02 10:00");
/** The date Admin Platform enters: the fake Clock's today, so it has happened. */
const hariTransfer = "2026-10-01";

/** One paid, buried and triggered order at a Lokasi Mitra with a bank account: Rp 9.500.000 waiting. */
async function orderDue(setup: PayoutsModul, options: { email?: string; name?: string } = {}) {
  const fixture = await pesananSaatDukaSiap(setup, options);
  const konfirmasi = await konfirmasiPesanan(setup, fixture);
  await bayarTagihan(setup, konfirmasi.tagihanId);
  await catatPemakaman(setup, fixture.nomor, pemakaman);
  await setup.payouts.tick();
  await setup.lokasi.changeBankAccount(fixture.admin, fixture.lokasiMitra.id, {
    bankName: "Bank Syariah Indonesia",
    accountNumber: "7123456789",
    accountHolder: "Yayasan Al-Ikhlas",
    reason: null,
  });
  return { ...fixture, ...konfirmasi };
}

/** Another listed Lokasi Mitra with an order of its own, paid, buried and triggered. */
async function orderDueAtLokasiLain(setup: PayoutsModul, nama: string, email: string) {
  const fixture = await pesananSaatDukaSiap(setup, { name: nama, email });
  const konfirmasi = await konfirmasiPesanan(setup, fixture);
  await bayarTagihan(setup, konfirmasi.tagihanId);
  await catatPemakaman(setup, fixture.nomor, pemakaman);
  await setup.payouts.tick();
  return { ...fixture, ...konfirmasi };
}

describe("the Pencairan run", () => {
  it("is one row per recipient: its due items, the Potongan it carries, what is left and where to pay it", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const potongan = await setup.payouts.catatPotongan(order.admin, {
      lokasiId: order.lokasiMitra.id,
      amount: 1_500_000,
      alasanKind: "pengembalian_dana",
      alasan: "Pengembalian dana untuk pesanan sebelumnya",
      tautan: "https://makam.test/dokumen/RFD",
    });
    if (!potongan.ok) throw new Error(`Potongan refused: ${potongan.reason}`);

    const [row] = await setup.payouts.jalankanPencairan(order.admin);
    expect(row?.recipient).toEqual({ kind: "lokasi_mitra", lokasiId: order.lokasiMitra.id, nama: "Makam Wakaf Al-Ikhlas" });
    expect(row?.jumlahItem).toBe(9_500_000);
    expect(row?.potonganDipotong).toBe(1_500_000);
    expect(row?.neto).toBe(8_000_000);
    expect(row?.jatuhTempoAt).toEqual(wib("2026-10-06 23:59"));
    expect(row?.rekening).toEqual({
      bankName: "Bank Syariah Indonesia",
      accountNumber: "7123456789",
      accountHolder: "Yayasan Al-Ikhlas",
    });
    expect(row?.items.map((item) => item.kind)).toEqual(["harga_hak_pakai", "biaya_pemakaman"]);
    expect(row?.potongan.map((entry) => [entry.amount, entry.dipotong, entry.alasanKind])).toEqual([[1_500_000, 1_500_000, "pengembalian_dana"]]);
  });

  it("is a row per recipient, not per item: two Lokasi Mitra waiting means two rows", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    await orderDueAtLokasiLain(setup, "Makam Sawah Besar", "keluarga.lain@contoh.id");

    const rows = await setup.payouts.jalankanPencairan(order.admin);

    expect(rows.map((row) => [row.recipient.nama, row.items.length, row.neto])).toEqual([
      ["Makam Wakaf Al-Ikhlas", 2, 9_500_000],
      ["Makam Sawah Besar", 2, 9_500_000],
    ]);
    expect(await setup.payouts.pencairanJatuhTempo()).toHaveLength(2);
  });

  it("shows an Admin Lokasi nothing of the run, and a Mitra Jasa nothing of it either", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const adminLokasi = await adminLokasiOf(setup, order.admin, order.lokasiMitra.id, 1);

    expect(await setup.payouts.jalankanPencairan(adminLokasi)).toEqual([]);
    expect(await setup.payouts.jalankanPencairan({ ...order.admin, roles: ["mitra_jasa"], lokasiIds: [] })).toEqual([]);
  });

  it("keeps a held-out item out of the run and out of the Antrean, and takes it back when it is released", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const [item] = (await setup.payouts.jalankanPencairan(order.admin))[0]!.items;

    const ditahan = await setup.payouts.tahanPencairan(order.admin, { itemId: item.id, alasan: "Menunggu rekening baru" });

    expect(ditahan).toMatchObject({ ok: true, ditahan: true });
    const [row] = await setup.payouts.jalankanPencairan(order.admin);
    expect(row?.ditahan).toEqual([{ id: item.id, label: item.label, amount: 7_500_000, alasan: "Menunggu rekening baru" }]);
    expect(row?.items.map((satu) => satu.id)).not.toContain(item.id);
    // The Antrean row asks for what is really waiting, so a held item is not in it.
    expect(await setup.payouts.pencairanJatuhTempo()).toMatchObject([{ itemCount: 1, amount: 2_000_000 }]);
    // And it cannot be transferred while it is held.
    expect(
      await setup.payouts.terbitkanBuktiPencairan(order.admin, { itemIds: [item.id], ditransferPada: hariTransfer, bukti: buktiTransfer }),
    ).toEqual({ ok: false, reason: "item_tidak_tersedia" });

    await setup.payouts.tahanPencairan(order.admin, { itemId: item.id, alasan: null });
    expect((await setup.payouts.jalankanPencairan(order.admin))[0]?.items.map((satu) => satu.id)).toContain(item.id);
  });
});

describe("issuing a Bukti Pencairan", () => {
  it("covers every item and Potongan in one BKP, marks them paid, and sends the recipient its link", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const potongan = await setup.payouts.catatPotongan(order.admin, {
      lokasiId: order.lokasiMitra.id,
      amount: 1_500_000,
      alasanKind: "lainnya",
      alasan: "Koreksi transfer bulan lalu",
    });
    if (!potongan.ok) throw new Error(`Potongan refused: ${potongan.reason}`);
    const [row] = await setup.payouts.jalankanPencairan(order.admin);

    const terbit = await setup.payouts.terbitkanBuktiPencairan(order.admin, {
      itemIds: row!.items.map((item) => item.id),
      potonganIds: [potongan.potongan.id],
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });

    expect(terbit).toMatchObject({
      ok: true,
      bukti: {
        nomorBukti: "BKP/2026/000001",
        recipient: { kind: "lokasi_mitra", nama: "Makam Wakaf Al-Ikhlas" },
        amount: 8_000_000,
        ditransferPada: hariTransfer,
        items: [
          { label: "Harga Hak Pakai – Reguler 1 × 2 m", amount: 7_500_000, nomorPemesanan: order.nomor },
          { label: "Biaya Pemakaman", amount: 2_000_000, nomorPemesanan: order.nomor },
        ],
        potongan: [{ amount: 1_500_000, alasan: "Koreksi transfer bulan lalu" }],
      },
    });
    if (!terbit.ok) return;
    // Nothing is left waiting, and the Potongan is settled with it.
    expect(await setup.payouts.pencairanJatuhTempo()).toEqual([]);
    expect(await setup.payouts.jalankanPencairan(order.admin)).toEqual([]);
    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toMatchObject([
      { status: "terpotong", terpotongSebesar: 1_500_000, sisa: 0 },
    ]);
    // The recipient is told once, with the link to its own Bukti Pencairan.
    expect(setup.dikirim).toEqual([
      {
        id: expect.any(String),
        recipient: { kind: "lokasi_mitra", lokasiId: order.lokasiMitra.id, nama: "Makam Wakaf Al-Ikhlas" },
        nomorBukti: "BKP/2026/000001",
        url: `https://makam.test/dokumen/${terbit.bukti.link}`,
        ditransferPada: hariTransfer,
        amount: 8_000_000,
      },
    ]);
    // It is a document behind its own unguessable link, headed with the Operator's values.
    expect(await setup.payouts.buktiPencairan(terbit.bukti.link)).toMatchObject({
      type: "bukti_pencairan",
      nomorBukti: "BKP/2026/000001",
      header: { legalName: "PT Jaya Korpora Prima" },
    });
    expect(await setup.payouts.buktiPencairan("bukan-tautan")).toBeNull();
    // And it is in the Audit Log, as every staff write is.
    expect(await setup.audit.entriesAbout({ kind: "bukti_pencairan", id: terbit.bukti.id })).toMatchObject([
      { action: "pencairan.terbitkan_bukti", lokasiId: order.lokasiMitra.id, after: { amount: 8_000_000, items: 2, potongan: 1 } },
    ]);
  });

  it("pays the same item only once, however many transfers are made over it at the same moment", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const [row] = await setup.payouts.jalankanPencairan(order.admin);
    const itemIds = row!.items.map((item) => item.id);

    // Both transfers are in flight before either can finish, on two connections:
    // the second waits on the first one's row lock and then finds the items already
    // `dicairkan`, so it refuses instead of paying them a second time.
    const [pertama, kedua] = await Promise.all([
      setup.payouts.terbitkanBuktiPencairan(order.admin, { itemIds, ditransferPada: hariTransfer, bukti: buktiTransfer }),
      setup.payouts.terbitkanBuktiPencairan(order.admin, { itemIds, ditransferPada: hariTransfer, bukti: buktiTransfer }),
    ]);

    // Whichever of the two got the lock first is the one that paid: the other one
    // wakes up to find every item `dicairkan` and refuses. The invariant is that
    // exactly one transfer happened, not which promise it was.
    const berhasil = [pertama, kedua].filter((hasil) => hasil.ok);
    const ditolak = [pertama, kedua].filter((hasil) => !hasil.ok);
    expect(berhasil).toHaveLength(1);
    expect(ditolak).toEqual([{ ok: false, reason: "item_tidak_tersedia" }]);
    if (!berhasil[0]?.ok) return;
    const jadi = berhasil[0];
    // One Bukti Pencairan, covering the items exactly once between them.
    const setelah = await setup.payouts.pencairanLokasi(order.admin, order.lokasiMitra.id);
    if (!setelah.ok) throw new Error(`the Lokasi view was refused: ${setelah.reason}`);
    expect(setelah.lokasi.bukti).toHaveLength(1);
    expect(jadi.bukti.nomorBukti).toBe("BKP/2026/000001");
    expect(setelah.lokasi.bukti[0]?.items.map((item) => item.label)).toEqual([
      "Harga Hak Pakai – Reguler 1 × 2 m",
      "Biaya Pemakaman",
    ]);
    expect(setelah.lokasi.pesanan).toMatchObject([{ nomorPemesanan: order.nomor, status: "dicairkan", amount: 9_500_000 }]);
    // The recipient was told once and the run is empty: the money is out once.
    expect(setup.dikirim).toHaveLength(1);
    expect(await setup.payouts.jalankanPencairan(order.admin)).toEqual([]);
  });

  it("refuses a net that would be negative, and leaves the items and the Potongan exactly as they were", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const potongan = await setup.payouts.catatPotongan(order.admin, {
      lokasiId: order.lokasiMitra.id,
      amount: 12_000_000,
      alasanKind: "pengembalian_dana",
      alasan: "Pengembalian dana lebih besar dari yang ditransfer",
    });
    if (!potongan.ok) throw new Error(`Potongan refused: ${potongan.reason}`);
    const [row] = await setup.payouts.jalankanPencairan(order.admin);
    // The run says so before anybody tries: the Potongan swallow the whole transfer.
    expect(row?.neto).toBeNull();
    expect(row?.items).toHaveLength(2);

    const ditolak = await setup.payouts.terbitkanBuktiPencairan(order.admin, {
      itemIds: row!.items.map((item) => item.id),
      potonganIds: [potongan.potongan.id],
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });

    expect(ditolak).toEqual({ ok: false, reason: "netto_negatif" });
    expect(await setup.payouts.pencairanJatuhTempo()).toMatchObject([{ itemCount: 2 }]);
    expect(await setup.payouts.potonganOfLokasi(order.lokasiMitra.id)).toMatchObject([{ status: "berjalan", sisa: 12_000_000 }]);
    expect(setup.dikirim).toEqual([]);
  });

  it("refuses two recipients' items in one transfer, and a Potongan of another Lokasi Mitra's", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const lain = await orderDueAtLokasiLain(setup, "Makam Sawah Besar", "keluarga.lain@contoh.id");
    const potongan = await setup.payouts.catatPotongan(order.admin, {
      lokasiId: order.lokasiMitra.id,
      amount: 500_000,
      alasanKind: "lainnya",
      alasan: "Koreksi",
    });
    if (!potongan.ok) throw new Error(`Potongan refused: ${potongan.reason}`);
    const rows = await setup.payouts.jalankanPencairan(order.admin);

    const row = rows.find((entry) => entry.recipient.lokasiId === order.lokasiMitra.id)!;
    const rowLain = rows.find((entry) => entry.recipient.lokasiId === lain.lokasiMitra.id)!;

    const dicampur = await setup.payouts.terbitkanBuktiPencairan(order.admin, {
      itemIds: [row.items[0]!.id, rowLain.items[0]!.id],
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    expect(dicampur).toEqual({ ok: false, reason: "item_beda_penerima" });

    const salahLokasi = await setup.payouts.terbitkanBuktiPencairan(order.admin, {
      itemIds: rowLain.items.map((item) => item.id),
      potonganIds: [potongan.potongan.id],
      ditransferPada: hariTransfer,
      bukti: buktiTransfer,
    });
    expect(salahLokasi).toEqual({ ok: false, reason: "potongan_tidak_tersedia" });
  });

  it("is Admin Platform's alone, and refuses a transfer date that has not happened yet", async () => {
    const setup = payoutsOnTestDatabase(db);
    const order = await orderDue(setup);
    const [row] = await setup.payouts.jalankanPencairan(order.admin);
    const itemIds = row!.items.map((item) => item.id);
    const adminLokasi = await adminLokasiOf(setup, order.admin, order.lokasiMitra.id, 1);

    expect(
      await setup.payouts.terbitkanBuktiPencairan(adminLokasi, { itemIds, ditransferPada: hariTransfer, bukti: buktiTransfer }),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });

    // The fake Clock sits at Thursday 2026-10-01, so a date after it is refused.
    const kedepan = await orderDue(setup, { email: "pemesan.kedua@contoh.id" });
    const rowKedepan = (await setup.payouts.jalankanPencairan(kedepan.admin)).find(
      (entry) => entry.recipient.lokasiId === kedepan.lokasiMitra.id,
    )!;
    const ditolak = await setup.payouts.terbitkanBuktiPencairan(kedepan.admin, {
      itemIds: rowKedepan.items.map((item) => item.id),
      ditransferPada: "2026-12-01",
      bukti: buktiTransfer,
    });
    expect(ditolak).toEqual({ ok: false, reason: "tanggal_tidak_valid" });
  });
});

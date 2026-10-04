import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { layananOnTestDatabase } from "../../../tests/support/layanan";
import { HARGA_BUNGA_TABUR, mitraJasaUntuk, orderTpu, saatDukaTpuDikonfirmasi, siapTpu } from "../../../tests/support/layanan-tpu";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { tandaiTerlambatTpu } from "./terlambat-tpu";

/**
 * A Saat Duka TPU order that ends takes its hari-H Layanan with it (ticket 117; spec, Pengurusan > cancellation and
 * Layanan > Pekerjaan Layanan at a TPU). Driven through the Pengurusan, Layanan, Refunds, Payouts and Queues public
 * functions: the order's own cancellation, the jobs the family and the Mitra Jasa read back, the refund request
 * Refunds holds, the Pencairan the Mitra Jasa sees and the Antrean's rows.
 *
 * The fake Clock sits at Thursday 1 Oktober 2026 09:00 WIB; the burial is agreed for 2 Oktober, which is every hari-H
 * Layanan's target date. The Mitra Jasa rate of a Bunga Tabur is Rp 150.000.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const TARIF = 150_000;
const LABEL_BUNGA = "Layanan – Bunga Tabur (Reguler)";
const foto = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);

async function siap() {
  const setup = layananOnTestDatabase(db, { pekerjaanNyata: true });
  const tpuSiap = await siapTpu(setup);
  const tarif = await setup.tariffs.setTarifMitraJasa(tpuSiap.admin, tpuSiap.bunga.id, { amount: TARIF, effectiveOn: "2026-10-01", reason: null });
  if (!tarif.ok) throw new Error(`tarif refused: ${tarif.reason}`);
  return { setup, ...tpuSiap };
}
type Siap = Awaited<ReturnType<typeof siap>>;
type Mitra = Awaited<ReturnType<typeof mitraJasaUntuk>>;

/** A confirmed Saat Duka TPU order with `jumlah` hari-H Bunga Tabur, paid (Lunas) or not. */
async function pesananHariH(s: Siap, jumlah: number, options: { dibayar: boolean }) {
  const hariH = Array.from({ length: jumlah }, (_, urutan) => ({ layananVariantId: s.bunga.id, teks: `Untuk almarhum ${urutan + 1}` }));
  const { nomor, hasil } = await saatDukaTpuDikonfirmasi(s.setup, s, hariH);
  if (options.dibayar) {
    const dibayar = await s.setup.billing.recordPayment(hasil.tagihan.id, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
  }
  const order = await s.setup.layanan.pesananTpuOf(nomor, s.pemesan);
  return { nomor, tagihan: hasil.tagihan, pekerjaan: order!.item.map((satu) => satu.id) };
}

/** The family's Layanan page: each hari-H job's status, in the order it was added. */
async function statusPekerjaan(s: Siap, nomor: string) {
  const order = await s.setup.layanan.pesananTpuOf(nomor, s.pemesan);
  return order!.item.map((satu) => satu.status);
}

const batalkan = (s: Siap, nomor: string) => s.setup.pengurusan.batalkanPengurusan(s.pemesan, { nomor });

async function diterima(s: Siap, mitra: Mitra, pekerjaanId: string) {
  const tugas = await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId, mitraJasaId: mitra.id });
  if (!tugas.ok) throw new Error(`assign refused: ${tugas.reason}`);
  const jawab = await s.setup.layanan.jawabPenugasan(mitra.actor, { pekerjaanId, jawaban: "terima" });
  if (!jawab.ok) throw new Error(`accept refused: ${jawab.reason}`);
}

/** The first shot: the job becomes Sedang Dikerjakan. */
async function mulai(s: Siap, mitra: Mitra, pekerjaanId: string) {
  const diambil = await s.setup.layanan.simpanBuktiTpu(mitra.actor, { pekerjaanId, kind: "foto_sesudah", takenAt: s.setup.clock.now(), file: { body: foto(), contentType: "image/jpeg" } });
  if (!diambil.ok) throw new Error(`shot refused: ${diambil.reason}`);
}

async function kirim(s: Siap, mitra: Mitra, pekerjaanId: string) {
  const dikirim = await s.setup.layanan.kirimBuktiTpu(mitra.actor, { pekerjaanId });
  if (!dikirim.ok) throw new Error(`send refused: ${dikirim.reason}`);
}

async function setujui(s: Siap, pekerjaanId: string) {
  const disetujui = await s.setup.layanan.setujuiBuktiTpu(s.admin, { pekerjaanId });
  if (!disetujui.ok) throw new Error(`approve refused: ${disetujui.reason}`);
}

async function pencairanSaya(s: Siap, mitra: Mitra) {
  const hasil = await s.setup.payouts.pencairanMitraJasa(mitra.actor);
  if (!hasil.ok) throw new Error(hasil.reason);
  return hasil.pekerjaan;
}

/** What the Antrean shows Admin Platform for TPU jobs at `at`, on a second composition over the same database. */
async function antreanTpu(s: Siap, at: Date) {
  const komposisi = queuesOnTestDatabase(db);
  komposisi.clock.set(at);
  return (await komposisi.queues.antrean(s.admin)).filter((satu) => satu.type.startsWith("pekerjaan_tpu_"));
}

describe("cancelling a paid Saat Duka TPU order whose hari-H Layanan is still Dijadwalkan", () => {
  it("makes the Pekerjaan Layanan Dibatalkan on the family's page and still asks for the whole Tagihan back", async () => {
    const s = await siap();
    const { nomor, tagihan } = await pesananHariH(s, 1, { dibayar: true });
    expect(await statusPekerjaan(s, nomor)).toEqual(["dijadwalkan"]);

    const batal = await batalkan(s, nomor);

    expect(batal).toEqual({ ok: true, status: "dibatalkan", tagihanDibatalkan: false, pengembalian: tagihan.total });
    expect(await statusPekerjaan(s, nomor)).toEqual(["dibatalkan"]);
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ nomorPemesanan: nomor, jumlah: tagihan.total, penuh: true, status: "diajukan" });
    // The Layanan line is asked once: the refund is the order's own lines plus exactly the job it cancelled.
    expect(permintaan!.lines.filter((baris) => baris.label === LABEL_BUNGA).map((baris) => baris.amount)).toEqual([HARGA_BUNGA_TABUR]);
    expect(permintaan!.lines.reduce((jumlah, baris) => jumlah + baris.amount, 0)).toBe(tagihan.total);
  });

  it("stops offering the job: Admin Platform's list, the picker and the Antrean no longer carry it, and it cannot be assigned", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { nomor, pekerjaan } = await pesananHariH(s, 1, { dibayar: true });
    const [pekerjaanId] = pekerjaan;
    expect((await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin)).map((satu) => satu.id)).toEqual([pekerjaanId]);
    expect(await antreanTpu(s, wib("2026-10-02 07:00"))).toMatchObject([{ type: "pekerjaan_tpu_tanpa_mitra", subjectId: pekerjaanId }]);

    await batalkan(s, nomor);

    expect(await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin)).toEqual([]);
    expect(await antreanTpu(s, wib("2026-10-02 07:00"))).toEqual([]);
    expect(await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId: pekerjaanId!, mitraJasaId: mitra.id })).toEqual({ ok: false, reason: "bukan_dijadwalkan" });
  });

  it("ends the assignment of a Mitra Jasa who accepted but has not started: no job to answer, no proof to take, no Pencairan, no decline on the scorecard", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { nomor, pekerjaan } = await pesananHariH(s, 1, { dibayar: true });
    const [pekerjaanId] = pekerjaan as [string];
    await diterima(s, mitra, pekerjaanId);
    expect((await s.setup.layanan.pekerjaanTpuSaya(mitra.actor)).aktif).toHaveLength(1);

    await batalkan(s, nomor);

    expect(await statusPekerjaan(s, nomor)).toEqual(["dibatalkan"]);
    // The Mitra Jasa's own list: nothing left to do, and the job is in their history as taken off them.
    const saya = await s.setup.layanan.pekerjaanTpuSaya(mitra.actor);
    expect(saya.aktif).toEqual([]);
    expect(saya.riwayat).toMatchObject([{ id: pekerjaanId, hasil: "dilepas" }]);
    expect(await s.setup.layanan.jawabPenugasan(mitra.actor, { pekerjaanId, jawaban: "terima" })).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect(await s.setup.layanan.simpanBuktiTpu(mitra.actor, { pekerjaanId, kind: "foto_sesudah", takenAt: s.setup.clock.now(), file: { body: foto(), contentType: "image/jpeg" } })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
    // Nothing for Admin Platform to approve, so nothing ever reaches a Pencairan.
    expect(await s.setup.layanan.setujuiBuktiTpu(s.admin, { pekerjaanId })).toEqual({ ok: false, reason: "bukan_menunggu_verifikasi" });
    expect(await pencairanSaya(s, mitra)).toEqual([]);
    // A release is not a decline, and the Antrean has no "perlu penugasan ulang" row for a job that is gone.
    const skor = await s.setup.layanan.skorMitraJasa(s.admin, mitra.id);
    if (!skor.ok) throw new Error(skor.reason);
    expect(skor.skor.declines).toBe(0);
    expect(await antreanTpu(s, wib("2026-10-03 09:00"))).toEqual([]);
  });

  it("cancels a Terlambat one nobody did, and refunds it with the rest", async () => {
    const s = await siap();
    const { nomor, tagihan } = await pesananHariH(s, 1, { dibayar: true });
    s.setup.clock.set(wib("2026-10-05 09:00"));
    expect(await tandaiTerlambatTpu(db, s.setup.clock.now())).toBe(1);
    expect(await statusPekerjaan(s, nomor)).toEqual(["terlambat"]);

    expect(await batalkan(s, nomor)).toMatchObject({ ok: true, pengembalian: tagihan.total });
    expect(await statusPekerjaan(s, nomor)).toEqual(["dibatalkan"]);
  });
});

describe("cancelling a Saat Duka TPU order whose hari-H Layanan is under way or done", () => {
  it("refunds only the one still Dijadwalkan when the other is Selesai: the done Pekerjaan Layanan keeps its price and its Pencairan", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { nomor, tagihan, pekerjaan } = await pesananHariH(s, 2, { dibayar: true });
    const [selesai] = pekerjaan as [string, string];
    await diterima(s, mitra, selesai);
    await mulai(s, mitra, selesai);
    await kirim(s, mitra, selesai);
    await setujui(s, selesai);
    expect(await statusPekerjaan(s, nomor)).toEqual(["selesai", "dijadwalkan"]);

    const batal = await batalkan(s, nomor);

    expect(batal).toMatchObject({ ok: true, pengembalian: tagihan.total - HARGA_BUNGA_TABUR });
    expect(await statusPekerjaan(s, nomor)).toEqual(["selesai", "dibatalkan"]);
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ jumlah: tagihan.total - HARGA_BUNGA_TABUR, penuh: false });
    expect(permintaan!.lines.filter((baris) => baris.label === LABEL_BUNGA)).toHaveLength(1);
    expect(await pencairanSaya(s, mitra)).toMatchObject([{ tarif: TARIF, status: "belum_jatuh_tempo" }]);
  });

  it("leaves a Sedang Dikerjakan Pekerjaan Layanan running and paid for, and cancels the one still Dijadwalkan", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { nomor, tagihan, pekerjaan } = await pesananHariH(s, 2, { dibayar: true });
    const [berjalan] = pekerjaan as [string, string];
    await diterima(s, mitra, berjalan);
    await mulai(s, mitra, berjalan);
    expect(await statusPekerjaan(s, nomor)).toEqual(["sedang_dikerjakan", "dijadwalkan"]);

    const batal = await batalkan(s, nomor);

    // The work already begun is not given back, so the family is refunded one Layanan less than it paid for.
    expect(batal).toMatchObject({ ok: true, pengembalian: tagihan.total - HARGA_BUNGA_TABUR });
    expect(await statusPekerjaan(s, nomor)).toEqual(["sedang_dikerjakan", "dibatalkan"]);
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ jumlah: tagihan.total - HARGA_BUNGA_TABUR, penuh: false });
    // It is finished the usual way and the Mitra Jasa is paid for it.
    await kirim(s, mitra, berjalan);
    await setujui(s, berjalan);
    expect(await statusPekerjaan(s, nomor)).toEqual(["selesai", "dibatalkan"]);
    expect(await pencairanSaya(s, mitra)).toMatchObject([{ tarif: TARIF }]);
  });

  it("does not refund a Terlambat Pekerjaan Layanan the Pemesan already cancelled: its line was asked of Refunds then, and the order's cancellation asks the rest", async () => {
    const s = await siap();
    const { nomor, tagihan, pekerjaan } = await pesananHariH(s, 2, { dibayar: true });
    s.setup.clock.set(wib("2026-10-05 09:00"));
    expect(await tandaiTerlambatTpu(db, s.setup.clock.now())).toBe(2);
    const [dibatalkanDulu] = pekerjaan as [string, string];
    expect(await s.setup.layanan.batalkanPekerjaanTerlambatTpuOlehPemesan(s.pemesan, { pekerjaanId: dibatalkanDulu })).toEqual({ ok: true });

    const batal = await batalkan(s, nomor);

    expect(batal).toMatchObject({ ok: true, pengembalian: tagihan.total - HARGA_BUNGA_TABUR });
    expect(await statusPekerjaan(s, nomor)).toEqual(["dibatalkan", "dibatalkan"]);
    // One request, joined: the whole Tagihan once, and the Layanan line of each job exactly once.
    const permintaan = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan).toHaveLength(1);
    expect(permintaan[0]).toMatchObject({ jumlah: tagihan.total });
    expect(permintaan[0]!.lines.filter((baris) => baris.label === LABEL_BUNGA)).toHaveLength(2);
    expect(permintaan[0]!.lines.reduce((jumlah, baris) => jumlah + baris.amount, 0)).toBe(tagihan.total);
  });
});

describe("cancelling a paid Saat Duka TPU order after a Harga Khusus reduced its Tagihan", () => {
  it("asks back each Layanan at its own share of what was paid, never its tariff, once the Biaya Pengurusan is kept from Dimakamkan", async () => {
    const s = await siap();
    const { nomor, tagihan } = await pesananHariH(s, 1, { dibayar: false });
    const khusus = await s.setup.billing.tetapkanHargaKhusus(s.admin, {
      tagihanId: tagihan.id,
      amount: 250_000,
      alasan: "Keringanan untuk keluarga",
      porsiMitra: 0,
      catatanPorsiMitra: "Ditanggung Operator",
    });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
    const dibayar = await s.setup.billing.recordPayment(khusus.tagihan.id, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
    s.setup.clock.set(wib("2026-10-02 12:00"));
    const dimakamkan = await s.setup.pengurusan.catatDimakamkan(s.admin, { nomor });
    if (!dimakamkan.ok) throw new Error(`Dimakamkan refused: ${dimakamkan.reason}`);

    const batal = await batalkan(s, nomor);

    // The Tagihan is Rp 1.750.001 after the reduction, so the Layanan line of Rp 250.001 was paid at 250.001 x 1.750.001 / 2.000.001.
    expect(batal).toEqual({ ok: true, status: "dibatalkan", tagihanDibatalkan: false, pengembalian: 218_750 });
    expect(await statusPekerjaan(s, nomor)).toEqual(["dibatalkan"]);
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ jumlah: 218_750, tagihanId: khusus.tagihan.id, penuh: false });
  });
});

describe("cancelling a Saat Duka TPU order whose Tagihan is not paid", () => {
  it("cancels the Tagihan and every Pekerjaan Layanan not yet done, and raises no refund request", async () => {
    const s = await siap();
    const { nomor, tagihan } = await pesananHariH(s, 2, { dibayar: false });
    expect(await statusPekerjaan(s, nomor)).toEqual(["dijadwalkan", "dijadwalkan"]);

    const batal = await batalkan(s, nomor);

    expect(batal).toEqual({ ok: true, status: "dibatalkan", tagihanDibatalkan: true, pengembalian: 0 });
    expect((await s.setup.billing.tagihan(tagihan.id))!.status).toBe("dibatalkan");
    expect(await statusPekerjaan(s, nomor)).toEqual(["dibatalkan", "dibatalkan"]);
    expect(await s.setup.refunds.permintaanTerbuka()).toEqual([]);
  });
});

describe("cancelling a Saat Duka TPU order twice", () => {
  it("changes nothing the second time: no second refund request, no job touched again", async () => {
    const s = await siap();
    const { nomor, tagihan } = await pesananHariH(s, 2, { dibayar: true });
    expect(await batalkan(s, nomor)).toMatchObject({ ok: true, pengembalian: tagihan.total });
    const sebelum = await s.setup.layanan.pesananTpuOf(nomor, s.pemesan);

    s.setup.clock.set(wib("2026-10-01 15:00"));
    expect(await batalkan(s, nomor)).toEqual({ ok: false, reason: "status_tidak_sesuai" });
    // The Layanan side is idempotent in itself: asked again, it cancels nothing and returns no line to refund.
    expect(await s.setup.layanan.batalkanHariHTpu(nomor, db)).toMatchObject({ ok: true, dibatalkan: 0, baris: [] });

    expect(await s.setup.layanan.pesananTpuOf(nomor, s.pemesan)).toEqual(sebelum);
    const permintaan = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan).toHaveLength(1);
    expect(permintaan[0]).toMatchObject({ jumlah: tagihan.total });
  });
});

describe("the Layanan's cancellation of a Saat Duka TPU order's hari-H Layanan", () => {
  it("answers none for a Nomor Pemesanan that has no hari-H Layanan", async () => {
    const s = await siap();
    expect(await s.setup.layanan.batalkanHariHTpu("MKM-2026-999999", db)).toEqual({ ok: true, dibatalkan: 0, baris: [], tidakDikembalikan: 0 });
  });

  it("leaves a standalone TPU order's Pekerjaan Layanan alone: only a Saat Duka TPU order's hari-H Layanan end with it", async () => {
    const s = await siap();
    const dipesan = await s.setup.layanan.placePesananLayananTpu(s.pemesan, orderTpu(s, [{ layananVariantId: s.bunga.id, targetDate: "2026-10-20" }]));
    if (!dipesan.ok) throw new Error(`order refused: ${dipesan.reason}`);
    const { nomor } = dipesan.pesanan;

    expect(await s.setup.layanan.batalkanHariHTpu(nomor, db)).toEqual({ ok: true, dibatalkan: 0, baris: [], tidakDikembalikan: 0 });
    expect(await statusPekerjaan(s, nomor)).toEqual(["menunggu_pembayaran"]);
  });
});

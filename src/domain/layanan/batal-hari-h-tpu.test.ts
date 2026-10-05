import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { composeLayanan } from "@/composition/layanan";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  diterima,
  foto,
  HARGA_BUNGA_TABUR,
  mitraJasaUntuk,
  orderTpu,
  pencairanSaya,
  saatDukaTpuDikonfirmasi,
  setujui,
  siapTpuBertarif,
  TARIF,
  type MitraJasaTpu,
  type SiapTpuBertarif,
} from "../../../tests/support/layanan-tpu";
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

const LABEL_BUNGA = "Layanan – Bunga Tabur (Reguler)";

const siap = () => siapTpuBertarif(db);
type Siap = SiapTpuBertarif;
type Mitra = MitraJasaTpu;

/**
 * A confirmed Saat Duka TPU order with `jumlah` hari-H Bunga Tabur, paid (Lunas) or not. With `hargaKhusus` Admin Platform lowers the
 * unpaid Tagihan by that much first, and the Tagihan returned (and paid) is the reduced one.
 */
async function pesananHariH(s: Siap, jumlah: number, options: { dibayar: boolean; hargaKhusus?: number }) {
  const hariH = Array.from({ length: jumlah }, (_, urutan) => ({ layananVariantId: s.bunga.id, teks: `Untuk almarhum ${urutan + 1}` }));
  const { nomor, hasil } = await saatDukaTpuDikonfirmasi(s.setup, s, hariH);
  let tagihan = hasil.tagihan;
  if (options.hargaKhusus !== undefined) {
    const khusus = await s.setup.billing.tetapkanHargaKhusus(s.admin, {
      tagihanId: tagihan.id,
      amount: options.hargaKhusus,
      alasan: "Keringanan untuk keluarga",
      porsiMitra: 0,
      catatanPorsiMitra: "Ditanggung Operator",
    });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
    tagihan = khusus.tagihan;
  }
  if (options.dibayar) {
    const dibayar = await s.setup.billing.recordPayment(tagihan.id, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
  }
  const order = await s.setup.layanan.pesananTpuOf(nomor, s.pemesan);
  return { nomor, tagihan, pekerjaan: order!.item.map((satu) => satu.id) };
}

/** The family's Layanan page: each hari-H job's status, in the order it was added. */
async function statusPekerjaan(s: Siap, nomor: string) {
  const order = await s.setup.layanan.pesananTpuOf(nomor, s.pemesan);
  return order!.item.map((satu) => satu.status);
}

const batalkan = (s: Siap, nomor: string) => s.setup.pengurusan.batalkanPengurusan(s.pemesan, { nomor });

/** The first shot: the job becomes Sedang Dikerjakan. */
async function mulai(s: Siap, mitra: Mitra, pekerjaanId: string) {
  const diambil = await s.setup.layanan.simpanBuktiTpu(mitra.actor, { pekerjaanId, kind: "foto_sesudah", takenAt: s.setup.clock.now(), file: { body: foto(), contentType: "image/jpeg" } });
  if (!diambil.ok) throw new Error(`shot refused: ${diambil.reason}`);
}

async function kirim(s: Siap, mitra: Mitra, pekerjaanId: string) {
  const dikirim = await s.setup.layanan.kirimBuktiTpu(mitra.actor, { pekerjaanId });
  if (!dikirim.ok) throw new Error(`send refused: ${dikirim.reason}`);
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

  it("stops offering the job: Admin Platform's list and the Antrean no longer carry it, and it cannot be assigned", async () => {
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

  it("cancels a Terlambat one nobody started, and refunds it with the rest", async () => {
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

  it("leaves a Terlambat Pekerjaan Layanan the Mitra Jasa already started: its line is not refunded and they keep it and are paid, while the one nobody started is cancelled", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { nomor, tagihan, pekerjaan } = await pesananHariH(s, 2, { dibayar: true });
    const [dimulai] = pekerjaan as [string, string];
    await diterima(s, mitra, dimulai);
    await mulai(s, mitra, dimulai);
    // Two days past the burial the tick flags both: the one Sedang Dikerjakan and the one nobody touched.
    s.setup.clock.set(wib("2026-10-05 09:00"));
    expect(await tandaiTerlambatTpu(db, s.setup.clock.now())).toBe(2);
    expect(await statusPekerjaan(s, nomor)).toEqual(["terlambat", "terlambat"]);

    const batal = await batalkan(s, nomor);

    expect(batal).toMatchObject({ ok: true, pengembalian: tagihan.total - HARGA_BUNGA_TABUR });
    expect(await statusPekerjaan(s, nomor)).toEqual(["terlambat", "dibatalkan"]);
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ jumlah: tagihan.total - HARGA_BUNGA_TABUR, penuh: false });
    expect(permintaan!.lines.filter((baris) => baris.label === LABEL_BUNGA)).toHaveLength(1);
    // It is still the Mitra Jasa's: they finish it the usual way and are paid, as for a job Sedang Dikerjakan.
    expect((await s.setup.layanan.pekerjaanTpuSaya(mitra.actor)).aktif).toHaveLength(1);
    await kirim(s, mitra, dimulai);
    await setujui(s, dimulai);
    expect(await statusPekerjaan(s, nomor)).toEqual(["selesai", "dibatalkan"]);
    expect(await pencairanSaya(s, mitra)).toMatchObject([{ tarif: TARIF }]);
  });

  it("leaves a Pekerjaan Layanan whose Mitra Jasa took the first shot only after the tick flagged it Terlambat: it has begun, so it keeps its price", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { nomor, tagihan, pekerjaan } = await pesananHariH(s, 1, { dibayar: true });
    const [pekerjaanId] = pekerjaan as [string];
    await diterima(s, mitra, pekerjaanId);
    s.setup.clock.set(wib("2026-10-05 09:00"));
    expect(await tandaiTerlambatTpu(db, s.setup.clock.now())).toBe(1);
    await mulai(s, mitra, pekerjaanId);
    expect(await statusPekerjaan(s, nomor)).toEqual(["terlambat"]);

    const batal = await batalkan(s, nomor);

    // The one Layanan has begun, so its line is the only one that does not come back.
    expect(batal).toMatchObject({ ok: true, pengembalian: tagihan.total - HARGA_BUNGA_TABUR });
    expect(await statusPekerjaan(s, nomor)).toEqual(["terlambat"]);
    await kirim(s, mitra, pekerjaanId);
    await setujui(s, pekerjaanId);
    expect(await pencairanSaya(s, mitra)).toMatchObject([{ tarif: TARIF }]);
  });

  it("leaves a Pekerjaan Layanan Menunggu Verifikasi: the work is done and only the approval waits, so it keeps its price and the Mitra Jasa is paid once it is approved", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { nomor, tagihan, pekerjaan } = await pesananHariH(s, 2, { dibayar: true });
    const [menunggu] = pekerjaan as [string, string];
    await diterima(s, mitra, menunggu);
    await mulai(s, mitra, menunggu);
    await kirim(s, mitra, menunggu);
    expect(await statusPekerjaan(s, nomor)).toEqual(["menunggu_verifikasi", "dijadwalkan"]);

    const batal = await batalkan(s, nomor);

    expect(batal).toMatchObject({ ok: true, pengembalian: tagihan.total - HARGA_BUNGA_TABUR });
    expect(await statusPekerjaan(s, nomor)).toEqual(["menunggu_verifikasi", "dibatalkan"]);
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ jumlah: tagihan.total - HARGA_BUNGA_TABUR, penuh: false });
    await setujui(s, menunggu);
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
    // The earlier refund and this one together are the whole Tagihan, so the request is penuh though one job was not asked now.
    expect(permintaan[0]).toMatchObject({ jumlah: tagihan.total, penuh: true });
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

  it("is not refused before Dimakamkan for the rupiah the floor leaves out: every line comes back at its share, and the request is not penuh", async () => {
    const s = await siap();
    const { nomor, tagihan } = await pesananHariH(s, 1, { dibayar: true, hargaKhusus: 250_000 });

    const batal = await batalkan(s, nomor);

    // The Tagihan is Rp 1.750.001 after the reduction; the Biaya Pengurusan comes back at floor(1.750.000 x 1.750.001 / 2.000.001) and the
    // Layanan at 218.750: together one rupiah less than was paid, which the floor rule never over-refunds (ticket 95).
    expect(tagihan.total).toBe(1_750_001);
    expect(batal).toEqual({ ok: true, status: "dibatalkan", tagihanDibatalkan: false, pengembalian: 1_750_000 });
    expect(await statusPekerjaan(s, nomor)).toEqual(["dibatalkan"]);
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ nomorPemesanan: nomor, jumlah: 1_750_000, penuh: false, status: "diajukan" });
    expect(permintaan!.lines.filter((baris) => baris.label === LABEL_BUNGA).map((baris) => baris.amount)).toEqual([218_750]);
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

describe("the Layanan's cancellation of a Saat Duka TPU order's hari-H Layanan while a Mitra Jasa takes the first shot", () => {
  it("never both refunds a Pekerjaan Layanan and takes it off a Mitra Jasa who began it: either it is cancelled and the shot refused, or it is begun and kept", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { nomor, pekerjaan } = await pesananHariH(s, 1, { dibayar: true });
    const [pekerjaanId] = pekerjaan as [string];
    await diterima(s, mitra, pekerjaanId);
    // The same Layanan, whose Billing is asked for the Tagihan after the cancellation has read the job and before it writes: that is
    // the moment the Mitra Jasa's first shot arrives, on its own connection. A shot that nothing holds up is taken well within 400 ms.
    let bidikan: ReturnType<typeof s.setup.layanan.simpanBuktiTpu> | undefined;
    const layananDiGanggu = composeLayanan({
      db,
      clock: s.setup.clock,
      files: s.setup.files,
      audit: s.setup.audit,
      lokasi: s.setup.lokasi,
      tariffs: s.setup.tariffs,
      inventory: s.setup.inventory,
      identity: s.setup.identity,
      refunds: s.setup.refunds,
      payouts: s.setup.payouts,
      notifikasi: s.setup.notifikasi,
      billing: {
        ...s.setup.billing,
        within: (tx) => {
          const dalamTransaksi = s.setup.billing.within(tx);
          return {
            ...dalamTransaksi,
            tagihanBerlaku: async (tagihanId) => {
              bidikan = s.setup.layanan.simpanBuktiTpu(mitra.actor, { pekerjaanId, kind: "foto_sesudah", takenAt: s.setup.clock.now(), file: { body: foto(), contentType: "image/jpeg" } });
              await Promise.race([bidikan, new Promise((selesai) => setTimeout(selesai, 400))]);
              return dalamTransaksi.tagihanBerlaku(tagihanId);
            },
          };
        },
      },
    });

    // Not inside a transaction of the caller's: the Layanan holds the job from the read to the write by itself.
    const hasil = await layananDiGanggu.batalkanHariHTpu(nomor, db);
    const bidikanHasil = await bidikan;
    if (!hasil.ok || !bidikanHasil) throw new Error("the cancellation was refused or the shot never came");

    const [status] = await statusPekerjaan(s, nomor);
    const dibatalkan = status === "dibatalkan";
    expect(["dibatalkan", "sedang_dikerjakan"]).toContain(status);
    // Cancelled: its line comes back, the shot is refused and it is no longer the Mitra Jasa's. Begun: no line, the shot stands and they keep it.
    expect(hasil.baris).toHaveLength(dibatalkan ? 1 : 0);
    expect(bidikanHasil.ok).toBe(!dibatalkan);
    expect((await s.setup.layanan.pekerjaanTpuSaya(mitra.actor)).aktif).toHaveLength(dibatalkan ? 0 : 1);
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

/**
 * Ticket 121, owner rule C1: cancelling a Saat Duka TPU order while one of its hari-H Layanan is in Kerjakan ulang (a Keluhan upheld, the
 * new Pekerjaan Layanan handed to a Mitra Jasa) cancels that Pekerjaan Layanan and the original's Pencairan item too, and the family is
 * refunded the Layanan, once. Before it the item stayed Belum Jatuh Tempo for good: the window-close tick reads Selesai jobs only and
 * the approval of the Kerjakan ulang, which would have released or cancelled it, never came.
 */
describe("cancelling a Saat Duka TPU order while a hari-H Pekerjaan Layanan is in Kerjakan ulang after a Keluhan", () => {
  /** One hari-H Bunga Tabur that `asal` did and Admin Platform approved, a Keluhan on it upheld, and its Kerjakan ulang handed to `ulang` (not yet answered). */
  async function sedangDikerjakanUlang(s: Siap, asal: Mitra, ulang: Mitra, options: { dibayar?: boolean; hargaKhusus?: number } = {}) {
    const { nomor, tagihan, pekerjaan } = await pesananHariH(s, 1, {
      dibayar: options.dibayar ?? true,
      ...(options.hargaKhusus === undefined ? {} : { hargaKhusus: options.hargaKhusus }),
    });
    const [pekerjaanId] = pekerjaan as [string];
    await diterima(s, asal, pekerjaanId);
    await mulai(s, asal, pekerjaanId);
    await kirim(s, asal, pekerjaanId);
    await setujui(s, pekerjaanId);
    const keluhan = await s.setup.layanan.ajukanKeluhanTpu(s.pemesan, { pekerjaanId, alasan: "Bunganya sudah layu" });
    if (!keluhan.ok) throw new Error(`Keluhan refused: ${keluhan.reason}`);
    const putus = await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: keluhan.keluhanId, keputusan: "kerjakan_ulang", catatan: "Ulangi", mitraJasaId: ulang.id });
    if (!putus.ok) throw new Error(`decision refused: ${putus.reason}`);
    const [ulangId] = (await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin)).map((satu) => satu.id).filter((id) => id !== pekerjaanId);
    if (!ulangId) throw new Error("no Kerjakan ulang job");
    return { nomor, tagihan, pekerjaanId, ulangId };
  }

  it.each([
    ["by the same Mitra Jasa", false],
    ["by another Mitra Jasa", true],
  ] as const)("cancels the Kerjakan ulang %s and the original Pekerjaan Layanan's Pencairan, refunds the Layanan once, and pays nothing out for it", async (_label, lain) => {
    const s = await siap();
    const asal = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const ulang = lain ? await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "kedua@contoh.id" }) : asal;
    const { nomor, tagihan } = await sedangDikerjakanUlang(s, asal, ulang);
    expect(await pencairanSaya(s, asal)).toMatchObject([{ status: "belum_jatuh_tempo", tarif: TARIF }]);

    const batal = await batalkan(s, nomor);

    expect(batal).toEqual({ ok: true, status: "dibatalkan", tagihanDibatalkan: false, pengembalian: tagihan.total });
    // The Kerjakan ulang is Dibatalkan with its order, and so is the original that waited in Keluhan for it: the family's page does not go
    // on saying it will be done again. Its Pencairan is no longer owed to its Mitra Jasa.
    expect(await statusPekerjaan(s, nomor)).toEqual(["dibatalkan", "dibatalkan"]);
    expect(await pencairanSaya(s, asal)).toMatchObject([{ status: "dibatalkan", tarif: TARIF }]);
    // The family gets the Layanan back, once, with the rest of the Tagihan: the whole of it.
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ nomorPemesanan: nomor, jumlah: tagihan.total, penuh: true, status: "diajukan" });
    expect(permintaan!.lines.filter((baris) => baris.label === LABEL_BUNGA).map((baris) => baris.amount)).toEqual([HARGA_BUNGA_TABUR]);
    expect(permintaan!.lines.reduce((jumlah, baris) => jumlah + baris.amount, 0)).toBe(tagihan.total);
    // Nothing is paid out for it, however long the Keluhan window runs: the run holds nothing for a Mitra Jasa.
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-11-30 10:00"));
    expect(await s.setup.payouts.jalankanPencairan(s.admin)).toEqual([]);
    expect(await pencairanSaya(s, asal)).toMatchObject([{ status: "dibatalkan" }]);
    // Asked again, the Layanan has no line left to return and no job to cancel.
    expect(await s.setup.layanan.batalkanHariHTpu(nomor, db)).toMatchObject({ ok: true, dibatalkan: 0, baris: [] });
    // The transfer of that refund returns the whole Tagihan, and the original's Pencairan stays cancelled.
    expect((await s.setup.refunds.setujuiPengembalian(s.admin, { permintaanId: permintaan!.id })).ok).toBe(true);
    await s.setup.refunds.isiRekeningAdmin(s.admin, { permintaanId: permintaan!.id, rekening: { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Budi Santoso" }, alasan: "Diminta lewat telepon" });
    const terbit = await s.setup.refunds.terbitkanBuktiPengembalianDana(s.admin, { permintaanId: permintaan!.id, ditransferPada: "2026-10-01", bukti: { body: foto(), contentType: "image/jpeg" } });
    if (!terbit.ok) throw new Error(`transfer refused: ${terbit.reason}`);
    expect(await s.setup.billing.tagihan(tagihan.id)).toMatchObject({ status: "dikembalikan_penuh" });
    expect(await pencairanSaya(s, asal)).toMatchObject([{ status: "dibatalkan" }]);
  });

  it("cancels the original job's Pencairan with the order of a family that never paid, and raises no refund", async () => {
    const s = await siap();
    const asal = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { nomor } = await sedangDikerjakanUlang(s, asal, asal, { dibayar: false });

    const batal = await batalkan(s, nomor);

    expect(batal).toEqual({ ok: true, status: "dibatalkan", tagihanDibatalkan: true, pengembalian: 0 });
    expect(await s.setup.refunds.permintaanTerbuka()).toEqual([]);
    expect(await pencairanSaya(s, asal)).toMatchObject([{ status: "dibatalkan", tarif: TARIF }]);
  });

  it("leaves a Kerjakan ulang already begun running, with the original's Pencairan held for its approval and the Layanan not refunded", async () => {
    const s = await siap();
    const asal = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { nomor, tagihan, ulangId } = await sedangDikerjakanUlang(s, asal, asal);
    expect((await s.setup.layanan.jawabPenugasan(asal.actor, { pekerjaanId: ulangId, jawaban: "terima" })).ok).toBe(true);
    await mulai(s, asal, ulangId);

    const batal = await batalkan(s, nomor);

    expect(batal).toMatchObject({ ok: true, pengembalian: tagihan.total - HARGA_BUNGA_TABUR });
    expect(await statusPekerjaan(s, nomor)).toEqual(["keluhan", "sedang_dikerjakan"]);
    expect(await pencairanSaya(s, asal)).toMatchObject([{ status: "belum_jatuh_tempo" }]);
    // The Kerjakan ulang is finished the usual way: its approval releases the original's Pencairan, as the pay rules say.
    await kirim(s, asal, ulangId);
    await setujui(s, ulangId);
    expect(await pencairanSaya(s, asal)).toMatchObject([{ status: "jatuh_tempo", tarif: TARIF }]);
  });

  it("never asks Refunds for the Layanan a second time when a Keluhan refund already returned it and Admin Platform then ordered a Kerjakan ulang of the Pekerjaan Layanan", async () => {
    const s = await siap();
    const asal = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { nomor, tagihan, pekerjaan } = await pesananHariH(s, 1, { dibayar: true });
    const [pekerjaanId] = pekerjaan as [string];
    await diterima(s, asal, pekerjaanId);
    await mulai(s, asal, pekerjaanId);
    await kirim(s, asal, pekerjaanId);
    await setujui(s, pekerjaanId);
    const keluhan = await s.setup.layanan.ajukanKeluhanTpu(s.pemesan, { pekerjaanId, alasan: "Bunganya sudah layu" });
    if (!keluhan.ok) throw new Error(`Keluhan refused: ${keluhan.reason}`);
    expect(await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: keluhan.keluhanId, keputusan: "kembalikan_dana", catatan: "Dikembalikan" })).toEqual({ ok: true });
    expect(await s.setup.layanan.kerjaUlangTpu(s.admin, { pekerjaanId, mitraJasaId: asal.id })).toMatchObject({ ok: true });

    const batal = await batalkan(s, nomor);

    // The refund of the Layanan is already in the open request: the order's cancellation adds the other lines to it, and the Tagihan is returned once.
    expect(batal).toMatchObject({ ok: true, pengembalian: tagihan.total - HARGA_BUNGA_TABUR });
    const permintaan = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan).toHaveLength(1);
    expect(permintaan[0]).toMatchObject({ jumlah: tagihan.total, penuh: true });
    expect(permintaan[0]!.lines.filter((baris) => baris.label === LABEL_BUNGA).map((baris) => baris.amount)).toEqual([HARGA_BUNGA_TABUR]);
    expect(await pencairanSaya(s, asal)).toMatchObject([{ status: "dibatalkan" }]);
    expect(await statusPekerjaan(s, nomor)).toEqual(["dibatalkan", "dibatalkan"]);
  });

  /**
   * `a` did the Pekerjaan Layanan and does it again (Kerjakan ulang), and Admin Platform approves that: the original's Pencairan is
   * released (now due) and the proof of the Kerjakan ulang is shown. The family complains of it too, and Admin Platform has it done a
   * second time by `b`, not yet answered. With `dicairkan` the Operator has transferred what became due before the family cancels.
   */
  async function kerjakanUlangKedua(s: Siap, a: Mitra, b: Mitra, options: { dicairkan: boolean }) {
    const { nomor, tagihan, ulangId } = await sedangDikerjakanUlang(s, a, a);
    expect((await s.setup.layanan.jawabPenugasan(a.actor, { pekerjaanId: ulangId, jawaban: "terima" })).ok).toBe(true);
    await mulai(s, a, ulangId);
    await kirim(s, a, ulangId);
    await setujui(s, ulangId);
    expect(await pencairanSaya(s, a)).toMatchObject([{ status: "jatuh_tempo" }]);
    if (options.dicairkan) {
      for (const baris of await s.setup.payouts.jalankanPencairan(s.admin)) {
        const dicairkan = await s.setup.payouts.terbitkanBuktiPencairan(s.admin, {
          itemIds: baris.items.map((satu) => satu.id),
          ditransferPada: "2026-10-01",
          bukti: { body: foto(), contentType: "image/jpeg" },
        });
        if (!dicairkan.ok) throw new Error(`transfer refused: ${dicairkan.reason}`);
      }
      expect(await pencairanSaya(s, a)).toMatchObject([{ status: "dicairkan", tarif: TARIF }]);
    }
    const keluhan = await s.setup.layanan.ajukanKeluhanTpu(s.pemesan, { pekerjaanId: ulangId, alasan: "Masih layu" });
    if (!keluhan.ok) throw new Error(`Keluhan refused: ${keluhan.reason}`);
    expect(await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: keluhan.keluhanId, keputusan: "kerjakan_ulang", catatan: "Sekali lagi", mitraJasaId: b.id })).toEqual({ ok: true });
    expect(await statusPekerjaan(s, nomor)).toEqual(["selesai", "keluhan", "dijadwalkan"]);
    return { nomor, tagihan };
  }

  it("cancels every Pencairan the line holds when the Kerjakan ulang is itself a Kerjakan ulang: a second Keluhan after the first one was approved", async () => {
    const s = await siap();
    const a = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const b = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "kedua@contoh.id" });
    const { nomor, tagihan } = await kerjakanUlangKedua(s, a, b, { dicairkan: false });

    const batal = await batalkan(s, nomor);

    expect(batal).toEqual({ ok: true, status: "dibatalkan", tagihanDibatalkan: false, pengembalian: tagihan.total });
    // The first Kerjakan ulang, approved, stays Selesai; the one that waited in Keluhan for the second is Dibatalkan with it.
    expect(await statusPekerjaan(s, nomor)).toEqual(["selesai", "dibatalkan", "dibatalkan"]);
    // The line is returned to the family once, so what the first job would have been paid is not paid either.
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan!.lines.filter((baris) => baris.label === LABEL_BUNGA).map((baris) => baris.amount)).toEqual([HARGA_BUNGA_TABUR]);
    expect(await pencairanSaya(s, a)).toMatchObject([{ status: "dibatalkan" }]);
    expect(await s.setup.payouts.jalankanPencairan(s.admin)).toEqual([]);
  });

  it("leaves a Pencairan the Operator already transferred to the Mitra Jasa as paid, and still refunds the Layanan once, when the second Kerjakan ulang is cancelled with its order", async () => {
    const s = await siap();
    const a = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const b = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "kedua@contoh.id" });
    const { nomor, tagihan } = await kerjakanUlangKedua(s, a, b, { dicairkan: true });

    const batal = await batalkan(s, nomor);

    expect(batal).toEqual({ ok: true, status: "dibatalkan", tagihanDibatalkan: false, pengembalian: tagihan.total });
    expect(await statusPekerjaan(s, nomor)).toEqual(["selesai", "dibatalkan", "dibatalkan"]);
    // What was paid out stays paid: only an item not yet transferred can be cancelled.
    expect(await pencairanSaya(s, a)).toMatchObject([{ status: "dicairkan", tarif: TARIF }]);
    // The family still gets the Layanan back, once, with the rest of the Tagihan.
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ jumlah: tagihan.total, penuh: true });
    expect(permintaan!.lines.filter((baris) => baris.label === LABEL_BUNGA).map((baris) => baris.amount)).toEqual([HARGA_BUNGA_TABUR]);
    // Nothing is taken back from the Mitra Jasa when that refund is transferred, and nothing more is paid to them.
    expect((await s.setup.refunds.setujuiPengembalian(s.admin, { permintaanId: permintaan!.id })).ok).toBe(true);
    await s.setup.refunds.isiRekeningAdmin(s.admin, { permintaanId: permintaan!.id, rekening: { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Budi Santoso" }, alasan: "Diminta lewat telepon" });
    const terbit = await s.setup.refunds.terbitkanBuktiPengembalianDana(s.admin, { permintaanId: permintaan!.id, ditransferPada: "2026-10-01", bukti: { body: foto(), contentType: "image/jpeg" } });
    if (!terbit.ok) throw new Error(`transfer refused: ${terbit.reason}`);
    expect(await pencairanSaya(s, a)).toMatchObject([{ status: "dicairkan", tarif: TARIF }]);
    expect(await s.setup.payouts.jalankanPencairan(s.admin)).toEqual([]);
  });

  it("is not refused for the rupiah the floor leaves out when the Tagihan carries a Harga Khusus: before the Kerjakan ulang was cancelled with its order the family could cancel", async () => {
    const s = await siap();
    const asal = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { nomor, tagihan } = await sedangDikerjakanUlang(s, asal, asal, { hargaKhusus: 250_000 });

    const batal = await batalkan(s, nomor);

    // The Layanan comes back at its share, once, with the order's own lines at theirs: one rupiah less than the Rp 1.750.001 paid.
    expect(tagihan.total).toBe(1_750_001);
    expect(batal).toEqual({ ok: true, status: "dibatalkan", tagihanDibatalkan: false, pengembalian: 1_750_000 });
    expect(await statusPekerjaan(s, nomor)).toEqual(["dibatalkan", "dibatalkan"]);
    expect(await pencairanSaya(s, asal)).toMatchObject([{ status: "dibatalkan" }]);
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ nomorPemesanan: nomor, jumlah: 1_750_000, penuh: false });
    expect(permintaan!.lines.filter((baris) => baris.label === LABEL_BUNGA).map((baris) => baris.amount)).toEqual([218_750]);
  });
});

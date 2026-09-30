import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { scheduledTicks } from "@/domain/scheduler";
import type { Actor } from "@/domain/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  layananOnTestDatabase,
  lokasiDenganLayanan,
  petakDenganHakPakai,
  pemesanLayanan,
  siapkanOperatorLayanan,
  type LayananSetup,
} from "../../../tests/support/layanan";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { schedulerContext } from "../../../tests/support/scheduler";

/**
 * A Keluhan and a Penilaian on a finished job at a Lokasi Mitra (spec, Layanan > Pekerjaan
 * Layanan; stories 94, 95, 131, 158; Payouts: "Layanan | Lunas and the Keluhan window closes with
 * no Keluhan, a Keluhan is rejected, or the redo proof is shown").
 *
 * Everything is read through public interfaces: the order as the Pemesan reads it, the job as
 * the Admin Lokasi reads it, the Antrean and Antrean Lokasi rows, Payouts' run and Refunds' requests.
 * The clock is moved, never waited for.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const foto = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);
const SELESAI_PADA = wib("2026-10-20 10:00");

/** One captured photo, stamped at `takenAt`. */
function bukti(pekerjaanId: string, kind: "foto_sebelum" | "foto_sesudah", takenAt = SELESAI_PADA) {
  return { pekerjaanId, kind, takenAt, file: { body: foto(), contentType: "image/jpeg" } };
}

/**
 * A paid order whose one job the Admin Lokasi has finished at 10:00 on the 20th: the Pemesan is shown the proof.
 * `payoutsSudahJalan: false` leaves Payouts' own tick unrun, so the job's Pencairan item is not written yet.
 */
async function pekerjaanSelesai({ payoutsSudahJalan = true, hargaKhusus = false }: { payoutsSudahJalan?: boolean; hargaKhusus?: boolean } = {}) {
  const setup = layananOnTestDatabase(db);
  await siapkanOperatorLayanan(setup);
  const lokasi = await lokasiDenganLayanan(setup);
  const petak = await petakDenganHakPakai(setup, lokasi);
  const { pemesan } = await pemesanLayanan(setup);
  const order = await setup.layanan.placePesananLayanan(pemesan, {
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    lokasiId: lokasi.lokasiMitra.id,
    petakId: petak.petakId,
    item: [{ layananVariantId: lokasi.varian.id, targetDate: "2026-10-20", teks: null }],
  });
  if (!order.ok) throw new Error(`order refused: ${order.reason}`);
  setup.clock.set(wib("2026-10-01 10:00"));
  // A Harga Khusus before the family pays (ticket 93): the Tagihan is reissued and the reissue is what is paid; the order keeps the first id.
  let tagihanDibayar = order.tagihan.id;
  if (hargaKhusus) {
    const khusus = await setup.billing.tetapkanHargaKhusus(lokasi.admin, {
      tagihanId: order.tagihan.id,
      amount: 50_000,
      alasan: "Keringanan untuk keluarga",
      porsiMitra: 0,
      catatanPorsiMitra: "Ditanggung Operator",
    });
    if (!khusus.ok) throw new Error(`Harga Khusus refused: ${khusus.reason}`);
    tagihanDibayar = khusus.tagihan.id;
  }
  const dibayar = await setup.billing.recordPayment(tagihanDibayar, { method: { kind: "transfer_manual" }, reference: null, paidAt: wib("2026-10-01 10:00") });
  if (!dibayar.ok) throw new Error("payment refused");
  // Payouts writes the job's item when the Tagihan is Lunas: not due, waiting for the job's own trigger.
  if (payoutsSudahJalan) await setup.payouts.tick();

  const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
  const pekerjaanId = dibaca?.item[0].pekerjaan?.id;
  if (!pekerjaanId) throw new Error("no job");
  setup.clock.set(SELESAI_PADA);
  for (const kind of ["foto_sebelum", "foto_sesudah"] as const) {
    const diunggah = await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(pekerjaanId, kind));
    if (!diunggah.ok) throw new Error(`proof refused: ${diunggah.reason}`);
  }
  const selesai = await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId });
  if (!selesai.ok) throw new Error(`Selesai refused: ${selesai.reason}`);
  return { setup, lokasi, pemesan, order, pekerjaanId, tagihanDibayar };
}

type Siap = Awaited<ReturnType<typeof pekerjaanSelesai>>;

/** The order's one job as the Pemesan reads it. */
async function bacaPekerjaan({ setup, pemesan, order }: Pick<Siap, "setup" | "pemesan" | "order">) {
  const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
  const kerja = dibaca?.item[0].pekerjaan;
  if (!kerja) throw new Error("no job");
  return kerja;
}

/** What the Pencairan run would pay the Lokasi Mitra now: the due items, by amount. */
async function jumlahJatuhTempo(setup: LayananSetup, admin: Actor): Promise<number[]> {
  const run = await setup.payouts.jalankanPencairan(admin);
  return run.flatMap((baris) => baris.items.map((item) => item.amount));
}

/** Files a Keluhan at `waktu` and returns its id. */
async function ajukan(siap: Siap, waktu = wib("2026-10-21 09:00"), alasan = "Nisannya masih kotor.") {
  siap.setup.clock.set(waktu);
  const hasil = await siap.setup.layanan.ajukanKeluhan(siap.pemesan, { pekerjaanId: siap.pekerjaanId, alasan });
  if (!hasil.ok) throw new Error(`Keluhan refused: ${hasil.reason}`);
  return hasil.keluhan.id;
}

/** Admin Platform's decision. */
async function putuskan(siap: Siap, keluhanId: string, keputusan: "tolak" | "kerjakan_ulang" | "kembalikan_dana", catatan = "Sudah kami periksa.") {
  return siap.setup.layanan.putuskanKeluhan(siap.lokasi.admin, { keluhanId, keputusan, catatan });
}

describe("the Keluhan window", () => {
  it("opens when the Admin Lokasi's upload shows the proof to the Pemesan, and lasts 3×24 h", async () => {
    const siap = await pekerjaanSelesai();
    const kerja = await bacaPekerjaan(siap);
    expect(kerja.ditunjukkanAt).toEqual(SELESAI_PADA);
    expect(kerja.jendelaKeluhanBerakhirAt).toEqual(wib("2026-10-23 10:00"));
    expect(kerja.bolehKeluhan).toBe(true);

    // At the very end of the window the Keluhan is still taken; a minute later it is refused.
    siap.setup.clock.set(wib("2026-10-23 10:00"));
    expect((await bacaPekerjaan(siap)).bolehKeluhan).toBe(true);
    siap.setup.clock.set(wib("2026-10-23 10:01"));
    expect((await bacaPekerjaan(siap)).bolehKeluhan).toBe(false);
    expect(await siap.setup.layanan.ajukanKeluhan(siap.pemesan, { pekerjaanId: siap.pekerjaanId, alasan: "Terlambat mengeluh." })).toEqual({
      ok: false,
      reason: "jendela_tertutup",
    });
    expect((await bacaPekerjaan(siap)).status).toBe("selesai");
  });

  it("is not there for a job that is not Selesai, for another Pemesan's job, or for a second Keluhan", async () => {
    const siap = await pekerjaanSelesai();
    // Somebody else's job is "not found", not "not yours".
    const { pemesan: orangLain } = await pemesanLayanan(siap.setup, "orang.lain@contoh.id");
    expect(await siap.setup.layanan.ajukanKeluhan(orangLain, { pekerjaanId: siap.pekerjaanId, alasan: "Bukan pesanan saya." })).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect(await siap.setup.layanan.ajukanKeluhan(siap.pemesan, { pekerjaanId: siap.pekerjaanId, alasan: "  " })).toEqual({ ok: false, reason: "input_tidak_valid" });

    await ajukan(siap);
    expect(await siap.setup.layanan.ajukanKeluhan(siap.pemesan, { pekerjaanId: siap.pekerjaanId, alasan: "Sekali lagi." })).toEqual({ ok: false, reason: "sudah_ada" });
    expect(await bacaPekerjaan(siap)).toMatchObject({ status: "keluhan", bolehKeluhan: false, keluhan: { status: "terbuka", alasan: "Nisannya masih kotor." } });
  });

  it("is refused for a job whose proof has not been shown yet", async () => {
    const setup = layananOnTestDatabase(db);
    await siapkanOperatorLayanan(setup);
    const lokasi = await lokasiDenganLayanan(setup);
    const petak = await petakDenganHakPakai(setup, lokasi);
    const { pemesan } = await pemesanLayanan(setup);
    const order = await setup.layanan.placePesananLayanan(pemesan, {
      pemesanName: "Budi Santoso",
      phoneNumber: "081234567890",
      lokasiId: lokasi.lokasiMitra.id,
      petakId: petak.petakId,
      item: [{ layananVariantId: lokasi.varian.id, targetDate: "2026-10-20", teks: null }],
    });
    if (!order.ok) throw new Error("order refused");
    setup.clock.set(wib("2026-10-01 10:00"));
    await setup.billing.recordPayment(order.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: wib("2026-10-01 10:00") });
    const kerja = (await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan))?.item[0].pekerjaan;
    if (!kerja) throw new Error("no job");
    expect(kerja).toMatchObject({ ditunjukkanAt: null, jendelaKeluhanBerakhirAt: null, bolehKeluhan: false });
    expect(await setup.layanan.ajukanKeluhan(pemesan, { pekerjaanId: kerja.id, alasan: "Belum ada apa-apa." })).toEqual({ ok: false, reason: "belum_selesai" });
  });
});

describe("the Tier 1 Keluhan row", () => {
  it("is due 4 daytime hours after filing, counted only within 06:00–18:00 WIB, and closes when decided", async () => {
    const siap = await pekerjaanSelesai();
    // Filed at 17:00: one daytime hour that evening and three the next morning, so 09:00 on the 21st, not 21:00.
    const keluhanId = await ajukan(siap, wib("2026-10-20 17:00"));
    const { queues, ...komposisi } = queuesOnTestDatabase(db);
    komposisi.clock.set(wib("2026-10-20 17:30"));
    const admin = siap.lokasi.admin;

    const baris = (await queues.antrean(admin)).filter((satu) => satu.type === "keluhan_layanan");
    expect(baris).toHaveLength(1);
    expect(baris[0]).toMatchObject({ tier: 1, label: "Keluhan", subjectId: keluhanId, deadline: wib("2026-10-21 09:00"), pastDeadline: false });
    expect(baris[0].href).toBe(`/staf/admin-platform/keluhan/${keluhanId}`);
    expect((await queues.counters(admin)).keluhanOpen).toBe(1);

    // The row is past its deadline once the first response is late, and only then.
    komposisi.clock.set(wib("2026-10-21 09:01"));
    expect((await queues.antrean(admin)).find((satu) => satu.type === "keluhan_layanan")?.pastDeadline).toBe(true);

    expect((await putuskan(siap, keluhanId, "tolak")).ok).toBe(true);
    expect((await queues.antrean(admin)).filter((satu) => satu.type === "keluhan_layanan")).toEqual([]);
    expect((await queues.counters(admin)).keluhanOpen).toBe(0);
  });
});

describe("a Pencairan that waits for the Keluhan window", () => {
  it("is not due while the window is open, and is made due when it closes with no Keluhan", async () => {
    const siap = await pekerjaanSelesai();
    const { setup, lokasi } = siap;
    expect(await jumlahJatuhTempo(setup, lokasi.admin)).toEqual([]);

    // Inside the window nothing is due, and the thread is still open.
    setup.clock.set(wib("2026-10-23 10:00"));
    expect(await setup.layanan.tutupJendelaKeluhan(setup.clock.now())).toEqual({ ditutup: 0, pencairanJatuhTempo: 0 });
    expect(await jumlahJatuhTempo(setup, lokasi.admin)).toEqual([]);
    expect((await bacaPekerjaan(siap)).jendelaDitutupAt).toBeNull();

    setup.clock.set(wib("2026-10-23 10:01"));
    expect(await setup.layanan.tutupJendelaKeluhan(setup.clock.now())).toEqual({ ditutup: 1, pencairanJatuhTempo: 1 });
    expect(await jumlahJatuhTempo(setup, lokasi.admin)).toEqual([750_000]);
    // The closing signal the message thread reads.
    expect((await bacaPekerjaan(siap)).jendelaDitutupAt).toEqual(wib("2026-10-23 10:01"));
    // Idempotent: a second run for the same moment changes nothing.
    expect(await setup.layanan.tutupJendelaKeluhan(setup.clock.now())).toEqual({ ditutup: 0, pencairanJatuhTempo: 0 });
    expect(await jumlahJatuhTempo(setup, lokasi.admin)).toEqual([750_000]);
  });

  it("is the tick the worker runs", async () => {
    const siap = await pekerjaanSelesai();
    const tick = scheduledTicks.find((scheduled) => scheduled.name === "layanan.tutup_jendela_keluhan");
    if (!tick) throw new Error("the worker does not schedule the tick that closes the Keluhan window");
    siap.setup.clock.set(wib("2026-10-24 10:00"));
    await tick.tick(schedulerContext({ db: siap.setup.db, layanan: siap.setup.layanan }), siap.setup.clock.now());
    expect(await jumlahJatuhTempo(siap.setup, siap.lokasi.admin)).toEqual([750_000]);
  });

  it("waits for the item when the window closed before Payouts wrote it, and the next tick makes it due", async () => {
    // The Pencairan item is written by Payouts' own tick once the Tagihan is Lunas. A window that
    // closes before that tick has run finds no item yet, and the Layanan tick asks again.
    const siap = await pekerjaanSelesai({ payoutsSudahJalan: false });
    const { setup, lokasi } = siap;
    setup.clock.set(wib("2026-10-24 10:00"));
    expect(await setup.layanan.tutupJendelaKeluhan(setup.clock.now())).toEqual({ ditutup: 1, pencairanJatuhTempo: 0 });
    expect(await jumlahJatuhTempo(setup, lokasi.admin)).toEqual([]);

    await setup.payouts.tick();
    expect(await setup.layanan.tutupJendelaKeluhan(setup.clock.now())).toEqual({ ditutup: 0, pencairanJatuhTempo: 1 });
    expect(await jumlahJatuhTempo(setup, lokasi.admin)).toEqual([750_000]);
  });
});

describe("a rejected Keluhan", () => {
  it("makes the job Selesai again and its Pencairan due at once, without waiting for the window", async () => {
    const siap = await pekerjaanSelesai();
    const keluhanId = await ajukan(siap);
    expect(await jumlahJatuhTempo(siap.setup, siap.lokasi.admin)).toEqual([]);

    const hasil = await putuskan(siap, keluhanId, "tolak", "Fotonya menunjukkan makam bersih.");
    expect(hasil).toMatchObject({ ok: true, keluhan: { status: "ditolak", catatanKeputusan: "Fotonya menunjukkan makam bersih." } });
    expect(await bacaPekerjaan(siap)).toMatchObject({ status: "selesai", keluhan: { status: "ditolak" } });
    expect(await jumlahJatuhTempo(siap.setup, siap.lokasi.admin)).toEqual([750_000]);
    // A rejected Keluhan is not filed again.
    expect(await siap.setup.layanan.ajukanKeluhan(siap.pemesan, { pekerjaanId: siap.pekerjaanId, alasan: "Sekali lagi." })).toEqual({ ok: false, reason: "sudah_ada" });
  });

  it("is decided once, by Admin Platform alone, with a note", async () => {
    const siap = await pekerjaanSelesai();
    const keluhanId = await ajukan(siap);
    // The Admin Lokasi of the very Lokasi complained about does not judge the complaint.
    expect(await siap.setup.layanan.putuskanKeluhan(siap.lokasi.adminLokasi, { keluhanId, keputusan: "tolak", catatan: "Tidak benar." })).toEqual({
      ok: false,
      reason: "tidak_berwenang",
    });
    expect(await putuskan(siap, keluhanId, "tolak", "   ")).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect((await putuskan(siap, keluhanId, "tolak")).ok).toBe(true);
    expect(await putuskan(siap, keluhanId, "kerjakan_ulang")).toEqual({ ok: false, reason: "sudah_diputuskan" });
    // Every decision leaves an Entri Audit on the Lokasi, with the note.
    const entri = (await siap.setup.audit.allEntriesForLokasi(siap.lokasi.lokasiMitra.id)).filter((satu) => satu.action === "layanan.putuskan_keluhan");
    expect(entri).toHaveLength(1);
    expect(entri[0]).toMatchObject({ reason: "Sudah kami periksa.", after: { status: "ditolak", keputusan: "tolak" } });
  });
});

describe("a redo after an upheld Keluhan", () => {
  it("reaches the Admin Lokasi as a Kerjakan ulang row, needs new proof of every kind, and closes on it", async () => {
    const siap = await pekerjaanSelesai();
    const { setup, lokasi } = siap;
    const keluhanId = await ajukan(siap);
    expect(await jumlahJatuhTempo(setup, lokasi.admin)).toEqual([]);

    setup.clock.set(wib("2026-10-21 11:00"));
    expect((await putuskan(siap, keluhanId, "kerjakan_ulang", "Bersihkan sekali lagi.")).ok).toBe(true);
    // The job stays in Keluhan; the Admin Lokasi sees the complaint and what Admin Platform decided.
    const dibaca = await setup.layanan.pekerjaanUntukStaf(lokasi.adminLokasi, { pekerjaanId: siap.pekerjaanId });
    if (!dibaca.ok) throw new Error("job refused");
    expect(dibaca.pekerjaan).toMatchObject({
      status: "keluhan",
      keluhan: { status: "kerjakan_ulang", alasan: "Nisannya masih kotor.", catatanKeputusan: "Bersihkan sekali lagi." },
      kurang: ["foto_sebelum", "foto_sesudah"],
    });

    // The row is in the Antrean Lokasi's Mendesak, and links to the job.
    const { queues } = queuesOnTestDatabase(db);
    const antrean = await queues.antreanLokasi(lokasi.adminLokasi, lokasi.lokasiMitra.id);
    const baris = antrean.mendesak.find((satu) => satu.type === "kerjakan_ulang");
    expect(baris).toMatchObject({ label: "Kerjakan ulang", subjectId: siap.pekerjaanId });
    expect(baris?.href).toBe(`/staf/admin-lokasi/${lokasi.lokasiMitra.id}/pekerjaan/${siap.pekerjaanId}`);

    // The proof the family complained about is not a redo: Selesai is refused until every kind is taken again.
    expect(await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: siap.pekerjaanId })).toEqual({
      ok: false,
      reason: "bukti_belum_lengkap",
      kurang: ["foto_sebelum", "foto_sesudah"],
    });
    setup.clock.set(wib("2026-10-22 08:00"));
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(siap.pekerjaanId, "foto_sebelum", wib("2026-10-22 08:00")));
    expect(await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: siap.pekerjaanId })).toMatchObject({ ok: false, kurang: ["foto_sesudah"] });
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(siap.pekerjaanId, "foto_sesudah", wib("2026-10-22 08:05")));
    expect((await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: siap.pekerjaanId })).ok).toBe(true);

    // The proof is shown again (the Pemesan is sent the link once more), the window restarts,
    // the row closes and the job's Pencairan is due — without waiting for any window.
    expect(setup.notifikasi.selesai).toHaveLength(2);
    expect(await bacaPekerjaan(siap)).toMatchObject({
      status: "selesai",
      ditunjukkanAt: wib("2026-10-22 08:00"),
      jendelaKeluhanBerakhirAt: wib("2026-10-25 08:00"),
      keluhan: { status: "selesai_ulang" },
      bolehKeluhan: false,
    });
    const setelah = await queues.antreanLokasi(lokasi.adminLokasi, lokasi.lokasiMitra.id);
    expect([...setelah.mendesak, ...setelah.lainnya].map((satu) => satu.type)).not.toContain("kerjakan_ulang");
    expect(await jumlahJatuhTempo(setup, lokasi.admin)).toEqual([750_000]);
    // The thread closes 3×24 h after the redo proof, not after the first one.
    setup.clock.set(wib("2026-10-25 08:01"));
    expect(await setup.layanan.tutupJendelaKeluhan(setup.clock.now())).toEqual({ ditutup: 1, pencairanJatuhTempo: 0 });
  });

  it("takes no new proof while the Keluhan is still waiting for a decision", async () => {
    const siap = await pekerjaanSelesai();
    await ajukan(siap);
    expect(await siap.setup.layanan.unggahBuktiPekerjaan(siap.lokasi.adminLokasi, bukti(siap.pekerjaanId, "foto_sesudah"))).toEqual({ ok: false, reason: "dalam_keluhan" });
    expect(await siap.setup.layanan.selesaikanPekerjaan(siap.lokasi.adminLokasi, { pekerjaanId: siap.pekerjaanId })).toEqual({ ok: false, reason: "dalam_keluhan" });
  });
});

describe("a refund after an upheld Keluhan", () => {
  it("is asked of Refunds for the job's own line, the platform fee following its fault rule, and takes the item out of the Pencairan", async () => {
    const siap = await pekerjaanSelesai();
    const { setup, lokasi, order } = siap;
    const keluhanId = await ajukan(siap);
    const hasil = await putuskan(siap, keluhanId, "kembalikan_dana", "Pekerjaan tidak dilakukan.");
    expect(hasil).toMatchObject({ ok: true, keluhan: { status: "dana_kembali" } });

    // The request names the Tagihan and the one job's line; the fault is the Lokasi's, so the fee comes back too.
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ tagihanId: order.tagihan.id, pihakBersalah: "lokasi", biayaLayananPlatformDikembalikan: true, jumlah: 900_000, status: "diajukan" });
    expect(permintaan.lines[0]).toEqual({ label: "Layanan – Pembersihan Makam (Reguler)", amount: 750_000, lokasiId: lokasi.lokasiMitra.id });
    // The job stays in Keluhan and nothing is due to the Lokasi.
    expect(await bacaPekerjaan(siap)).toMatchObject({ status: "keluhan", keluhan: { status: "dana_kembali" } });
    expect(await jumlahJatuhTempo(setup, lokasi.admin)).toEqual([]);

    // The refund is Refunds' own flow: approved, transferred, and only then is the item gone from the Lokasi's Pencairan.
    expect((await setup.refunds.setujuiPengembalian(lokasi.admin, { permintaanId: permintaan.id })).ok).toBe(true);
    await setup.refunds.isiRekeningAdmin(lokasi.admin, {
      permintaanId: permintaan.id,
      rekening: { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Budi Santoso" },
      alasan: "Diminta lewat telepon",
    });
    const terbit = await setup.refunds.terbitkanBuktiPengembalianDana(lokasi.admin, {
      permintaanId: permintaan.id,
      ditransferPada: "2026-10-21",
      bukti: { body: foto(), contentType: "image/jpeg" },
    });
    if (!terbit.ok) throw new Error(`transfer refused: ${terbit.reason}`);
    expect(terbit.bukti.amount).toBe(900_000);
    // The refund took the job's item out of what the Lokasi is paid, and no tick makes it due afterwards:
    // a window closing does not pay a job that was refunded.
    expect(await setup.payouts.itemLayanan(order.tagihan.id, 0)).toMatchObject({ status: "dibatalkan" });
    setup.clock.set(wib("2026-10-30 10:00"));
    await setup.layanan.tutupJendelaKeluhan(setup.clock.now());
    expect(await jumlahJatuhTempo(setup, lokasi.admin)).toEqual([]);
  });

  it("is refused, and the Keluhan left open, when Refunds cannot take the line", async () => {
    const siap = await pekerjaanSelesai();
    const { setup, lokasi } = siap;
    const keluhanId = await ajukan(siap);
    // Admin Platform has raised a goodwill refund on the Tagihan first, so no more than the rest of it can come back:
    // Refunds refuses the job's line, and the decision is not taken.
    const goodwill = await setup.refunds.ajukanGoodwill(lokasi.admin, {
      tagihanId: siap.order.tagihan.id,
      nomorTagihan: siap.order.tagihan.nomorTagihan,
      nomorPemesanan: siap.order.pesanan.nomor,
      jumlah: 10_000,
      catatan: "Itikad baik.",
    });
    if (!goodwill.ok) throw new Error(`goodwill refused: ${goodwill.reason}`);
    expect(await putuskan(siap, keluhanId, "kembalikan_dana")).toEqual({ ok: false, reason: "pengembalian_tidak_bisa_diajukan" });
    expect(await bacaPekerjaan(siap)).toMatchObject({ status: "keluhan", keluhan: { status: "terbuka" } });
  });
});

describe("Admin Platform's override of what the job pays", () => {
  it("lowers the Lokasi's item with a mandatory note, and is audited", async () => {
    const siap = await pekerjaanSelesai();
    const { setup, lokasi } = siap;
    const keluhanId = await ajukan(siap);
    expect((await putuskan(siap, keluhanId, "tolak")).ok).toBe(true);
    expect(await jumlahJatuhTempo(setup, lokasi.admin)).toEqual([750_000]);

    // The note is mandatory, and the amount may not exceed what the order issued.
    expect(await setup.layanan.sesuaikanPencairanKeluhan(lokasi.admin, { keluhanId, amount: 375_000, catatan: " " })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await setup.layanan.sesuaikanPencairanKeluhan(lokasi.admin, { keluhanId, amount: 800_000, catatan: "Lebih." })).toEqual({ ok: false, reason: "melebihi_tarif" });
    // Only Admin Platform may.
    expect(await setup.layanan.sesuaikanPencairanKeluhan(lokasi.adminLokasi, { keluhanId, amount: 375_000, catatan: "Setengah." })).toEqual({ ok: false, reason: "tidak_berwenang" });

    expect(await setup.layanan.sesuaikanPencairanKeluhan(lokasi.admin, { keluhanId, amount: 375_000, catatan: "Setengah: bersih sebagian." })).toEqual({
      ok: true,
      jumlah: 375_000,
      jumlahAwal: 750_000,
    });
    const [baris] = await setup.payouts.jalankanPencairan(lokasi.admin);
    expect(baris.items).toMatchObject([{ amount: 375_000, amountAwal: 750_000, alasanPenyesuaian: "setelah_keluhan", catatanPenyesuaian: "Setengah: bersih sebagian." }]);
    const entri = (await setup.audit.allEntries()).filter((satu) => satu.action === "pencairan.override_jumlah");
    expect(entri).toHaveLength(1);
  });

  it("is refused while the Keluhan is undecided, and after a refund, which settles the item itself", async () => {
    const siap = await pekerjaanSelesai();
    const { setup, lokasi } = siap;
    const keluhanId = await ajukan(siap);
    const override = { keluhanId, amount: 375_000, catatan: "Setengah." };
    expect(await setup.layanan.sesuaikanPencairanKeluhan(lokasi.admin, override)).toEqual({ ok: false, reason: "keluhan_belum_diputuskan" });
    expect((await putuskan(siap, keluhanId, "kembalikan_dana")).ok).toBe(true);
    expect(await setup.layanan.sesuaikanPencairanKeluhan(lokasi.admin, override)).toEqual({ ok: false, reason: "keputusan_tidak_mengubah_pencairan" });
  });

  it("is allowed after a redo was decided, before its new proof is shown", async () => {
    const siap = await pekerjaanSelesai();
    const keluhanId = await ajukan(siap);
    expect((await putuskan(siap, keluhanId, "kerjakan_ulang")).ok).toBe(true);
    expect(await siap.setup.layanan.sesuaikanPencairanKeluhan(siap.lokasi.admin, { keluhanId, amount: 375_000, catatan: "Setengah." })).toMatchObject({ ok: true, jumlah: 375_000 });
  });

  it("waits until Payouts has written the item, when the Tagihan has not produced one yet", async () => {
    const siap = await pekerjaanSelesai({ payoutsSudahJalan: false });
    const keluhanId = await ajukan(siap);
    expect((await putuskan(siap, keluhanId, "kerjakan_ulang")).ok).toBe(true);
    expect(await siap.setup.layanan.sesuaikanPencairanKeluhan(siap.lokasi.admin, { keluhanId, amount: 375_000, catatan: "Setengah." })).toEqual({
      ok: false,
      reason: "pencairan_belum_ada",
    });
  });
});

describe("a Penilaian", () => {
  it("is 1–5 stars with a comment, one per finished job", async () => {
    const siap = await pekerjaanSelesai();
    const { setup, pemesan, pekerjaanId } = siap;
    for (const bintang of [0, 6, 2.5]) {
      expect(await setup.layanan.beriPenilaian(pemesan, { pekerjaanId, bintang, komentar: null })).toEqual({ ok: false, reason: "input_tidak_valid" });
    }
    expect((await bacaPekerjaan(siap)).bolehDinilai).toBe(true);
    expect(await setup.layanan.beriPenilaian(pemesan, { pekerjaanId, bintang: 4, komentar: "Rapi, tapi agak lambat." })).toEqual({ ok: true });
    expect(await setup.layanan.beriPenilaian(pemesan, { pekerjaanId, bintang: 1, komentar: null })).toEqual({ ok: false, reason: "sudah_dinilai" });
    expect(await bacaPekerjaan(siap)).toMatchObject({ dinilai: true, bolehDinilai: false });
    // Somebody else's job is not theirs to rate.
    const { pemesan: orangLain } = await pemesanLayanan(setup, "orang.lain@contoh.id");
    expect(await setup.layanan.beriPenilaian(orangLain, { pekerjaanId, bintang: 5, komentar: null })).toEqual({ ok: false, reason: "tidak_ditemukan" });
  });

  it("is optional and needs no comment", async () => {
    const siap = await pekerjaanSelesai();
    expect(await siap.setup.layanan.beriPenilaian(siap.pemesan, { pekerjaanId: siap.pekerjaanId, bintang: 5 })).toEqual({ ok: true });
    const [nilai] = await siap.setup.layanan.daftarPenilaian(siap.lokasi.admin);
    expect(nilai).toMatchObject({ bintang: 5, komentar: null });
  });

  it("is refused for a job that has not been finished", async () => {
    const setup = layananOnTestDatabase(db);
    await siapkanOperatorLayanan(setup);
    const lokasi = await lokasiDenganLayanan(setup);
    const petak = await petakDenganHakPakai(setup, lokasi);
    const { pemesan } = await pemesanLayanan(setup);
    const order = await setup.layanan.placePesananLayanan(pemesan, {
      pemesanName: "Budi Santoso",
      phoneNumber: "081234567890",
      lokasiId: lokasi.lokasiMitra.id,
      petakId: petak.petakId,
      item: [{ layananVariantId: lokasi.varian.id, targetDate: "2026-10-20", teks: null }],
    });
    if (!order.ok) throw new Error("order refused");
    const kerja = (await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan))?.item[0].pekerjaan;
    if (!kerja) throw new Error("no job");
    expect(kerja.bolehDinilai).toBe(false);
    expect(await setup.layanan.beriPenilaian(pemesan, { pekerjaanId: kerja.id, bintang: 5, komentar: null })).toEqual({ ok: false, reason: "belum_selesai" });
  });

  it("is seen by Admin Platform alone: never by the Admin Lokasi, the Pemesan's own page, or a Keluhan's staff read", async () => {
    const siap = await pekerjaanSelesai();
    const { setup, lokasi, pemesan, pekerjaanId } = siap;
    await setup.layanan.beriPenilaian(pemesan, { pekerjaanId, bintang: 2, komentar: "Nisan masih berdebu sekali." });

    // Admin Platform reads it, with the job it is about.
    expect(await setup.layanan.daftarPenilaian(lokasi.admin)).toMatchObject([
      { pekerjaanId, bintang: 2, komentar: "Nisan masih berdebu sekali.", pesanan: siap.order.pesanan.nomor, lokasi: { name: expect.any(String) } },
    ]);
    // The Admin Lokasi of the Lokasi gets nothing from the list, and nothing of it in the job it reads.
    expect(await setup.layanan.daftarPenilaian(lokasi.adminLokasi)).toEqual([]);
    const dibaca = await setup.layanan.pekerjaanUntukStaf(lokasi.adminLokasi, { pekerjaanId });
    if (!dibaca.ok) throw new Error("job refused");
    expect(JSON.stringify(dibaca.pekerjaan)).not.toMatch(/berdebu|bintang|penilaian/i);
    // The Pemesan's own page knows that it was given, and does not read the stars back.
    expect(JSON.stringify(await bacaPekerjaan(siap))).not.toMatch(/berdebu|bintang/i);
    // Nor does the Admin Lokasi's Antrean.
    const { queues } = queuesOnTestDatabase(db);
    expect(JSON.stringify(await queues.antreanLokasi(lokasi.adminLokasi, lokasi.lokasiMitra.id))).not.toMatch(/berdebu/);
    // The Keluhan read Admin Platform decides on carries it, and the Admin Lokasi cannot open that read at all.
    const keluhanId = await ajukan(siap);
    const untukPlatform = await setup.layanan.keluhanUntukPlatform(lokasi.admin, keluhanId);
    expect(untukPlatform).toMatchObject({ ok: true, keluhan: { penilaian: { bintang: 2 }, pemesan: { name: "Budi Santoso" } } });
    expect(await setup.layanan.keluhanUntukPlatform(lokasi.adminLokasi, keluhanId)).toEqual({ ok: false, reason: "tidak_berwenang" });
  });
});

describe("a Keluhan on a job whose Tagihan a Harga Khusus reissued (ticket 93)", () => {
  it("finds the job's Pencairan item on the Tagihan the family paid: a rejected Keluhan releases it and Admin Platform's override lowers it", async () => {
    const siap = await pekerjaanSelesai({ hargaKhusus: true });
    const { setup, lokasi } = siap;
    const keluhanId = await ajukan(siap);
    expect((await putuskan(siap, keluhanId, "tolak")).ok).toBe(true);
    expect(await jumlahJatuhTempo(setup, lokasi.admin)).toEqual([750_000]);

    expect(await setup.layanan.sesuaikanPencairanKeluhan(lokasi.admin, { keluhanId, amount: 375_000, catatan: "Setengah: bersih sebagian." })).toMatchObject({
      ok: true,
      jumlah: 375_000,
      jumlahAwal: 750_000,
    });
  });
});

describe("a refund after an upheld Keluhan on a Tagihan a Harga Khusus reduced (ticket 95)", () => {
  it("asks Refunds for the job's proportional share of what the family paid, the platform fee bearing its share, rounded down", async () => {
    const siap = await pekerjaanSelesai({ hargaKhusus: true });
    const { setup, tagihanDibayar } = siap;
    const keluhanId = await ajukan(siap);
    // The Layanan line is Rp 750.000 and the fee Rp 150.000; the Harga Khusus of Rp 50.000 leaves Rp 850.000 paid, so each line returns 850/900 of itself.
    expect(await putuskan(siap, keluhanId, "kembalikan_dana", "Pekerjaan tidak dilakukan.")).toMatchObject({ ok: true, keluhan: { status: "dana_kembali" } });
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ tagihanId: tagihanDibayar, pihakBersalah: "lokasi", jumlah: 849_999, status: "diajukan" });
    expect(permintaan.lines.map((baris) => baris.amount)).toEqual([708_333, 141_666]);
    // Rounding down never returns more than was paid.
    expect(permintaan.jumlah).toBeLessThanOrEqual(850_000);
  });
});

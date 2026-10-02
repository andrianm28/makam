import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { adminPlatformOf } from "../../../tests/support/identity";
import { mitraJasaUntuk, orderTpu, siapTpu } from "../../../tests/support/layanan-tpu";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  layananOnTestDatabase,
  signedInAdminLokasi,
  lokasiDenganLayanan,
  petakDenganHakPakai,
  pemesanLayanan,
  siapkanOperatorLayanan,
} from "../../../tests/support/layanan";

/**
 * The message thread of a Pekerjaan Layanan (spec, Layanan > Message thread; stories 96, 131, 171, 180).
 * Read only through the Layanan module's public functions, with the fake Clock, the in-memory FileStore
 * and the Layanan messages the fixture collects in place of the Notifications module.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const foto = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);

/** A paid order with one Dijadwalkan job at a Lokasi Mitra, and a second Pemesan who ordered nothing. */
async function pekerjaanDijadwalkan() {
  const setup = layananOnTestDatabase(db);
  await siapkanOperatorLayanan(setup);
  const lokasi = await lokasiDenganLayanan(setup);
  const petak = await petakDenganHakPakai(setup, lokasi);
  const { pemesan } = await pemesanLayanan(setup);
  const { pemesan: orangLain } = await pemesanLayanan(setup, "orang.lain@contoh.id");
  const order = await setup.layanan.placePesananLayanan(pemesan, {
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    lokasiId: lokasi.lokasiMitra.id,
    petakId: petak.petakId,
    item: [{ layananVariantId: lokasi.varian.id, targetDate: "2026-10-20", teks: null }],
  });
  if (!order.ok) throw new Error(`order refused: ${order.reason}`);
  setup.clock.set(wib("2026-10-01 10:00"));
  const dibayar = await setup.billing.recordPayment(order.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: wib("2026-10-01 10:00") });
  if (!dibayar.ok) throw new Error("payment refused");
  const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
  const pekerjaanId = dibaca?.item[0].pekerjaan?.id;
  if (!pekerjaanId) throw new Error("no job");
  return { setup, lokasi, pemesan, orangLain, order, pekerjaanId };
}

describe("the Pekerjaan Layanan message thread", () => {
  it("lets the Pemesan write and the Admin Lokasi of that Lokasi read it and answer", async () => {
    const { setup, lokasi, pemesan, pekerjaanId } = await pekerjaanDijadwalkan();

    const ditulis = await setup.layanan.kirimPesanPemesan(pemesan, { pekerjaanId, teks: "Tolong bersihkan sampai ke sudut." });
    expect(ditulis.ok).toBe(true);
    const dibalas = await setup.layanan.kirimPesanStaf(lokasi.adminLokasi, { pekerjaanId, teks: "Baik, Bu." });
    expect(dibalas.ok).toBe(true);

    const bacaStaf = await setup.layanan.bacaThreadStaf(lokasi.adminLokasi, pekerjaanId);
    if (!bacaStaf.ok) throw new Error(bacaStaf.reason);
    expect(bacaStaf.thread.pesan.map((pesan) => [pesan.label, pesan.teks])).toEqual([
      ["Keluarga", "Tolong bersihkan sampai ke sudut."],
      ["Anda", "Baik, Bu."],
    ]);
    const bacaPemesan = await setup.layanan.bacaThreadPemesan(pemesan, pekerjaanId);
    if (!bacaPemesan.ok) throw new Error(bacaPemesan.reason);
    expect(bacaPemesan.thread.pesan.map((pesan) => pesan.label)).toEqual(["Anda", "Admin Lokasi"]);
  });

  it("refuses everyone else: another Pemesan and the Admin Lokasi of another Lokasi can neither read nor write", async () => {
    const { setup, pemesan, orangLain, pekerjaanId } = await pekerjaanDijadwalkan();
    await setup.layanan.kirimPesanPemesan(pemesan, { pekerjaanId, teks: "Rahasia keluarga." });
    const lokasiLain = await lokasiDenganLayanan(setup, { nama: "Layanan Lain" });
    // An Admin Lokasi of the other Lokasi only: the fixture's own Admin Lokasi would be invited to both.
    const { actor: admin } = await adminPlatformOf(setup);
    const adminLain = await signedInAdminLokasi(setup, admin, [lokasiLain.lokasiMitra.id], "084444444444");

    expect(await setup.layanan.bacaThreadPemesan(orangLain, pekerjaanId)).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect(await setup.layanan.kirimPesanPemesan(orangLain, { pekerjaanId, teks: "Halo" })).toEqual({ ok: false, reason: "tidak_ditemukan" });
    expect((await setup.layanan.bacaThreadStaf(adminLain, pekerjaanId)).ok).toBe(false);
    expect((await setup.layanan.kirimPesanStaf(adminLain, { pekerjaanId, teks: "Halo" })).ok).toBe(false);
  });

  it("lets an Admin Lokasi read and post only on jobs at their own Lokasi", async () => {
    const { setup, lokasi, pemesan, pekerjaanId } = await pekerjaanDijadwalkan();
    const lokasiLain = await lokasiDenganLayanan(setup, { nama: "Layanan Lain" });
    const { actor: admin } = await adminPlatformOf(setup);
    const adminLain = await signedInAdminLokasi(setup, admin, [lokasiLain.lokasiMitra.id], "084444444444");
    const petakLain = await petakDenganHakPakai(setup, lokasiLain);
    const orderLain = await setup.layanan.placePesananLayanan(pemesan, {
      pemesanName: "Budi Santoso",
      phoneNumber: "081234567890",
      lokasiId: lokasiLain.lokasiMitra.id,
      petakId: petakLain.petakId,
      item: [{ layananVariantId: lokasiLain.varian.id, targetDate: "2026-10-20", teks: null }],
    });
    if (!orderLain.ok) throw new Error(`order refused: ${orderLain.reason}`);
    const dibayar = await setup.billing.recordPayment(orderLain.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: setup.clock.now() });
    if (!dibayar.ok) throw new Error("payment refused");
    const pekerjaanLain = (await setup.layanan.pesananLayananOf(orderLain.pesanan.nomor, pemesan))?.item[0].pekerjaan?.id;
    if (!pekerjaanLain) throw new Error("no job");

    // The Admin Lokasi of the other Lokasi works on its own job and is refused on this one, and the other way round.
    expect((await setup.layanan.kirimPesanStaf(adminLain, { pekerjaanId: pekerjaanLain, teks: "Siap." })).ok).toBe(true);
    expect((await setup.layanan.kirimPesanStaf(adminLain, { pekerjaanId, teks: "Siap." })).ok).toBe(false);
    expect((await setup.layanan.bacaThreadStaf(adminLain, pekerjaanId)).ok).toBe(false);
    expect((await setup.layanan.kirimPesanStaf(lokasi.adminLokasi, { pekerjaanId, teks: "Siap." })).ok).toBe(true);
  });

  it("lets Admin Platform read every thread and step in with a message", async () => {
    const { setup, lokasi, pemesan, pekerjaanId } = await pekerjaanDijadwalkan();
    await setup.layanan.kirimPesanPemesan(pemesan, { pekerjaanId, teks: "Tolong dilihat." });
    const { actor: admin } = await adminPlatformOf(setup);
    const baca = await setup.layanan.bacaThreadStaf(admin, pekerjaanId);
    expect(baca.ok && baca.thread.pesan.map((pesan) => pesan.teks)).toEqual(["Tolong dilihat."]);
    expect((await setup.layanan.kirimPesanStaf(admin, { pekerjaanId, teks: "Kami menindaklanjuti." })).ok).toBe(true);
    const lagi = await setup.layanan.bacaThreadStaf(lokasi.adminLokasi, pekerjaanId);
    expect(lagi.ok && lagi.thread.pesan.map((pesan) => pesan.label)).toEqual(["Keluarga", "Admin Platform"]);
  });

  it("emails the Pemesan a link when staff writes, without the text or the photo, and tells nobody when the Pemesan writes", async () => {
    const { setup, lokasi, pemesan, pekerjaanId } = await pekerjaanDijadwalkan();
    await setup.layanan.kirimPesanPemesan(pemesan, { pekerjaanId, teks: "Pertanyaan saya." });
    expect(setup.notifikasi.pesanThread).toEqual([]);

    await setup.layanan.kirimPesanStaf(lokasi.adminLokasi, { pekerjaanId, teks: "Nisan sudah kami bersihkan.", foto: [{ body: foto(), contentType: "image/jpeg" }] });
    expect(setup.notifikasi.pesanThread).toHaveLength(1);
    const [pesan] = setup.notifikasi.pesanThread;
    expect(pesan.email).toBe("pemesan.layanan@contoh.id");
    expect(pesan.dari).toBe("admin_lokasi");
    expect(JSON.stringify(pesan)).not.toContain("Nisan sudah");
  });

  it("queues a plain link email through Notifications, with no word of the message in what the family is sent", async () => {
    const setup = layananOnTestDatabase(db, { notifikasiNyata: true });
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
    await setup.billing.recordPayment(order.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: wib("2026-10-01 10:00") });
    const pekerjaanId = (await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan))?.item[0].pekerjaan?.id;
    if (!pekerjaanId) throw new Error("no job");

    await setup.layanan.kirimPesanStaf(lokasi.adminLokasi, { pekerjaanId, teks: "Nisan sudah kami bersihkan." });
    const pesan = (await setup.notifications.pesanLayanan(order.pesanan.nomor)).filter((satu) => satu.template === "layanan_pesan_baru");
    expect(pesan).toHaveLength(1);
    expect(pesan[0].channel).toBe("email");
    expect(pesan[0].subject).not.toContain("Nisan");
  });

  it("keeps a photo in the private FileStore and shows it by a signed URL", async () => {
    const { setup, pemesan, pekerjaanId } = await pekerjaanDijadwalkan();
    const ditulis = await setup.layanan.kirimPesanPemesan(pemesan, { pekerjaanId, teks: "", foto: [{ body: foto(), contentType: "image/jpeg" }] });
    expect(ditulis.ok).toBe(true);
    const baca = await setup.layanan.bacaThreadPemesan(pemesan, pekerjaanId);
    if (!baca.ok) throw new Error(baca.reason);
    expect(baca.thread.pesan[0].foto).toHaveLength(1);
    expect(baca.thread.pesan[0].foto[0].url).toMatch(/^https?:\/\//);

    const bukanFoto = await setup.layanan.kirimPesanPemesan(pemesan, { pekerjaanId, teks: "x", foto: [{ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" }] });
    expect(bukanFoto).toEqual({ ok: false, reason: "berkas_tidak_didukung" });
    expect(await setup.layanan.kirimPesanPemesan(pemesan, { pekerjaanId, teks: "" })).toEqual({ ok: false, reason: "input_tidak_valid" });
  });

  it("a message with a phone number or an email address is sent like any other message", async () => {
    const { setup, lokasi, pemesan, pekerjaanId } = await pekerjaanDijadwalkan();
    for (const teks of ["Hubungi saya di 0812-3456-7890", "wa saya +62 812 3456 7890", "email budi@contoh.id ya"]) {
      expect((await setup.layanan.kirimPesanPemesan(pemesan, { pekerjaanId, teks })).ok).toBe(true);
      expect((await setup.layanan.kirimPesanStaf(lokasi.adminLokasi, { pekerjaanId, teks })).ok).toBe(true);
    }
    const baca = await setup.layanan.bacaThreadStaf(lokasi.adminLokasi, pekerjaanId);
    if (!baca.ok) throw new Error(baca.reason);
    expect(baca.thread.pesan.map((m) => m.teks)).toContain("Hubungi saya di 0812-3456-7890");
  });

  it("becomes read-only when the Keluhan window closes", async () => {
    const { setup, lokasi, pemesan, pekerjaanId } = await pekerjaanDijadwalkan();
    setup.clock.set(wib("2026-10-20 10:00"));
    for (const kind of ["foto_sebelum", "foto_sesudah"] as const) {
      const diunggah = await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, { pekerjaanId, kind, takenAt: wib("2026-10-20 10:00"), file: { body: foto(), contentType: "image/jpeg" } });
      if (!diunggah.ok) throw new Error(`proof refused: ${diunggah.reason}`);
    }
    const selesai = await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId });
    if (!selesai.ok) throw new Error(`Selesai refused: ${selesai.reason}`);

    // Inside the window the thread is open and the tick has nothing to close.
    setup.clock.set(wib("2026-10-23 10:00"));
    await setup.layanan.tutupJendelaKeluhan(setup.clock.now());
    expect((await setup.layanan.kirimPesanPemesan(pemesan, { pekerjaanId, teks: "Terima kasih." })).ok).toBe(true);

    setup.clock.set(wib("2026-10-23 10:01"));
    await setup.layanan.tutupJendelaKeluhan(setup.clock.now());
    expect(await setup.layanan.kirimPesanPemesan(pemesan, { pekerjaanId, teks: "Satu lagi." })).toEqual({ ok: false, reason: "tertutup" });
    expect(await setup.layanan.kirimPesanStaf(lokasi.adminLokasi, { pekerjaanId, teks: "Sama-sama." })).toEqual({ ok: false, reason: "tertutup" });
    const { actor: admin } = await adminPlatformOf(setup);
    expect(await setup.layanan.kirimPesanStaf(admin, { pekerjaanId, teks: "Dari Admin Platform." })).toEqual({ ok: false, reason: "tertutup" });
    // Still readable, with what was said.
    const baca = await setup.layanan.bacaThreadPemesan(pemesan, pekerjaanId);
    expect(baca.ok && baca.thread.tertutup).toBe(true);
    expect(baca.ok && baca.thread.pesan.map((pesan) => pesan.teks)).toEqual(["Terima kasih."]);
  });
});

describe("the message thread of a Pekerjaan Layanan at a DKI TPU", () => {
  async function pekerjaanTpuDiterima() {
    const setup = layananOnTestDatabase(db, { pekerjaanNyata: true });
    const s = { setup, ...(await siapTpu(setup)) };
    const mitra = await mitraJasaUntuk(setup, s, s.bunga.id);
    const dipesan = await setup.layanan.placePesananLayananTpu(s.pemesan, orderTpu(s, [{ layananVariantId: s.bunga.id, targetDate: "2026-10-05" }]));
    if (!dipesan.ok) throw new Error(`order refused: ${dipesan.reason}`);
    const dibayar = await setup.billing.recordPayment(dipesan.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: setup.clock.now() });
    if (!dibayar.ok) throw new Error("payment refused");
    const [job] = await setup.layanan.pekerjaanTpuUntukStaf(s.admin);
    return { ...s, mitra, job, dipesan };
  }

  it("is open to the Mitra Jasa only once they hold the job; the Pemesan then sees their first name and photo, and never the other way round", async () => {
    const s = await pekerjaanTpuDiterima();
    const pekerjaanId = s.job.id;
    const ditugaskan = await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId, mitraJasaId: s.mitra.id });
    if (!ditugaskan.ok) throw new Error(ditugaskan.reason);
    // Assigned but not yet accepted: not theirs to read.
    expect((await s.setup.layanan.bacaThreadStaf(s.mitra.actor, pekerjaanId)).ok).toBe(false);
    expect((await s.setup.layanan.jawabPenugasan(s.mitra.actor, { pekerjaanId, jawaban: "terima" })).ok).toBe(true);

    const dari = await s.setup.layanan.kirimPesanStaf(s.mitra.actor, { pekerjaanId, teks: "Pak, makamnya yang dekat pohon kamboja?" });
    expect(dari.ok).toBe(true);
    expect((await s.setup.layanan.kirimPesanPemesan(s.pemesan, { pekerjaanId, teks: "Betul, Pak." })).ok).toBe(true);

    const bacaPemesan = await s.setup.layanan.bacaThreadPemesan(s.pemesan, pekerjaanId);
    if (!bacaPemesan.ok) throw new Error(bacaPemesan.reason);
    const namaDepan = s.mitra.namaLengkap.split(" ")[0];
    expect(bacaPemesan.thread.mitraJasa?.namaDepan).toBe(namaDepan);
    expect(bacaPemesan.thread.pesan.map((pesan) => pesan.label)).toEqual([namaDepan, "Anda"]);
    expect(JSON.stringify(bacaPemesan)).not.toContain(s.mitra.namaLengkap);

    // The Mitra Jasa reads the family only as "Keluarga": no name, no phone number, no email.
    const bacaMitra = await s.setup.layanan.bacaThreadStaf(s.mitra.actor, pekerjaanId);
    if (!bacaMitra.ok) throw new Error(bacaMitra.reason);
    expect(bacaMitra.thread.mitraJasa).toBeNull();
    expect(bacaMitra.thread.pesan.map((pesan) => pesan.label)).toEqual(["Anda", "Keluarga"]);
    expect(JSON.stringify(bacaMitra)).not.toMatch(/0812|@contoh\.id/);
    // Only the Mitra Jasa's message told the Pemesan; the Pemesan's own reply told nobody.
    expect(s.setup.notifikasi.pesanThread.map((pesan) => pesan.dari)).toEqual(["mitra_jasa"]);
  });

  it("emails the Pemesan a link when the Mitra Jasa writes, with no text, and lets Admin Platform read and post", async () => {
    const s = await pekerjaanTpuDiterima();
    const pekerjaanId = s.job.id;
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId, mitraJasaId: s.mitra.id });
    await s.setup.layanan.jawabPenugasan(s.mitra.actor, { pekerjaanId, jawaban: "terima" });
    await s.setup.layanan.kirimPesanStaf(s.mitra.actor, { pekerjaanId, teks: "Saya sudah di lokasi." });
    expect(s.setup.notifikasi.pesanThread).toHaveLength(1);
    expect(s.setup.notifikasi.pesanThread[0]).toMatchObject({ dari: "mitra_jasa", lokasi: null, tempat: "TPU Kober" });
    expect(JSON.stringify(s.setup.notifikasi.pesanThread)).not.toContain("sudah di lokasi");
    expect((await s.setup.layanan.kirimPesanStaf(s.admin, { pekerjaanId, teks: "Terima kasih, Pak." })).ok).toBe(true);
    const baca = await s.setup.layanan.bacaThreadStaf(s.admin, pekerjaanId);
    expect(baca.ok && baca.thread.pesan.map((pesan) => pesan.teks)).toEqual(["Saya sudah di lokasi.", "Terima kasih, Pak."]);
  });
  it("becomes read-only when the TPU Keluhan window closes, 3×24 h after Admin Platform approves the proof", async () => {
    const s = await pekerjaanTpuDiterima();
    const pekerjaanId = s.job.id;
    const tarif = await s.setup.tariffs.setTarifMitraJasa(s.admin, s.bunga.id, { amount: 150_000, effectiveOn: "2026-10-01", reason: null });
    if (!tarif.ok) throw new Error(tarif.reason);
    await s.setup.layanan.tugaskanMitraJasa(s.admin, { pekerjaanId, mitraJasaId: s.mitra.id });
    await s.setup.layanan.jawabPenugasan(s.mitra.actor, { pekerjaanId, jawaban: "terima" });
    s.setup.clock.set(wib("2026-10-05 10:00"));
    const diambil = await s.setup.layanan.simpanBuktiTpu(s.mitra.actor, { pekerjaanId, kind: "foto_sesudah", takenAt: s.setup.clock.now(), file: { body: foto(), contentType: "image/jpeg" } });
    if (!diambil.ok) throw new Error(diambil.reason);
    const kirim = await s.setup.layanan.kirimBuktiTpu(s.mitra.actor, { pekerjaanId });
    if (!kirim.ok) throw new Error(kirim.reason);
    const setuju = await s.setup.layanan.setujuiBuktiTpu(s.admin, { pekerjaanId });
    if (!setuju.ok) throw new Error(setuju.reason);

    // Inside the window the thread is open.
    s.setup.clock.set(wib("2026-10-08 10:00"));
    await s.setup.layanan.tutupJendelaKeluhan(s.setup.clock.now());
    expect((await s.setup.layanan.kirimPesanStaf(s.mitra.actor, { pekerjaanId, teks: "Sudah selesai, Bu." })).ok).toBe(true);
    expect((await s.setup.layanan.kirimPesanPemesan(s.pemesan, { pekerjaanId, teks: "Terima kasih." })).ok).toBe(true);

    s.setup.clock.set(wib("2026-10-08 10:01"));
    await s.setup.layanan.tutupJendelaKeluhan(s.setup.clock.now());
    expect(await s.setup.layanan.kirimPesanPemesan(s.pemesan, { pekerjaanId, teks: "Satu lagi." })).toEqual({ ok: false, reason: "tertutup" });
    expect(await s.setup.layanan.kirimPesanStaf(s.mitra.actor, { pekerjaanId, teks: "Sama-sama." })).toEqual({ ok: false, reason: "tertutup" });
    expect(await s.setup.layanan.kirimPesanStaf(s.admin, { pekerjaanId, teks: "Dari Admin Platform." })).toEqual({ ok: false, reason: "tertutup" });
    const baca = await s.setup.layanan.bacaThreadStaf(s.mitra.actor, pekerjaanId);
    expect(baca.ok && baca.thread.tertutup).toBe(true);
    expect(baca.ok && baca.thread.pesan.map((pesan) => pesan.teks)).toEqual(["Sudah selesai, Bu.", "Terima kasih."]);
  });
});

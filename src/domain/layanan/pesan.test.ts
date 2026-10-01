import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import type { Actor } from "@/domain/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  layananOnTestDatabase,
  lokasiDenganLayanan,
  pemesanLayanan,
  petakDenganHakPakai,
  siapkanOperatorLayanan,
} from "../../../tests/support/layanan";
import { mitraJasaUntuk, orderTpu, siapTpu } from "../../../tests/support/layanan-tpu";

/**
 * The message thread of one Pekerjaan Layanan (spec, Layanan > Pekerjaan Layanan;
 * stories 96, 131, 171, 180; ticket 52). Everything is driven through the Layanan
 * module's public functions: the thread as each party reads it, what the fake
 * Notifications recorded, and the job's window-close tick.
 *
 * The fake Clock sits at Thursday 1 Oktober 2026 09:00 WIB.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const foto = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);
const SELESAI_PADA = wib("2026-10-20 10:00");

/** Somebody who is an Admin Lokasi, but not of the job's Lokasi. */
const adminLokasiLain: Actor = {
  accountId: "akun-admin-lain",
  email: "admin.lain@contoh.id",
  phoneNumber: null,
  roles: ["pemesan", "admin_lokasi"],
  lokasiIds: ["lokasi-mitra-lain"],
  totp: "tidak_perlu",
  sessionId: "sesi-admin-lain",
};

/** A signed-in Mitra Jasa who holds nothing: no job of theirs is ever this thread. */
const mitraJasaAsing: Actor = {
  accountId: "akun-mitra-asing",
  email: "mitra.asing@contoh.id",
  phoneNumber: null,
  roles: ["pemesan", "mitra_jasa"],
  lokasiIds: [],
  totp: "tidak_perlu",
  sessionId: "sesi-mitra-asing",
};

/** A paid order at a Lokasi Mitra whose one job is still open, with its Pengaturan and grave. */
async function orderLokasi(options: { selesai?: boolean } = {}) {
  const setup = layananOnTestDatabase(db);
  const admin = await siapkanOperatorLayanan(setup);
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
  const dibayar = await setup.billing.recordPayment(order.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: wib("2026-10-01 10:00") });
  if (!dibayar.ok) throw new Error("payment refused");
  const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
  const pekerjaanId = dibaca?.item[0].pekerjaan?.id;
  if (!pekerjaanId) throw new Error("no job");
  if (options.selesai) {
    setup.clock.set(SELESAI_PADA);
    for (const kind of ["foto_sebelum", "foto_sesudah"] as const) {
      const diunggah = await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, {
        pekerjaanId,
        kind,
        takenAt: SELESAI_PADA,
        file: { body: foto(), contentType: "image/jpeg" },
      });
      if (!diunggah.ok) throw new Error(`proof refused: ${diunggah.reason}`);
    }
    const selesai = await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId });
    if (!selesai.ok) throw new Error(`Selesai refused: ${selesai.reason}`);
  }
  return { setup, admin, lokasi, pemesan, order, pekerjaanId };
}

/** A TPU job held by a Mitra Jasa who covers it, with their own signed-in Akun. */
async function orderTpuDenganMitra() {
  const setup = layananOnTestDatabase(db, { pekerjaanNyata: true });
  const tpuSiap = await siapTpu(setup);
  const { actor: mitra, id: mitraJasaId } = await mitraJasaUntuk(setup, tpuSiap, tpuSiap.bunga.id, { namaLengkap: "Joko Susilo" });
  const dipesan = await setup.layanan.placePesananLayananTpu(tpuSiap.pemesan, orderTpu(tpuSiap, [{ layananVariantId: tpuSiap.bunga.id, targetDate: "2026-10-20" }]));
  if (!dipesan.ok) throw new Error(`order refused: ${dipesan.reason}`);
  const dibayar = await setup.billing.recordPayment(dipesan.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: setup.clock.now() });
  if (!dibayar.ok) throw new Error("payment refused");
  const [job] = await setup.layanan.pekerjaanTpuUntukStaf(tpuSiap.admin);
  if (!job) throw new Error("no TPU job");
  const ditugaskan = await setup.layanan.tugaskanMitraJasa(tpuSiap.admin, { pekerjaanId: job.id, mitraJasaId });
  if (!ditugaskan.ok) throw new Error(`assignment refused: ${ditugaskan.reason}`);
  return { setup, tpuSiap, pemesan: tpuSiap.pemesan, mitra, pekerjaanId: job.id };
}

describe("a Pekerjaan Layanan's message thread", () => {
  it("is read and written by its Pemesan, its Admin Lokasi and Admin Platform, and by nobody else", async () => {
    const { setup, admin, lokasi, pemesan, pekerjaanId } = await orderLokasi();

    // The three parties each read it.
    expect((await setup.layanan.pesanPekerjaanUntukPemesan(pemesan, pekerjaanId)).ok).toBe(true);
    expect((await setup.layanan.pesanPekerjaanUntukStaf(lokasi.adminLokasi, pekerjaanId)).ok).toBe(true);
    expect((await setup.layanan.pesanPekerjaanUntukStaf(admin, pekerjaanId)).ok).toBe(true);

    // Somebody else's Pemesan, another Lokasi's Admin Lokasi and an unrelated Mitra Jasa may not even read it.
    expect(await setup.layanan.pesanPekerjaanUntukPemesan({ accountId: "akun-bukan-pemesan" }, pekerjaanId)).toEqual({ ok: false, reason: "bukan_peserta" });
    expect(await setup.layanan.pesanPekerjaanUntukStaf(adminLokasiLain, pekerjaanId)).toEqual({ ok: false, reason: "bukan_peserta" });
    expect(await setup.layanan.pesanPekerjaanUntukStaf(mitraJasaAsing, pekerjaanId)).toEqual({ ok: false, reason: "bukan_peserta" });

    // The Admin Lokasi writes; the Pemesan writes back and reads both, oldest first.
    const dariStaf = await setup.layanan.kirimPesanPekerjaanStaf(lokasi.adminLokasi, { pekerjaanId, teks: "Kami mulai besok pagi." });
    expect(dariStaf.ok).toBe(true);
    setup.clock.advance({ minutes: 1 });
    const dariPemesan = await setup.layanan.kirimPesanPekerjaan(pemesan, { pekerjaanId, teks: "Baik, terima kasih." });
    expect(dariPemesan.ok).toBe(true);
    const dibaca = await setup.layanan.pesanPekerjaanUntukPemesan(pemesan, pekerjaanId);
    if (!dibaca.ok) throw new Error("thread refused");
    expect(dibaca.thread.pesan.map((satu) => satu.teks)).toEqual(["Kami mulai besok pagi.", "Baik, terima kasih."]);
    expect(dibaca.thread.readOnly).toBe(false);
  });

  it("keeps a photo in the private FileStore and shows it by a short-lived link, refusing a file that is not an image", async () => {
    const { setup, lokasi, pemesan, pekerjaanId } = await orderLokasi();
    const dikirim = await setup.layanan.kirimPesanPekerjaanStaf(lokasi.adminLokasi, { pekerjaanId, teks: "Ini lokasinya.", lampiran: [{ body: foto(), contentType: "image/jpeg" }] });
    expect(dikirim.ok).toBe(true);

    const dibaca = await setup.layanan.pesanPekerjaanUntukStaf(lokasi.adminLokasi, pekerjaanId);
    if (!dibaca.ok) throw new Error("thread refused");
    expect(dibaca.thread.pesan[0].lampiran).toHaveLength(1);
    expect(dibaca.thread.pesan[0].lampiran[0].url).toEqual(expect.any(String));
    // Bytes that are not the declared image are refused outright.
    expect(await setup.layanan.kirimPesanPekerjaan(pemesan, { pekerjaanId, teks: "Bukan foto.", lampiran: [{ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" }] })).toEqual({
      ok: false,
      reason: "berkas_tidak_didukung",
    });
  });

  it("tells the Pemesan a message arrived, without its text or its photo, and never about the Pemesan's own", async () => {
    const { setup, lokasi, pemesan, pekerjaanId, order } = await orderLokasi();
    await setup.layanan.kirimPesanPekerjaanStaf(lokasi.adminLokasi, { pekerjaanId, teks: "Nisannya sudah dibersihkan.", lampiran: [{ body: foto(), contentType: "image/jpeg" }] });
    await setup.layanan.kirimPesanPekerjaan(pemesan, { pekerjaanId, teks: "Terima kasih." });

    // Only the staff message is announced, so the Pemesan is not emailed about their own words.
    expect(setup.notifikasi.pesanBaruDicatat).toHaveLength(1);
    const catat = setup.notifikasi.pesanBaruDicatat[0];
    expect(catat).toMatchObject({ nomor: order.pesanan.nomor, pengirim: "admin_lokasi", lokasi: { id: lokasi.lokasiMitra.id } });
    // The words and the photo stay in the app: the announcement carries neither.
    expect(JSON.stringify(catat)).not.toContain("Nisannya sudah dibersihkan.");
    expect(catat).not.toHaveProperty("teks");
    expect(catat).not.toHaveProperty("lampiran");
  });

  it("shows the Pemesan the Mitra Jasa's first name and photo, and shows the Mitra Jasa no family contact", async () => {
    const { setup, tpuSiap, pemesan, mitra, pekerjaanId } = await orderTpuDenganMitra();

    const dibaca = await setup.layanan.pesanPekerjaanUntukPemesan(pemesan, pekerjaanId);
    if (!dibaca.ok) throw new Error("thread refused");
    expect(dibaca.thread.pelaksana).toMatchObject({ tipe: "mitra_jasa", nama: "Joko" });
    expect(dibaca.thread.pelaksana?.fotoUrl).toEqual(expect.any(String));

    // The Mitra Jasa writes, and the Pemesan sees only a first name on it.
    const dariMitra = await setup.layanan.kirimPesanPekerjaanStaf(mitra, { pekerjaanId, teks: "Makamnya di blok mana ya?" });
    expect(dariMitra.ok).toBe(true);
    const ulang = await setup.layanan.pesanPekerjaanUntukPemesan(pemesan, pekerjaanId);
    if (!ulang.ok) throw new Error("thread refused");
    expect(ulang.thread.pesan[0]).toMatchObject({ pengirim: "mitra_jasa", pengirimNama: "Joko" });

    // The Pemesan answers; the Mitra Jasa reads it with no phone, no email and no surname.
    setup.clock.advance({ minutes: 1 });
    await setup.layanan.kirimPesanPekerjaan(pemesan, { pekerjaanId, teks: "Blok C, nomor 7." });
    const sisiMitra = await setup.layanan.pesanPekerjaanUntukStaf(mitra, pekerjaanId);
    if (!sisiMitra.ok) throw new Error("thread refused");
    const teks = JSON.stringify(sisiMitra.thread);
    expect(teks).not.toContain("081234567890");
    expect(teks).not.toContain(tpuSiap.pemesan.email);
    expect(sisiMitra.thread.pesan.find((satu) => satu.pengirim === "pemesan")?.pengirimNama).toBe("Budi");
    expect(setup.notifikasi.pesanBaruDicatat.at(-1)).toMatchObject({ pengirim: "mitra_jasa" });
  });

  it("stays open until the Keluhan window closes, and becomes read-only after it", async () => {
    const { setup, lokasi, pemesan, pekerjaanId } = await orderLokasi({ selesai: true });
    // The proof was shown at 2026-10-20 10:00; the 3×24 h window is over just after 2026-10-23 10:00.
    setup.clock.set(wib("2026-10-23 09:59"));
    await setup.layanan.tutupJendelaKeluhan(setup.clock.now());
    const masih = await setup.layanan.pesanPekerjaanUntukPemesan(pemesan, pekerjaanId);
    if (!masih.ok) throw new Error("thread refused");
    expect(masih.thread.readOnly).toBe(false);

    setup.clock.set(wib("2026-10-23 10:01"));
    await setup.layanan.tutupJendelaKeluhan(setup.clock.now());
    const tutup = await setup.layanan.pesanPekerjaanUntukPemesan(pemesan, pekerjaanId);
    if (!tutup.ok) throw new Error("thread refused");
    expect(tutup.thread.readOnly).toBe(true);
    expect(tutup.thread.ditutupAt).toEqual(wib("2026-10-23 10:01"));
    expect(await setup.layanan.kirimPesanPekerjaan(pemesan, { pekerjaanId, teks: "Masih ada?" })).toEqual({ ok: false, reason: "thread_ditutup" });
    expect(await setup.layanan.kirimPesanPekerjaanStaf(lokasi.adminLokasi, { pekerjaanId, teks: "Halo?" })).toEqual({ ok: false, reason: "thread_ditutup" });
  });
});

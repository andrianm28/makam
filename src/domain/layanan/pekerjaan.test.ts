import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { adminPlatformOf } from "../../../tests/support/identity";
import type { Actor } from "@/domain/identity";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  layananOnTestDatabase,
  lokasiDenganLayanan,
  petakDenganHakPakai,
  pemesanLayanan,
  siapkanOperatorLayanan,
  type LayananSetup,
  type LokasiDenganLayanan,
} from "../../../tests/support/layanan";
import { tandaiTerlambat } from "./pekerjaan";

/**
 * Fulfilling a job at a Lokasi Mitra (spec, Layanan > Pekerjaan Layanan; stories 91
 * and 131): the three steps in order, the proof each kind of Layanan must carry,
 * the mark the Terlambat tick makes, and the rows both sides of the platform see.
 *
 * Every assertion is read through the module's public reads — what the Admin
 * Lokasi sees, what the Pemesan sees, and the messages the family was sent.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A JPEG as a real capture is, the first bytes the FileStore checks. */
const foto = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);
/** An MP4 as a real recording is: a box size, then the `ftyp` box. */
const video = () => new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

/** A Lokasi offering one Layanan, a grave on it, a family, and one paid and scheduled job. */
async function siap(options: Parameters<typeof lokasiDenganLayanan>[1] = {}) {
  const setup = layananOnTestDatabase(db);
  await siapkanOperatorLayanan(setup);
  const lokasi = await lokasiDenganLayanan(setup, options);
  const petak = await petakDenganHakPakai(setup, lokasi);
  const { pemesan } = await pemesanLayanan(setup);
  const hasil = await setup.layanan.placePesananLayanan(pemesan, {
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    lokasiId: lokasi.lokasiMitra.id,
    petakId: petak.petakId,
    item: [{ layananVariantId: lokasi.varian.id, targetDate: "2026-10-20", teks: null }],
  });
  if (!hasil.ok) throw new Error(`order refused: ${hasil.reason}`);
  setup.clock.set(wib("2026-10-01 10:00"));
  const dibayar = await setup.billing.recordPayment(hasil.tagihan.id, { method: { kind: "transfer_manual" }, reference: null, paidAt: wib("2026-10-01 10:00") });
  if (!dibayar.ok) throw new Error("payment refused");
  return { setup, lokasi, petak, pemesan, order: hasil };
}

/** The one job of that order, as the Admin Lokasi of that Lokasi reads it. */
async function pekerjaan(setup: LayananSetup, lokasi: LokasiDenganLayanan, pemesan: { accountId: string }, nomor: string) {
  const order = await setup.layanan.pesananLayananOf(nomor, pemesan);
  if (!order?.item[0].pekerjaan) throw new Error("no job");
  const dibaca = await setup.layanan.pekerjaanUntukStaf(lokasi.adminLokasi, { pekerjaanId: order.item[0].pekerjaan.id });
  if (!dibaca.ok) throw new Error(`job refused: ${dibaca.reason}`);
  return { order, kerja: dibaca.pekerjaan };
}

/** One captured proof, stamped at `takenAt`. */
function bukti(pekerjaanId: string, kind: "foto_sebelum" | "foto_sesudah" | "video", takenAt = wib("2026-10-20 10:00")) {
  return {
    pekerjaanId,
    kind,
    takenAt,
    file: { body: kind === "video" ? video() : foto(), contentType: kind === "video" ? "video/mp4" : "image/jpeg" },
  };
}

describe("a job on the Admin Lokasi's own list", () => {
  it("is there once it is paid, with the proof its kind of Layanan requires", async () => {
    const { setup, lokasi, pemesan, order } = await siap();
    const { kerja } = await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor);
    expect(kerja).toMatchObject({ status: "dijadwalkan", targetDate: "2026-10-20", batasTerlambat: "2026-10-22" });
    // A Pembersihan Makam is cleaned and tidied, so it is shown before and after.
    expect(kerja.dibutuhkan).toEqual(["foto_sebelum", "foto_sesudah"]);
    expect(kerja.kurang).toEqual(["foto_sebelum", "foto_sesudah"]);
    expect(kerja.pesanan).toMatchObject({ nomor: order.pesanan.nomor, label: "Layanan – Pembersihan Makam (Reguler)" });
  });

  it("is refused to another Lokasi's staff, and to the family", async () => {
    const { setup, pemesan, order } = await siap();
    const kerja = (await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan))?.item[0].pekerjaan;
    if (!kerja) throw new Error("no job");
    // The family's own Akun holds no staff role, so a job is not theirs to read;
    // Admin Platform, who sees every Lokasi's work, may.
    const keluarga: Actor = { accountId: pemesan.accountId, email: pemesan.email, phoneNumber: null, roles: [], lokasiIds: [], totp: "lolos", sessionId: "sesi-keluarga" };
    expect(await setup.layanan.pekerjaanUntukStaf(keluarga, { pekerjaanId: kerja.id })).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect((await setup.layanan.pekerjaanUntukStaf(await adminPlatform(setup), { pekerjaanId: kerja.id })).ok).toBe(true);
  });
});

describe("doing the work", () => {
  it("goes Mulai → Sedang Dikerjakan, and cannot be started twice or before it is paid", async () => {
    const { setup, lokasi, pemesan, order } = await siap();
    const { kerja } = await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor);
    expect(await setup.layanan.mulaiPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id })).toEqual({ ok: true, status: "sedang_dikerjakan" });
    expect(await setup.layanan.mulaiPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id })).toEqual({ ok: false, reason: "sudah_dikerjakan" });
  });

  it("keeps each captured proof, and lets a wrong one be taken again", async () => {
    const { setup, lokasi, pemesan, order } = await siap();
    const { kerja } = await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor);
    expect(await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sebelum"))).toEqual({ ok: true, kind: "foto_sebelum" });
    // One row per kind: the second capture replaces the first, so a job is never
    // left holding two "before" photos of different moments.
    expect(await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sebelum", wib("2026-10-20 10:05")))).toEqual({ ok: true, kind: "foto_sebelum" });

    const dibaca = await setup.layanan.pekerjaanUntukStaf(lokasi.adminLokasi, { pekerjaanId: kerja.id });
    if (!dibaca.ok) throw new Error("job refused");
    expect(dibaca.pekerjaan.bukti).toEqual([{ kind: "foto_sebelum", takenAt: wib("2026-10-20 10:05"), url: expect.stringContaining("foto_sebelum") }]);
  });

  it("refuses Selesai until every proof the Layanan's kind requires is there", async () => {
    const { setup, lokasi, pemesan, order } = await siap();
    const { kerja } = await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor);
    expect(await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id })).toEqual({
      ok: false,
      reason: "bukti_belum_lengkap",
      kurang: ["foto_sebelum", "foto_sesudah"],
    });

    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sebelum"));
    expect(await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id })).toEqual({
      ok: false,
      reason: "bukti_belum_lengkap",
      kurang: ["foto_sesudah"],
    });

    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sesudah"));
    const selesai = await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id });
    expect(selesai.ok).toBe(true);
  });

  it("marks a Laporan Foto/Video Selesai only with its video beside the photo", async () => {
    // The fixture's own Layanan is the Laporan, so its job needs the video the kind requires.
    const { setup, lokasi, pemesan, order } = await siap({ jenis: "laporan", nama: "Laporan Foto/Video", leadTimeDays: 0 });
    const { kerja } = await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor);
    expect(kerja.dibutuhkan).toEqual(["foto_sesudah", "video"]);

    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sesudah"));
    expect(await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id })).toEqual({
      ok: false,
      reason: "bukti_belum_lengkap",
      kurang: ["video"],
    });
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "video"));
    expect((await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id })).ok).toBe(true);
  });

  it("sends the Pemesan the link to the proof, and shows it on their own order", async () => {
    const { setup, lokasi, pemesan, order } = await siap();
    const { kerja } = await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor);
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sebelum"));
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sesudah"));
    setup.clock.set(wib("2026-10-20 11:00"));
    await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id });

    expect(setup.notifikasi.selesai).toEqual([
      {
        pekerjaanId: kerja.id,
        nomor: order.pesanan.nomor,
        email: pemesan.email,
        pemesanName: "Budi Santoso",
        lokasi: { id: lokasi.lokasiMitra.id, name: lokasi.lokasiMitra.name },
        petak: { nomor: (await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor)).order.petak.nomor },
        label: "Layanan – Pembersihan Makam (Reguler)",
        selesaiAt: wib("2026-10-20 11:00"),
        bukti: [
          { kind: "foto_sebelum", url: expect.stringContaining("foto_sebelum") },
          { kind: "foto_sesudah", url: expect.stringContaining("foto_sesudah") },
        ],
      },
    ]);

    const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
    expect(dibaca?.item[0].pekerjaan).toMatchObject({ status: "selesai", selesaiAt: wib("2026-10-20 11:00") });
    expect(dibaca?.item[0].pekerjaan?.bukti.map((satu) => satu.kind)).toEqual(["foto_sebelum", "foto_sesudah"]);
  });

  it("is a staff write only by that Lokasi's own Admin Lokasi", async () => {
    const { setup, lokasi, pemesan, order } = await siap();
    const { kerja } = await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor);
    const admin = (await adminPlatformOf(setup)).actor;
    // Admin Platform sees every job but never does one: the Lokasi's own staff do the work.
    expect(await setup.layanan.mulaiPekerjaan(admin, { pekerjaanId: kerja.id })).toEqual({ ok: false, reason: "tidak_berwenang" });
  });
});

describe("a job that ran late", () => {
  it("becomes Terlambat two days past its target date with no proof, and idempotently so", async () => {
    const { setup, lokasi, pemesan, order } = await siap();
    const { kerja } = await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor);

    // The target is the 20th, so the 22nd is the first day it counts as late.
    setup.clock.set(wib("2026-10-21 23:59"));
    expect(await tandaiTerlambat(setup.db, setup.clock.now())).toBe(0);
    setup.clock.set(wib("2026-10-22 00:01"));
    expect(await tandaiTerlambat(setup.db, setup.clock.now())).toBe(1);
    // Running the tick again for the same moment changes nothing.
    expect(await tandaiTerlambat(setup.db, setup.clock.now())).toBe(0);

    const terlambat = await setup.layanan.pekerjaanTerlambat();
    expect(terlambat).toEqual([
      {
        id: kerja.id,
        lokasi: { id: lokasi.lokasiMitra.id, name: lokasi.lokasiMitra.name },
        pesanan: order.pesanan.nomor,
        petak: (await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan))?.petak.nomor,
        targetDate: "2026-10-20",
        terlambatAt: wib("2026-10-22 00:01"),
      },
    ]);
  });

  it("is not flagged once it is finished, however late it was", async () => {
    const { setup, lokasi, pemesan, order } = await siap();
    const { kerja } = await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor);
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sebelum"));
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sesudah"));
    await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id });

    setup.clock.set(wib("2026-10-25 09:00"));
    expect(await tandaiTerlambat(setup.db, setup.clock.now())).toBe(0);
    expect(await setup.layanan.pekerjaanTerlambat()).toEqual([]);
  });

  it("keeps the moment it was first noticed, even after the Lokasi finishes it late", async () => {
    const { setup, lokasi, pemesan, order } = await siap();
    const { kerja } = await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor);
    setup.clock.set(wib("2026-10-22 09:00"));
    await tandaiTerlambat(setup.db, setup.clock.now());

    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sebelum", wib("2026-10-23 08:00")));
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sesudah", wib("2026-10-23 08:01")));
    expect((await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id })).ok).toBe(true);

    // The stamp is what a cancellation reads to tell a lateness from a change of
    // mind, so it outlives the status that set it.
    const dibaca = await setup.layanan.pesananLayananOf(order.pesanan.nomor, pemesan);
    expect(dibaca?.item[0].pekerjaan).toMatchObject({ status: "selesai", terlambat: true });
  });
});

/** The one Admin Platform of a setup, for the read every Lokasi's staff may do. */
async function adminPlatform(setup: LayananSetup) {
  return (await adminPlatformOf(setup)).actor;
}


describe("every staff write on a job leaves an Entri Audit", () => {
  it("records Mulai, each captured proof and Selesai on the job, at its own Lokasi, by the Admin Lokasi who did it", async () => {
    const { setup, lokasi, pemesan, order } = await siap();
    const { kerja } = await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor);
    await setup.layanan.mulaiPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id });
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sebelum"));
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sesudah"));
    setup.clock.set(wib("2026-10-20 11:00"));
    expect((await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id })).ok).toBe(true);

    const entri = await setup.audit.entriesAbout({ kind: "pekerjaan_layanan", id: kerja.id });
    expect(entri.map((satu) => satu.action)).toEqual([
      "layanan.mulai_pekerjaan",
      "layanan.unggah_bukti",
      "layanan.unggah_bukti",
      "layanan.selesaikan_pekerjaan",
    ]);
    for (const satu of entri) {
      expect(satu.actor).toEqual({ accountId: lokasi.adminLokasi.accountId, role: "admin_lokasi" });
      expect(satu.lokasiId).toBe(lokasi.lokasiMitra.id);
    }
    expect(entri[0]).toMatchObject({ before: { status: "dijadwalkan" }, after: { status: "sedang_dikerjakan" } });
    expect(entri[3]).toMatchObject({ before: { status: "sedang_dikerjakan" }, after: { status: "selesai", bukti: ["foto_sebelum", "foto_sesudah"] } });
  });

  it("records nothing for a write that was refused, or that changed nothing", async () => {
    const { setup, lokasi, pemesan, order } = await siap();
    const { kerja } = await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor);
    const admin = (await adminPlatformOf(setup)).actor;
    await setup.layanan.mulaiPekerjaan(admin, { pekerjaanId: kerja.id });
    await setup.layanan.mulaiPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id });
    await setup.layanan.mulaiPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id });
    // Selesai refused for missing proof.
    await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id });

    const entri = await setup.audit.entriesAbout({ kind: "pekerjaan_layanan", id: kerja.id });
    expect(entri.map((satu) => satu.action)).toEqual(["layanan.mulai_pekerjaan"]);
  });

  it("queues the family's message with the finished job, in the same commit", async () => {
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
    const { kerja } = await pekerjaan(setup, lokasi, pemesan, order.pesanan.nomor);
    // Refused for missing proof: no message.
    await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id });
    expect((await setup.notifications.pesanLayanan(order.pesanan.nomor)).map((pesan) => pesan.template)).not.toContain("layanan_pekerjaan_selesai");

    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sebelum"));
    await setup.layanan.unggahBuktiPekerjaan(lokasi.adminLokasi, bukti(kerja.id, "foto_sesudah"));
    expect((await setup.layanan.selesaikanPekerjaan(lokasi.adminLokasi, { pekerjaanId: kerja.id })).ok).toBe(true);
    expect((await setup.notifications.pesanLayanan(order.pesanan.nomor)).map((pesan) => pesan.template)).toContain("layanan_pekerjaan_selesai");
  });
});

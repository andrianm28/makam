import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { layananOnTestDatabase, type LayananSetup } from "../../../tests/support/layanan";
import {
  diterima,
  foto,
  HARGA_BUNGA_TABUR,
  HARGA_PEMBERSIHAN,
  mitraJasaUntuk,
  orderTpu,
  pencairanSaya,
  saatDukaTpuDikonfirmasi,
  setujui,
  siapTpu,
  siapTpuBertarif,
  TARIF,
  type MitraJasaTpu,
  type SiapTpuBertarif,
} from "../../../tests/support/layanan-tpu";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { tandaiTerlambatTpu } from "./terlambat-tpu";

/**
 * The photo proof of a TPU job, its approval, and the Mitra Jasa pay rules (spec, Layanan > Mitra Jasa;
 * stories 91, 92, 157, 179, 181; ticket 57). Everything goes through the Layanan, Payouts and Queues
 * public functions: the job a Pemesan and a Mitra Jasa read, the Pencairan the Mitra Jasa sees, the Antrean rows.
 *
 * The fake Clock sits at Thursday 1 Oktober 2026 09:00 WIB. The Mitra Jasa rate of a Bunga Tabur is Rp 150.000.
 */
const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const siap = () => siapTpuBertarif(db);
type Siap = SiapTpuBertarif;
type Mitra = MitraJasaTpu;

async function bayar(setup: LayananSetup, tagihanId: string) {
  const hasil = await setup.billing.recordPayment(tagihanId, { method: { kind: "transfer_manual" }, reference: null, paidAt: setup.clock.now() });
  if (!hasil.ok) throw new Error("payment refused");
}

/** A paid TPU order for one Layanan, handed to `mitra`, who accepts. Returns the job and its order. */
async function kerjaDiterima(s: Siap, mitra: Mitra, varianId: string = s.bunga.id, targetDate = "2026-10-05") {
  const dipesan = await s.setup.layanan.placePesananLayananTpu(s.pemesan, orderTpu(s, [{ layananVariantId: varianId, targetDate }]));
  if (!dipesan.ok) throw new Error(`order refused: ${dipesan.reason}`);
  await bayar(s.setup, dipesan.tagihan.id);
  const [job] = await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin);
  await diterima(s, mitra, job.id);
  return { pekerjaanId: job.id, nomor: dipesan.pesanan.nomor, tagihanId: dipesan.tagihan.id };
}

async function ambil(s: Siap, mitra: Mitra, pekerjaanId: string, kind: "foto_sebelum" | "foto_sesudah" | "video") {
  return s.setup.layanan.simpanBuktiTpu(mitra.actor, { pekerjaanId, kind, takenAt: s.setup.clock.now(), file: { body: foto(), contentType: "image/jpeg" } });
}

/** Takes the shots a Bunga Tabur needs and sends them. */
async function kirimBunga(s: Siap, mitra: Mitra, pekerjaanId: string) {
  const diambil = await ambil(s, mitra, pekerjaanId, "foto_sesudah");
  if (!diambil.ok) throw new Error(`shot refused: ${diambil.reason}`);
  const kirim = await s.setup.layanan.kirimBuktiTpu(mitra.actor, { pekerjaanId });
  if (!kirim.ok) throw new Error(`send refused: ${kirim.reason}`);
}

describe("the Mitra Jasa's photo proof of a TPU job", () => {
  it("is taken shot by shot, makes the job Sedang Dikerjakan, and cannot be sent until every shot the catalog requires is in", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.pembersihan.id);
    const { pekerjaanId } = await kerjaDiterima(s, mitra, s.pembersihan.id);

    expect(await s.setup.layanan.buktiTpuSaya(mitra.actor, pekerjaanId)).toMatchObject({ status: "dijadwalkan", dibutuhkan: ["foto_sebelum", "foto_sesudah"], terambil: [] });

    expect(await ambil(s, mitra, pekerjaanId, "foto_sebelum")).toEqual({ ok: true, kind: "foto_sebelum" });
    const dibaca = await s.setup.layanan.buktiTpuSaya(mitra.actor, pekerjaanId);
    expect(dibaca).toMatchObject({ status: "sedang_dikerjakan", terambil: [{ kind: "foto_sebelum", takenAt: wib("2026-10-01 09:00") }] });

    // Only the "before" shot is in: Pembersihan Makam asks for both.
    expect(await s.setup.layanan.kirimBuktiTpu(mitra.actor, { pekerjaanId })).toEqual({ ok: false, reason: "bukti_kurang", kurang: ["foto_sesudah"] });
    await ambil(s, mitra, pekerjaanId, "foto_sesudah");
    expect(await s.setup.layanan.kirimBuktiTpu(mitra.actor, { pekerjaanId })).toMatchObject({ ok: true, batasVerifikasi: wib("2026-10-02 09:00") });
    expect((await s.setup.layanan.buktiTpuSaya(mitra.actor, pekerjaanId))?.status).toBe("menunggu_verifikasi");
    // Waiting for approval, the proof is frozen.
    expect(await ambil(s, mitra, pekerjaanId, "foto_sesudah")).toEqual({ ok: false, reason: "tidak_bisa_diubah" });
  });

  it("takes only a photo or video from the Mitra Jasa who holds the job", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const lain = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "lain@contoh.id" });
    const { pekerjaanId } = await kerjaDiterima(s, mitra);

    expect(await ambil(s, lain, pekerjaanId, "foto_sesudah")).toEqual({ ok: false, reason: "tidak_ditemukan" });
    const bukanFoto = await s.setup.layanan.simpanBuktiTpu(mitra.actor, {
      pekerjaanId,
      kind: "foto_sesudah",
      takenAt: s.setup.clock.now(),
      file: { body: new Uint8Array([1, 2, 3]), contentType: "text/plain" },
    });
    expect(bukanFoto).toEqual({ ok: false, reason: "berkas_tidak_didukung" });
    expect(await s.setup.layanan.simpanBuktiTpu(s.admin, { pekerjaanId, kind: "foto_sesudah", takenAt: s.setup.clock.now(), file: { body: foto(), contentType: "image/jpeg" } })).toMatchObject({ ok: false, reason: "tidak_berwenang" });
  });
});

describe("Admin Platform's approval of the proof (Tier 2, 24 h)", () => {
  async function antrean(s: Siap, at: Date) {
    const komposisi = queuesOnTestDatabase(db);
    komposisi.clock.set(at);
    return (await komposisi.queues.antrean(s.admin)).filter((satu) => satu.type === "bukti_tpu_verifikasi");
  }

  it("lists a Tier 2 foto bukti row due 24 h after the proof was sent, and closes it when decided", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await kerjaDiterima(s, mitra);
    expect(await antrean(s, s.setup.clock.now())).toEqual([]);

    s.setup.clock.set(wib("2026-10-05 10:00"));
    await kirimBunga(s, mitra, pekerjaanId);
    const baris = await antrean(s, wib("2026-10-05 11:00"));
    expect(baris).toMatchObject([{ tier: 2, subjectKind: "pekerjaan_layanan_tpu", subjectId: pekerjaanId, deadline: wib("2026-10-06 10:00") }]);

    await setujui(s, pekerjaanId);
    expect(await antrean(s, wib("2026-10-05 11:01"))).toEqual([]);
  });

  it("rejects with a reason, returning the job to Sedang Dikerjakan with the same Mitra Jasa to shoot again", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await kerjaDiterima(s, mitra);
    await kirimBunga(s, mitra, pekerjaanId);

    expect(await s.setup.layanan.tolakBuktiTpu(s.admin, { pekerjaanId, alasan: "" })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await s.setup.layanan.tolakBuktiTpu(s.admin, { pekerjaanId, alasan: "Foto gelap, nisan tidak terlihat" })).toEqual({ ok: true });

    expect(await s.setup.layanan.buktiTpuSaya(mitra.actor, pekerjaanId)).toMatchObject({ status: "sedang_dikerjakan", alasanDitolak: "Foto gelap, nisan tidak terlihat" });
    expect(await antrean(s, s.setup.clock.now())).toEqual([]);
    expect(await ambil(s, mitra, pekerjaanId, "foto_sesudah")).toMatchObject({ ok: true });
    await s.setup.layanan.kirimBuktiTpu(mitra.actor, { pekerjaanId });
    expect(await antrean(s, s.setup.clock.now())).toHaveLength(1);
    // A rejection is not a job done: no Pencairan.
    expect(await pencairanSaya(s, mitra)).toEqual([]);
  });

  it("is Admin Platform's alone, and only for a job that is Menunggu Verifikasi", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await kerjaDiterima(s, mitra);
    expect(await s.setup.layanan.setujuiBuktiTpu(s.admin, { pekerjaanId })).toEqual({ ok: false, reason: "bukan_menunggu_verifikasi" });
    await kirimBunga(s, mitra, pekerjaanId);
    expect(await s.setup.layanan.setujuiBuktiTpu(mitra.actor, { pekerjaanId })).toMatchObject({ ok: false, reason: "tidak_berwenang" });
    expect(await s.setup.layanan.buktiTpuUntukStaf(mitra.actor, pekerjaanId)).toBeNull();
    expect(await s.setup.layanan.buktiTpuUntukStaf(s.admin, pekerjaanId)).toMatchObject({ status: "menunggu_verifikasi", bukti: [{ kind: "foto_sesudah" }] });
  });
});

describe("what the Pemesan sees of the proof", () => {
  it("is nothing until Admin Platform approves it, then the proof by short-lived link and a Selesai job", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId, nomor } = await kerjaDiterima(s, mitra);
    await kirimBunga(s, mitra, pekerjaanId);

    const sebelum = await s.setup.layanan.pesananTpuOf(nomor, s.pemesan);
    expect(sebelum?.item[0]).toMatchObject({ status: "menunggu_verifikasi", bukti: [] });

    await setujui(s, pekerjaanId);
    const sesudah = await s.setup.layanan.pesananTpuOf(nomor, s.pemesan);
    expect(sesudah?.item[0]).toMatchObject({ status: "selesai", bukti: [{ kind: "foto_sesudah", url: expect.stringContaining("pekerjaan-layanan-tpu/") }] });
  });
});

describe("the Pemesan is told when the proof is approved", () => {
  it("gets one message with the proof links on approval, and none while the proof is only sent or rejected", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId, nomor } = await kerjaDiterima(s, mitra);
    await kirimBunga(s, mitra, pekerjaanId);
    await s.setup.layanan.tolakBuktiTpu(s.admin, { pekerjaanId, alasan: "Foto gelap" });
    expect(s.setup.notifikasi.selesai).toEqual([]);

    await ambil(s, mitra, pekerjaanId, "foto_sesudah");
    await s.setup.layanan.kirimBuktiTpu(mitra.actor, { pekerjaanId });
    expect(s.setup.notifikasi.selesai).toEqual([]);
    await setujui(s, pekerjaanId);
    expect(s.setup.notifikasi.selesai).toMatchObject([
      { pekerjaanId, nomor, email: "pemesan.tpu@contoh.id", label: "Layanan – Bunga Tabur (Reguler)", bukti: [expect.objectContaining({ kind: "foto_sesudah", url: expect.stringContaining("pekerjaan-layanan-tpu/") })] },
    ]);
  });
});

describe("approval opens the Keluhan window and the Mitra Jasa's Pencairan", () => {
  it("records the Pencairan at the Mitra Jasa rate, due only once the 3×24 h window since the approval has closed", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await kerjaDiterima(s, mitra);
    await kirimBunga(s, mitra, pekerjaanId);
    s.setup.clock.set(wib("2026-10-05 10:00"));
    await setujui(s, pekerjaanId);

    expect(await pencairanSaya(s, mitra)).toMatchObject([{ layanan: "Layanan – Bunga Tabur (Reguler)", tanggal: "2026-10-05", tarif: TARIF, status: "belum_jatuh_tempo" }]);

    // The window is open at its last instant: still not due.
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-10-08 10:00"));
    expect((await pencairanSaya(s, mitra))[0].status).toBe("belum_jatuh_tempo");
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-10-08 10:01"));
    expect((await pencairanSaya(s, mitra))[0]).toMatchObject({ status: "jatuh_tempo", tarif: TARIF });
    // Running it again changes nothing.
    expect(await s.setup.layanan.tutupJendelaKeluhan(wib("2026-10-08 10:02"))).toMatchObject({ pencairanJatuhTempo: 0 });
  });

  it("refuses to approve while no Mitra Jasa rate is in force, so a job is never done for nothing", async () => {
    const setup = layananOnTestDatabase(db, { pekerjaanNyata: true });
    const tpuSiap = await siapTpu(setup);
    const s = { setup, ...tpuSiap };
    const mitra = await mitraJasaUntuk(setup, s, s.bunga.id);
    const { pekerjaanId } = await kerjaDiterima(s, mitra);
    await kirimBunga(s, mitra, pekerjaanId);
    expect(await setup.layanan.setujuiBuktiTpu(s.admin, { pekerjaanId })).toEqual({ ok: false, reason: "tarif_belum_ada" });
    expect((await setup.layanan.buktiTpuUntukStaf(s.admin, pekerjaanId))?.status).toBe("menunggu_verifikasi");
  });

  it("shows the Mitra Jasa only the job, Layanan, date and rate of each Pencairan, and applies no Potongan", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await kerjaDiterima(s, mitra);
    await kirimBunga(s, mitra, pekerjaanId);
    await setujui(s, pekerjaanId);

    const [satu] = await pencairanSaya(s, mitra);
    expect(Object.keys(satu).sort()).toEqual(["bukti", "dueAt", "itemId", "jatuhTempoAt", "layanan", "pekerjaan", "status", "tanggal", "tarif"]);
    expect(JSON.stringify(satu)).not.toMatch(/MKM-|Budi|Hasan|081234567890/);
    // The whole rate, to the rupiah: nothing is deducted from a Mitra Jasa.
    expect(satu.tarif).toBe(TARIF);
  });
});

describe("the Mitra Jasa pay rules", () => {
  it("pays only the Mitra Jasa who does the job when it was reassigned", async () => {
    const s = await siap();
    const a = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const b = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "b@contoh.id" });
    const { pekerjaanId } = await kerjaDiterima(s, a);
    const dilepas = await s.setup.layanan.lepasPenugasan(s.admin, { pekerjaanId, alasan: "Ganti orang" });
    expect(dilepas).toMatchObject({ ok: true });
    await diterima(s, b, pekerjaanId);
    await kirimBunga(s, b, pekerjaanId);
    await setujui(s, pekerjaanId);

    expect(await pencairanSaya(s, a)).toEqual([]);
    expect(await pencairanSaya(s, b)).toMatchObject([{ tarif: TARIF }]);
  });

  it("pays nothing for a job that is not done, however long the window ticks run", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    await kerjaDiterima(s, mitra);
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-11-30 10:00"));
    expect(await pencairanSaya(s, mitra)).toEqual([]);
  });

  it("makes a redo by the same Mitra Jasa unpaid, and releases the original Pencairan when the redo proof is approved", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const asal = await kerjaDiterima(s, mitra);
    await kirimBunga(s, mitra, asal.pekerjaanId);
    await setujui(s, asal.pekerjaanId);
    expect(await pencairanSaya(s, mitra)).toMatchObject([{ status: "belum_jatuh_tempo" }]);

    const ulang = await s.setup.layanan.kerjaUlangTpu(s.admin, { pekerjaanId: asal.pekerjaanId, mitraJasaId: mitra.id });
    if (!ulang.ok) throw new Error(ulang.reason);
    // While the redo is owed the original's Pencairan is held, whatever the window does.
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-10-20 10:00"));
    expect((await pencairanSaya(s, mitra))[0].status).toBe("belum_jatuh_tempo");

    await s.setup.layanan.jawabPenugasan(mitra.actor, { pekerjaanId: ulang.pekerjaanId, jawaban: "terima" });
    await kirimBunga(s, mitra, ulang.pekerjaanId);
    expect(await setujui(s, ulang.pekerjaanId)).toEqual({ ok: true, dibayar: false });

    // Still one Pencairan, the original's, now due; the redo earned nothing.
    expect(await pencairanSaya(s, mitra)).toMatchObject([{ status: "jatuh_tempo", tarif: TARIF }]);
  });

  it("pays a redo by another Mitra Jasa at the normal rate and cancels the original Pencairan", async () => {
    const s = await siap();
    const a = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const b = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "b@contoh.id" });
    const asal = await kerjaDiterima(s, a);
    await kirimBunga(s, a, asal.pekerjaanId);
    await setujui(s, asal.pekerjaanId);

    const ulang = await s.setup.layanan.kerjaUlangTpu(s.admin, { pekerjaanId: asal.pekerjaanId, mitraJasaId: b.id });
    if (!ulang.ok) throw new Error(ulang.reason);
    await s.setup.layanan.jawabPenugasan(b.actor, { pekerjaanId: ulang.pekerjaanId, jawaban: "terima" });
    await kirimBunga(s, b, ulang.pekerjaanId);
    expect(await setujui(s, ulang.pekerjaanId)).toEqual({ ok: true, dibayar: true });

    expect(await pencairanSaya(s, a)).toMatchObject([{ status: "dibatalkan", tarif: TARIF }]);
    expect(await pencairanSaya(s, b)).toMatchObject([{ status: "belum_jatuh_tempo", tarif: TARIF }]);
  });

  it("redoes only a finished job, and only once", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await kerjaDiterima(s, mitra);
    expect(await s.setup.layanan.kerjaUlangTpu(s.admin, { pekerjaanId, mitraJasaId: mitra.id })).toEqual({ ok: false, reason: "bukan_selesai" });
    await kirimBunga(s, mitra, pekerjaanId);
    await setujui(s, pekerjaanId);
    expect(await s.setup.layanan.kerjaUlangTpu(s.admin, { pekerjaanId, mitraJasaId: mitra.id })).toMatchObject({ ok: true });
    expect(await s.setup.layanan.kerjaUlangTpu(s.admin, { pekerjaanId, mitraJasaId: mitra.id })).toEqual({ ok: false, reason: "bukan_selesai" });
  });
});

describe("a hari-H Layanan on a Saat Duka TPU Tagihan", () => {
  it("makes the Mitra Jasa's Pencairan due under the normal rule while the family's Tagihan is still unpaid", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { nomor, hasil } = await saatDukaTpuDikonfirmasi(s.setup, s, [{ layananVariantId: s.bunga.id }]);
    const [job] = await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin);
    await diterima(s, mitra, job.id);
    s.setup.clock.set(wib("2026-10-02 12:00"));
    await kirimBunga(s, mitra, job.id);
    await setujui(s, job.id);

    expect((await s.setup.billing.tagihan(hasil.tagihan.id))?.status).not.toBe("lunas");
    // Before the window closes: not due. After it: due, with no payment from the family.
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-10-05 11:00"));
    expect((await pencairanSaya(s, mitra))[0].status).toBe("belum_jatuh_tempo");
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-10-05 12:01"));
    expect(await pencairanSaya(s, mitra)).toMatchObject([{ status: "jatuh_tempo", tarif: TARIF }]);
    expect(nomor).toMatch(/^MKM-/);
  });

  it("still pays the Mitra Jasa long after the Tagihan's due date has passed unpaid (the Operator bears a Tidak Tertagih loss)", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { hasil } = await saatDukaTpuDikonfirmasi(s.setup, s, [{ layananVariantId: s.bunga.id }]);
    const [job] = await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin);
    await diterima(s, mitra, job.id);
    s.setup.clock.set(wib("2026-10-02 12:00"));
    await kirimBunga(s, mitra, job.id);
    await setujui(s, job.id);

    // Thirty-plus days on, the family has still not paid; the Mitra Jasa's Pencairan is due all the same.
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-11-20 09:00"));
    expect((await s.setup.billing.tagihan(hasil.tagihan.id))?.status).not.toBe("lunas");
    expect(await pencairanSaya(s, mitra)).toMatchObject([{ status: "jatuh_tempo", tarif: TARIF }]);
  });
});

describe("a TPU job two days past its target date with no proof is Terlambat", () => {
  it("flags the job once, only after target + 2 days, and leaves a job with proof sent alone", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await kerjaDiterima(s, mitra, s.bunga.id, "2026-10-05");

    // Target 5 Oktober: on 7 Oktober it is two days past; the day before it is not.
    expect(await tandaiTerlambatTpu(s.setup.db, wib("2026-10-06 23:00"))).toBe(0);
    expect(await tandaiTerlambatTpu(s.setup.db, wib("2026-10-07 00:05"))).toBe(1);
    expect((await s.setup.layanan.buktiTpuSaya(mitra.actor, pekerjaanId))?.status).toBe("terlambat");
    // Idempotent.
    expect(await tandaiTerlambatTpu(s.setup.db, wib("2026-10-07 00:10"))).toBe(0);

    const lain = await kerjaDiterima(s, mitra, s.bunga.id, "2026-10-05");
    await kirimBunga(s, mitra, lain.pekerjaanId);
    expect(await tandaiTerlambatTpu(s.setup.db, wib("2026-10-20 00:00"))).toBe(0);
    expect((await s.setup.layanan.buktiTpuSaya(mitra.actor, lain.pekerjaanId))?.status).toBe("menunggu_verifikasi");
  });

  it("pays the full rate when a Terlambat job is done after all", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await kerjaDiterima(s, mitra, s.bunga.id, "2026-10-05");
    s.setup.clock.set(wib("2026-10-08 09:00"));
    await tandaiTerlambatTpu(s.setup.db, s.setup.clock.now());
    await kirimBunga(s, mitra, pekerjaanId);
    await setujui(s, pekerjaanId);
    expect(await pencairanSaya(s, mitra)).toMatchObject([{ tarif: TARIF, status: "belum_jatuh_tempo" }]);
  });

  it("pays nothing for a Terlambat job that is never done", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    await kerjaDiterima(s, mitra, s.bunga.id, "2026-10-05");
    await tandaiTerlambatTpu(s.setup.db, wib("2026-10-08 09:00"));
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-11-30 10:00"));
    expect(await pencairanSaya(s, mitra)).toEqual([]);
  });
});

describe("Cancelling a Terlambat TPU job", () => {
  async function terlambat(s: Siap, mitra: Mitra) {
    const kerja = await kerjaDiterima(s, mitra, s.bunga.id, "2026-10-05");
    s.setup.clock.set(wib("2026-10-08 09:00"));
    await tandaiTerlambatTpu(s.setup.db, s.setup.clock.now());
    return kerja;
  }
  async function dibatalkan(s: Siap, mitra: Mitra, pekerjaanId: string, tagihanId: string) {
    expect((await s.setup.layanan.buktiTpuSaya(mitra.actor, pekerjaanId))?.status).toBe("dibatalkan");
    const tagihan = await s.setup.billing.tagihan(tagihanId);
    const [permintaan, ...lain] = await s.setup.refunds.permintaanTerbuka();
    expect(lain).toEqual([]);
    // The whole Tagihan comes back (a DKI TPU Tagihan has no Biaya Layanan Platform line of its own): the lateness is the Mitra Jasa's.
    expect(permintaan).toMatchObject({ tagihanId, pihakBersalah: "mitra_jasa", status: "diajukan", jumlah: tagihan!.total });
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-11-30 10:00"));
    expect(await pencairanSaya(s, mitra)).toEqual([]);
  }

  it("by the Pemesan: only once the job is Terlambat, refunding the whole Tagihan, and the Mitra Jasa gets no Pencairan", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId, tagihanId } = await kerjaDiterima(s, mitra, s.bunga.id, "2026-10-05");
    expect(await s.setup.layanan.batalkanPekerjaanTerlambatTpuOlehPemesan(s.pemesan, { pekerjaanId })).toEqual({ ok: false, reason: "bukan_terlambat" });
    s.setup.clock.set(wib("2026-10-08 09:00"));
    await tandaiTerlambatTpu(s.setup.db, s.setup.clock.now());
    const lain = { accountId: "bukan-pemesan", email: "lain@contoh.id" };
    expect(await s.setup.layanan.batalkanPekerjaanTerlambatTpuOlehPemesan(lain, { pekerjaanId })).toMatchObject({ ok: false });
    expect(await s.setup.layanan.batalkanPekerjaanTerlambatTpuOlehPemesan(s.pemesan, { pekerjaanId })).toEqual({ ok: true });
    expect(await s.setup.layanan.batalkanPekerjaanTerlambatTpuOlehPemesan(s.pemesan, { pekerjaanId })).toEqual({ ok: false, reason: "bukan_terlambat" });
    await dibatalkan(s, mitra, pekerjaanId, tagihanId);
  });

  it("by Admin Platform on the family's behalf: guarded, with a reason, audited", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId, tagihanId } = await terlambat(s, mitra);
    const batal = { pekerjaanId, catatan: "Keluarga menelepon, Mitra Jasa tidak datang" };

    expect(await s.setup.layanan.batalkanPekerjaanTerlambatTpu(mitra.actor, batal)).toMatchObject({ ok: false, reason: "tidak_berwenang" });
    expect(await s.setup.layanan.batalkanPekerjaanTerlambatTpu(s.admin, { pekerjaanId, catatan: " " })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await s.setup.layanan.batalkanPekerjaanTerlambatTpu(s.admin, batal)).toEqual({ ok: true });
    expect(await s.setup.layanan.batalkanPekerjaanTerlambatTpu(s.admin, batal)).toEqual({ ok: false, reason: "bukan_terlambat" });
    await dibatalkan(s, mitra, pekerjaanId, tagihanId);
    expect((await s.setup.audit.allEntries()).filter((satu) => satu.action === "layanan.batalkan_pekerjaan_terlambat_tpu")).toHaveLength(1);
  });
});

describe("a Keluhan on a TPU job", () => {
  /** A job approved at 10:00 on 5 Oktober, so its Keluhan window is open until 8 Oktober 10:00. */
  async function selesai(s: Siap, mitra: Mitra) {
    const asal = await kerjaDiterima(s, mitra);
    s.setup.clock.set(wib("2026-10-05 10:00"));
    await kirimBunga(s, mitra, asal.pekerjaanId);
    await setujui(s, asal.pekerjaanId);
    return asal;
  }
  async function ajukan(s: Siap, pekerjaanId: string, waktu = wib("2026-10-06 09:00")) {
    s.setup.clock.set(waktu);
    return s.setup.layanan.ajukanKeluhanTpu(s.pemesan, { pekerjaanId, alasan: "Nisan masih kotor" });
  }

  it("is filed by the Pemesan inside the window, once, and holds the Mitra Jasa's Pencairan while it is open", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId, nomor } = await selesai(s, mitra);

    const diajukan = await ajukan(s, pekerjaanId);
    expect(diajukan).toMatchObject({ ok: true });
    expect((await s.setup.layanan.pesananTpuOf(nomor, s.pemesan))?.item[0].status).toBe("keluhan");
    expect(await ajukan(s, pekerjaanId)).toEqual({ ok: false, reason: "sudah_ada" });
    // The window passes with the Keluhan still open: the Pencairan does not become due.
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-10-20 10:00"));
    expect((await pencairanSaya(s, mitra))[0].status).toBe("belum_jatuh_tempo");
  });

  it("is refused after the window and for somebody else's order", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await selesai(s, mitra);
    expect(await ajukan(s, pekerjaanId, wib("2026-10-08 10:01"))).toEqual({ ok: false, reason: "jendela_tertutup" });
    const lain = { accountId: s.pemesan.accountId, email: "bukan@contoh.id" };
    expect(await s.setup.layanan.ajukanKeluhanTpu(lain, { pekerjaanId, alasan: "x" })).toEqual({ ok: false, reason: "bukan_pemesan" });
  });

  it("is refused for a job whose proof Admin Platform has not approved", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await kerjaDiterima(s, mitra);
    await kirimBunga(s, mitra, pekerjaanId);
    expect(await ajukan(s, pekerjaanId)).toEqual({ ok: false, reason: "belum_selesai" });
  });

  it("rejected by Admin Platform: the job is Selesai again and its Pencairan falls due once the window is over", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await selesai(s, mitra);
    const diajukan = await ajukan(s, pekerjaanId);
    if (!diajukan.ok) throw new Error(diajukan.reason);

    expect(await s.setup.layanan.putuskanKeluhanTpu(mitra.actor, { keluhanId: diajukan.keluhanId, keputusan: "tolak", catatan: "x" })).toMatchObject({ ok: false, reason: "tidak_berwenang" });
    expect(await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: diajukan.keluhanId, keputusan: "tolak", catatan: "Foto bukti sudah jelas" })).toEqual({ ok: true });
    expect(await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: diajukan.keluhanId, keputusan: "tolak", catatan: "lagi" })).toEqual({ ok: false, reason: "sudah_diputuskan" });
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-10-20 10:00"));
    expect((await pencairanSaya(s, mitra))[0].status).toBe("jatuh_tempo");
  });

  it("upheld with a redo by another Mitra Jasa: the redo is paid at the normal rate and the original Pencairan is cancelled", async () => {
    const s = await siap();
    const a = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const b = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "b@contoh.id" });
    const { pekerjaanId } = await selesai(s, a);
    const diajukan = await ajukan(s, pekerjaanId);
    if (!diajukan.ok) throw new Error(diajukan.reason);

    const putus = await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: diajukan.keluhanId, keputusan: "kerjakan_ulang", catatan: "Ulangi", mitraJasaId: b.id });
    expect(putus).toEqual({ ok: true });
    const [ulang] = (await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin)).filter((satu) => satu.id !== pekerjaanId);
    await s.setup.layanan.jawabPenugasan(b.actor, { pekerjaanId: ulang.id, jawaban: "terima" });
    await kirimBunga(s, b, ulang.id);
    await setujui(s, ulang.id);
    expect(await pencairanSaya(s, a)).toMatchObject([{ status: "dibatalkan" }]);
    expect(await pencairanSaya(s, b)).toMatchObject([{ status: "belum_jatuh_tempo", tarif: TARIF }]);
  });

  it("upheld with a redo, but no Mitra Jasa to do it: the Keluhan stays open", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await selesai(s, mitra);
    const diajukan = await ajukan(s, pekerjaanId);
    if (!diajukan.ok) throw new Error(diajukan.reason);
    expect(await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: diajukan.keluhanId, keputusan: "kerjakan_ulang", catatan: "Ulangi" })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: diajukan.keluhanId, keputusan: "tolak", catatan: "Tidak jadi" })).toEqual({ ok: true });
  });

  it("a redo that cannot be handed over leaves the Keluhan undecided and the job in Keluhan, with no redo job left behind", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await selesai(s, mitra);
    const diajukan = await ajukan(s, pekerjaanId);
    if (!diajukan.ok) throw new Error(diajukan.reason);

    const tidakAda = "00000000-0000-4000-8000-000000000000";
    expect(await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: diajukan.keluhanId, keputusan: "kerjakan_ulang", catatan: "Ulangi", mitraJasaId: tidakAda })).toEqual({
      ok: false,
      reason: "mitra_jasa_tidak_tersedia",
    });
    expect(await s.setup.layanan.keluhanTpuTerbuka(s.admin)).toMatchObject([{ id: diajukan.keluhanId }]);
    expect(await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin)).toEqual([]);
    // Still decidable, the other way.
    expect(await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: diajukan.keluhanId, keputusan: "tolak", catatan: "Tidak jadi" })).toEqual({ ok: true });
  });

  it("has the Mitra Jasa's Pencairan amount adjusted by Admin Platform with a note, audited, after a rejected or redone Keluhan only", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await selesai(s, mitra);
    const diajukan = await ajukan(s, pekerjaanId);
    if (!diajukan.ok) throw new Error(diajukan.reason);
    const { keluhanId } = diajukan;
    const sesuaikan = { keluhanId, amount: TARIF / 2, catatan: "Setengah: bersih sebagian" };

    expect(await s.setup.layanan.sesuaikanPencairanKeluhanTpu(s.admin, sesuaikan)).toEqual({ ok: false, reason: "keluhan_belum_diputuskan" });
    await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId, keputusan: "tolak", catatan: "Foto jelas" });
    expect(await s.setup.layanan.sesuaikanPencairanKeluhanTpu(mitra.actor, sesuaikan)).toMatchObject({ ok: false, reason: "tidak_berwenang" });
    expect(await s.setup.layanan.sesuaikanPencairanKeluhanTpu(s.admin, { ...sesuaikan, catatan: " " })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await s.setup.layanan.sesuaikanPencairanKeluhanTpu(s.admin, { ...sesuaikan, amount: TARIF + 1 })).toEqual({ ok: false, reason: "melebihi_tarif" });
    expect(await s.setup.layanan.sesuaikanPencairanKeluhanTpu(s.admin, sesuaikan)).toEqual({ ok: true, jumlah: TARIF / 2, jumlahAwal: TARIF });

    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-10-20 10:00"));
    expect(await pencairanSaya(s, mitra)).toMatchObject([{ tarif: TARIF / 2, status: "jatuh_tempo" }]);
    expect((await s.setup.audit.allEntries()).filter((satu) => satu.action === "pencairan.override_jumlah")).toHaveLength(1);
  });

  it("refunded by Admin Platform: Refunds is asked for the job's own line, the Mitra Jasa at fault, and the Mitra Jasa's Pencairan stays at the full rate for Admin Platform to lower", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId, tagihanId } = await selesai(s, mitra);
    const diajukan = await ajukan(s, pekerjaanId);
    if (!diajukan.ok) throw new Error(diajukan.reason);
    const keputusan = { keluhanId: diajukan.keluhanId, keputusan: "kembalikan_dana", catatan: "Pekerjaan tidak dilakukan" };

    expect(await s.setup.layanan.putuskanKeluhanTpu(mitra.actor, keputusan)).toMatchObject({ ok: false, reason: "tidak_berwenang" });
    expect(await s.setup.layanan.putuskanKeluhanTpu(s.admin, keputusan)).toEqual({ ok: true });
    expect(await s.setup.layanan.putuskanKeluhanTpu(s.admin, keputusan)).toEqual({ ok: false, reason: "sudah_diputuskan" });

    const tagihan = await s.setup.billing.tagihan(tagihanId);
    const [permintaan, ...lain] = await s.setup.refunds.permintaanTerbuka();
    expect(lain).toEqual([]);
    expect(permintaan).toMatchObject({ tagihanId, pihakBersalah: "mitra_jasa", status: "diajukan" });
    expect(permintaan.lines).toEqual([{ label: tagihan!.lines[0].label, amount: tagihan!.lines[0].amount, lokasiId: null }]);
    // The work was done: the job is Selesai and the Mitra Jasa's full rate falls due once the window is over.
    expect((await s.setup.layanan.buktiTpuSaya(mitra.actor, pekerjaanId))?.status).toBe("selesai");
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-10-20 10:00"));
    expect(await pencairanSaya(s, mitra)).toMatchObject([{ tarif: TARIF, status: "jatuh_tempo" }]);
    expect((await s.setup.audit.allEntries()).filter((satu) => satu.action === "layanan.putuskan_keluhan_tpu")).toHaveLength(1);
  });

  it("refunded: Admin Platform may still lower the Mitra Jasa's Pencairan with a note", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await selesai(s, mitra);
    const diajukan = await ajukan(s, pekerjaanId);
    if (!diajukan.ok) throw new Error(diajukan.reason);
    await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: diajukan.keluhanId, keputusan: "kembalikan_dana", catatan: "Ganti rugi" });
    expect(await s.setup.layanan.sesuaikanPencairanKeluhanTpu(s.admin, { keluhanId: diajukan.keluhanId, amount: TARIF / 2, catatan: "Setengah" })).toMatchObject({ ok: true, jumlah: TARIF / 2 });
  });

  it("is read by the Pemesan on the order: the form is on offer inside the window, and the Keluhan and its answer afterwards", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId, nomor } = await selesai(s, mitra);
    const baca = async () => (await s.setup.layanan.pesananTpuOf(nomor, s.pemesan))?.item[0].keluhan;

    s.setup.clock.set(wib("2026-10-06 09:00"));
    expect(await baca()).toEqual({ bolehDiajukan: true, berakhirAt: wib("2026-10-08 10:00"), diajukan: null });
    const diajukan = await ajukan(s, pekerjaanId);
    if (!diajukan.ok) throw new Error(diajukan.reason);
    expect(await baca()).toEqual({ bolehDiajukan: false, berakhirAt: wib("2026-10-08 10:00"), diajukan: { status: "terbuka", alasan: "Nisan masih kotor", diajukanAt: wib("2026-10-06 09:00") } });
    await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: diajukan.keluhanId, keputusan: "tolak", catatan: "Sudah bersih" });
    expect((await baca())?.diajukan?.status).toBe("ditolak");
  });

  it("is read by Admin Platform with the proof the Pemesan was shown and the Mitra Jasa who could redo it", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const b = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "b@contoh.id" });
    const { pekerjaanId } = await selesai(s, mitra);
    const diajukan = await ajukan(s, pekerjaanId);
    if (!diajukan.ok) throw new Error(diajukan.reason);

    expect(await s.setup.layanan.keluhanTpuUntukPlatform(mitra.actor, diajukan.keluhanId)).toMatchObject({ ok: false });
    const baca = await s.setup.layanan.keluhanTpuUntukPlatform(s.admin, diajukan.keluhanId);
    if (!baca.ok) throw new Error(baca.reason);
    expect(baca.keluhan).toMatchObject({ status: "terbuka", alasan: "Nisan masih kotor", pekerjaanId });
    expect(baca.pekerjaan).toMatchObject({ nomor: expect.stringMatching(/^MKM-/), tpuName: expect.any(String) });
    expect(baca.bukti.map((satu) => satu.kind)).toEqual(["foto_sesudah"]);
    expect(baca.calon.map((satu) => satu.id).sort()).toEqual([mitra.id, b.id].sort());
    expect(await s.setup.layanan.keluhanTpuUntukPlatform(s.admin, "00000000-0000-4000-8000-000000000000")).toEqual({ ok: false, reason: "tidak_ditemukan" });
  });

  it("is a Tier 1 Antrean row due at the first response, 4 daytime hours after it was filed, until Admin Platform decides it", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await selesai(s, mitra);
    const baris = async () => {
      const komposisi = queuesOnTestDatabase(db);
      komposisi.clock.set(s.setup.clock.now());
      return (await komposisi.queues.antrean(s.admin)).filter((satu) => satu.type === "keluhan_layanan_tpu");
    };
    expect(await baris()).toEqual([]);

    // Filed at 17:00: 1 daytime hour that evening and 3 the next morning (06:00-09:00).
    const diajukan = await ajukan(s, pekerjaanId, wib("2026-10-06 17:00"));
    if (!diajukan.ok) throw new Error(diajukan.reason);
    expect(await baris()).toMatchObject([{ tier: 1, subjectKind: "keluhan_layanan_tpu", subjectId: diajukan.keluhanId, deadline: wib("2026-10-07 09:00") }]);

    await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: diajukan.keluhanId, keputusan: "tolak", catatan: "Sudah bersih" });
    expect(await baris()).toEqual([]);
  });
});

describe("the Keluhan window of a TPU job, as the message thread reads it", () => {
  it("opens when the proof is approved, ends 3×24 h later, and is closed once the tick has run past it", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await kerjaDiterima(s, mitra);
    await kirimBunga(s, mitra, pekerjaanId);
    expect(await s.setup.layanan.jendelaKeluhanTpu(pekerjaanId)).toEqual({ dibukaAt: null, berakhirAt: null, ditutup: false });

    s.setup.clock.set(wib("2026-10-05 10:00"));
    await setujui(s, pekerjaanId);
    expect(await s.setup.layanan.jendelaKeluhanTpu(pekerjaanId)).toEqual({ dibukaAt: wib("2026-10-05 10:00"), berakhirAt: wib("2026-10-08 10:00"), ditutup: false });
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-10-08 10:01"));
    expect(await s.setup.layanan.jendelaKeluhanTpu(pekerjaanId)).toMatchObject({ ditutup: true });
    expect(await s.setup.layanan.jendelaKeluhanTpu("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("a Tagihan holding several TPU jobs", () => {
  /** One paid order of two Layanan: Bunga Tabur due 2026-10-05, then `varianAkhir` (Bunga Tabur unless named) due 2026-10-10. Each is handed to its Mitra Jasa. */
  async function duaPekerjaan(s: Siap, mitra: Mitra, akhir_: { varianId: string; mitra: Mitra } = { varianId: s.bunga.id, mitra }) {
    const dipesan = await s.setup.layanan.placePesananLayananTpu(
      s.pemesan,
      orderTpu(s, [
        { layananVariantId: s.bunga.id, targetDate: "2026-10-05" },
        { layananVariantId: akhir_.varianId, targetDate: "2026-10-10" },
      ]),
    );
    if (!dipesan.ok) throw new Error(`order refused: ${dipesan.reason}`);
    await bayar(s.setup, dipesan.tagihan.id);
    const jobs = await s.setup.layanan.pekerjaanTpuUntukStaf(s.admin);
    const awal = jobs.find((job) => job.targetDate === "2026-10-05");
    const akhir = jobs.find((job) => job.targetDate === "2026-10-10");
    if (!awal || !akhir) throw new Error("jobs missing");
    await diterima(s, mitra, awal.id);
    await diterima(s, akhir_.mitra, akhir.id);
    return { awal: awal.id, akhir: akhir.id, tagihanId: dipesan.tagihan.id };
  }

  it("cancelling one Terlambat job of a Tagihan holding two different Layanan refunds that job's line only; the other job carries on and stays paid", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const mitraPembersihan = await mitraJasaUntuk(s.setup, s, s.pembersihan.id, { email: "pembersihan@contoh.id" });
    const { awal, akhir, tagihanId } = await duaPekerjaan(s, mitra, { varianId: s.pembersihan.id, mitra: mitraPembersihan });
    s.setup.clock.set(wib("2026-10-08 09:00"));
    await tandaiTerlambatTpu(s.setup.db, s.setup.clock.now());
    expect(await s.setup.layanan.batalkanPekerjaanTerlambatTpuOlehPemesan(s.pemesan, { pekerjaanId: awal })).toEqual({ ok: true });

    const tagihan = await s.setup.billing.tagihan(tagihanId);
    const baris = tagihan!.lines.filter((satu) => satu.kind === "layanan");
    const bunga = baris.find((satu) => satu.amount === HARGA_BUNGA_TABUR);
    const pembersihan = baris.find((satu) => satu.amount === HARGA_PEMBERSIHAN);
    if (!bunga || !pembersihan) throw new Error("lines missing");
    expect(bunga.label).not.toBe(pembersihan.label);
    const [permintaan, ...lain] = await s.setup.refunds.permintaanTerbuka();
    expect(lain).toEqual([]);
    expect(permintaan.lines).toEqual([expect.objectContaining({ label: bunga.label, amount: HARGA_BUNGA_TABUR })]);
    expect(permintaan.lines.some((satu) => satu.label === pembersihan.label)).toBe(false);
    expect(permintaan.jumlah).toBe(HARGA_BUNGA_TABUR);

    // The other job is untouched: it is done, approved, and its Mitra Jasa is paid in full.
    expect((await s.setup.layanan.buktiTpuSaya(mitraPembersihan.actor, akhir))?.status).toBe("dijadwalkan");
    s.setup.clock.set(wib("2026-10-09 10:00"));
    for (const kind of ["foto_sebelum", "foto_sesudah"] as const) {
      const diambil = await ambil(s, mitraPembersihan, akhir, kind);
      if (!diambil.ok) throw new Error(`shot refused: ${diambil.reason}`);
    }
    const kirim = await s.setup.layanan.kirimBuktiTpu(mitraPembersihan.actor, { pekerjaanId: akhir });
    if (!kirim.ok) throw new Error(`send refused: ${kirim.reason}`);
    await setujui(s, akhir);
    await s.setup.layanan.tutupJendelaKeluhan(wib("2026-11-30 10:00"));
    expect(await pencairanSaya(s, mitraPembersihan)).toMatchObject([{ tarif: TARIF, status: "jatuh_tempo" }]);
  });

  it("a DKI TPU Tagihan carries no Biaya Layanan Platform, so only the job's price comes back", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { awal, tagihanId } = await duaPekerjaan(s, mitra);
    const tagihan = await s.setup.billing.tagihan(tagihanId);
    expect(tagihan!.lines.filter((satu) => satu.kind === "biaya_layanan_platform")).toEqual([]);
    s.setup.clock.set(wib("2026-10-08 09:00"));
    await tandaiTerlambatTpu(s.setup.db, s.setup.clock.now());
    expect(await s.setup.layanan.batalkanPekerjaanTerlambatTpuOlehPemesan(s.pemesan, { pekerjaanId: awal })).toEqual({ ok: true });
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan.jumlah).toBe(HARGA_BUNGA_TABUR);
  });

  it("a TPU Keluhan decided dana kembali refunds the job's price only, never a Biaya Layanan Platform line", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { awal, tagihanId } = await duaPekerjaan(s, mitra);
    s.setup.clock.set(wib("2026-10-05 10:00"));
    await kirimBunga(s, mitra, awal);
    await setujui(s, awal);
    s.setup.clock.set(wib("2026-10-06 09:00"));
    const diajukan = await s.setup.layanan.ajukanKeluhanTpu(s.pemesan, { pekerjaanId: awal, alasan: "Nisan masih kotor" });
    if (!diajukan.ok) throw new Error(diajukan.reason);
    expect(await s.setup.layanan.putuskanKeluhanTpu(s.admin, { keluhanId: diajukan.keluhanId, keputusan: "kembalikan_dana", catatan: "Tidak bersih" })).toEqual({ ok: true });

    const tagihan = await s.setup.billing.tagihan(tagihanId);
    const harga = tagihan!.lines.filter((baris) => baris.kind === "layanan")[0].amount;
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    expect(permintaan.lines.map((baris) => baris.label)).toEqual([tagihan!.lines.find((baris) => baris.kind === "layanan")!.label]);
    expect(permintaan.jumlah).toBe(harga);
    expect(permintaan.biayaLayananPlatformDikembalikan).toBe(false);
  });
});

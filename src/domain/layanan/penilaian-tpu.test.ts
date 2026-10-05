/**
 * A Penilaian of a finished TPU job (spec, Layanan > Pekerjaan Layanan; story 95; ticket 123): the Pemesan rates the job
 * once, 1–5 stars with an optional comment, Admin Platform alone reads it, and the stars reach the Mitra Jasa's 90-day
 * scorecard. Everything goes through the Layanan public functions: the Pemesan's read of the order, Admin Platform's
 * list, the scorecard. The fake Clock sits at Thursday 1 Oktober 2026 09:00 WIB.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { pemesanDenganEmail } from "../../../tests/support/pemesanan";
import { diterima, kirimBuktiPekerjaanTpu, mitraJasaUntuk, pekerjaanTpuDiterima, pekerjaanTpuSelesai, setujui, siapTpuBertarif } from "../../../tests/support/layanan-tpu";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const siap = () => siapTpuBertarif(db);

describe("a Penilaian of a finished TPU job", () => {
  it("is 1–5 stars with a comment, one per job", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await pekerjaanTpuSelesai(s, mitra);

    for (const bintang of [0, 6, 2.5]) {
      expect(await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId, bintang, komentar: null })).toEqual({ ok: false, reason: "input_tidak_valid" });
    }
    expect(await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId, bintang: 4, komentar: "Rapi, tapi agak lambat." })).toEqual({ ok: true });
    expect(await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId, bintang: 1, komentar: null })).toEqual({ ok: false, reason: "sudah_dinilai" });
  });

  it("is refused for a job that has not been finished, even with its proof waiting for approval", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await pekerjaanTpuDiterima(s, mitra);

    expect(await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId, bintang: 5, komentar: null })).toEqual({ ok: false, reason: "belum_selesai" });
    await kirimBuktiPekerjaanTpu(s, mitra, pekerjaanId);
    expect(await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId, bintang: 5, komentar: null })).toEqual({ ok: false, reason: "belum_selesai" });
  });

  it("is the Pemesan's own to give: somebody else's job is not found, and an email that is not the Akun's is refused", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await pekerjaanTpuSelesai(s, mitra);
    const { pemesan: orangLain } = await pemesanDenganEmail(s.setup, "orang.lain@contoh.id");

    expect(await s.setup.layanan.beriPenilaianTpu(orangLain, { pekerjaanId, bintang: 5, komentar: null })).toEqual({ ok: false, reason: "tidak_ditemukan" });
    const bukanEmailAkun = { accountId: s.pemesan.accountId, email: "bukan@contoh.id" };
    expect(await s.setup.layanan.beriPenilaianTpu(bukanEmailAkun, { pekerjaanId, bintang: 5, komentar: null })).toEqual({ ok: false, reason: "bukan_pemesan" });
    expect(await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId: "bukan-uuid", bintang: 5, komentar: null })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId: "8f0b9a52-0000-4000-8000-000000000001", bintang: 5, komentar: null })).toEqual({
      ok: false,
      reason: "tidak_ditemukan",
    });
    // None of those spent the one Penilaian the job takes.
    expect(await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId, bintang: 5, komentar: null })).toEqual({ ok: true });
  });

  it("is offered on the Pemesan's order from the moment Admin Platform approves the proof, until they have given it", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId, nomor } = await pekerjaanTpuDiterima(s, mitra);
    const dibaca = async () => (await s.setup.layanan.pesananTpuOf(nomor, s.pemesan))?.item[0].penilaian;

    expect(await dibaca()).toEqual({ bolehDinilai: false, dinilai: false });
    await kirimBuktiPekerjaanTpu(s, mitra, pekerjaanId);
    expect(await dibaca()).toEqual({ bolehDinilai: false, dinilai: false });
    await setujui(s, pekerjaanId);
    expect(await dibaca()).toEqual({ bolehDinilai: true, dinilai: false });

    await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId, bintang: 4, komentar: null });
    expect(await dibaca()).toEqual({ bolehDinilai: false, dinilai: true });
  });

  it("may still be given for a job under a Keluhan, as at a Lokasi Mitra: the family's view of the work is what the Operator wants to know", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId, nomor } = await pekerjaanTpuSelesai(s, mitra);
    expect(await s.setup.layanan.ajukanKeluhanTpu(s.pemesan, { pekerjaanId, alasan: "Nisan masih kotor" })).toMatchObject({ ok: true });

    expect((await s.setup.layanan.pesananTpuOf(nomor, s.pemesan))?.item[0]).toMatchObject({ status: "keluhan", penilaian: { bolehDinilai: true } });
    expect(await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId, bintang: 2, komentar: null })).toEqual({ ok: true });
  });

  it("is seen by Admin Platform alone: never by a Mitra Jasa, nor read back to the Pemesan", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId, nomor } = await pekerjaanTpuSelesai(s, mitra);
    await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId, bintang: 2, komentar: "Nisan masih berdebu sekali." });

    // Admin Platform reads it, with the TPU job it is about.
    expect(await s.setup.layanan.daftarPenilaian(s.admin)).toMatchObject([
      {
        sumber: "tpu",
        pekerjaanId,
        bintang: 2,
        komentar: "Nisan masih berdebu sekali.",
        pesanan: nomor,
        lokasi: { id: s.tpu.id, name: s.tpu.name },
        petak: "Blok C-7 No. 21",
        label: "Layanan – Bunga Tabur (Reguler)",
      },
    ]);
    // The Mitra Jasa who did the job gets nothing from the list, nor anything of it in the jobs they read.
    expect(await s.setup.layanan.daftarPenilaian(mitra.actor)).toEqual([]);
    expect(JSON.stringify(await s.setup.layanan.pekerjaanTpuSaya(mitra.actor))).not.toMatch(/berdebu|bintang|penilaian/i);
    expect(JSON.stringify(await s.setup.layanan.buktiTpuSaya(mitra.actor, pekerjaanId))).not.toMatch(/berdebu|bintang|penilaian/i);
    // The Pemesan's own page knows that it was given, and does not read the stars back.
    expect(JSON.stringify(await s.setup.layanan.pesananTpuOf(nomor, s.pemesan))).not.toMatch(/berdebu|bintang/i);
  });
});

describe("a Penilaian on the Mitra Jasa's 90-day scorecard", () => {
  it("is averaged with the others the Mitra Jasa's finished TPU jobs were given, and a job nobody rated counts as Selesai only", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const pertama = await pekerjaanTpuSelesai(s, mitra);
    const kedua = await pekerjaanTpuSelesai(s, mitra);
    await pekerjaanTpuSelesai(s, mitra);
    await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId: pertama.pekerjaanId, bintang: 4, komentar: null });
    await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId: kedua.pekerjaanId, bintang: 5, komentar: "Rapi sekali." });

    expect(await s.setup.layanan.skorMitraJasa(s.admin, mitra.id)).toMatchObject({ ok: true, skor: { selesai: 3, rataPenilaian: 4.5 } });
    // The Mitra Jasa reads the same numbers about themself: the mean, and no star or comment of any one job.
    const sendiri = await s.setup.layanan.skorSaya(mitra.actor);
    expect(sendiri).toMatchObject({ ok: true, skor: { selesai: 3, rataPenilaian: 4.5 } });
    expect(JSON.stringify(sendiri)).not.toMatch(/Rapi sekali|bintang|komentar/i);
  });

  it("is left out once its job was finished more than 90 days ago", async () => {
    const s = await siap();
    const mitra = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const { pekerjaanId } = await pekerjaanTpuSelesai(s, mitra);
    await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId, bintang: 5, komentar: null });

    s.setup.clock.set(wib("2026-12-29 09:00"));
    expect(await s.setup.layanan.skorMitraJasa(s.admin, mitra.id)).toMatchObject({ ok: true, skor: { selesai: 1, rataPenilaian: 5 } });
    s.setup.clock.set(wib("2026-12-31 09:00"));
    expect(await s.setup.layanan.skorMitraJasa(s.admin, mitra.id)).toMatchObject({ ok: true, skor: { selesai: 0, rataPenilaian: null } });
  });

  it("goes to the Mitra Jasa who did the job, not to the one it was taken off", async () => {
    const s = await siap();
    const asal = await mitraJasaUntuk(s.setup, s, s.bunga.id);
    const pengganti = await mitraJasaUntuk(s.setup, s, s.bunga.id, { email: "lain@contoh.id", namaLengkap: "Lina Lain" });
    const { pekerjaanId } = await pekerjaanTpuDiterima(s, asal);
    expect(await s.setup.layanan.lepasPenugasan(s.admin, { pekerjaanId, alasan: "Mitra Jasa sakit" })).toEqual({ ok: true });
    await diterima(s, pengganti, pekerjaanId);
    await kirimBuktiPekerjaanTpu(s, pengganti, pekerjaanId);
    await setujui(s, pekerjaanId);
    await s.setup.layanan.beriPenilaianTpu(s.pemesan, { pekerjaanId, bintang: 5, komentar: null });

    expect(await s.setup.layanan.skorMitraJasa(s.admin, asal.id)).toMatchObject({ ok: true, skor: { selesai: 0, rataPenilaian: null } });
    expect(await s.setup.layanan.skorMitraJasa(s.admin, pengganti.id)).toMatchObject({ ok: true, skor: { selesai: 1, rataPenilaian: 5 } });
  });
});

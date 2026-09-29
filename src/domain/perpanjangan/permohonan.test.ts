/**
 * The manual paths into a Perpanjangan (spec, domain module 7; ticket 41): the
 * KTP path, the heir path (Ganti Pemegang Hak + Perpanjangan in one request) and
 * the claim path, each reviewed by the Admin Lokasi of the Lokasi Mitra, then
 * ending in the very order step of the direct path.
 *
 * Fixture: as in ticket 40, a Hak Pakai of 5 years first buried on 2021-10-15, so
 * it ends on 2026-10-15; the fake Clock starts on Thursday 2026-10-01 09:00 WIB,
 * inside the window. The Lokasi is open Monday to Saturday, 07:00-15:00.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { lapsePayFirstTagihanTick } from "@/domain/billing";
import { wib } from "@/lib/time/jakarta";
import { setTagihanStatusForTest } from "../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { cellsOf } from "../../../tests/support/inventory";
import { orderSaatDuka, saatDukaFixture, siapkanOperatorPemesanan, terverifikasiLokasi, type PemesananModul } from "../../../tests/support/pemesanan";
import { akunDenganEmail, hakPakaiSiap, PEMEGANG_HAK, perpanjanganOnTestDatabase, type PerpanjanganSetup } from "../../../tests/support/perpanjangan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const QRIS = { kind: "penyedia_pembayaran", channel: "QRIS" } as const;
const HARI = 24 * 60 * 60 * 1000;

const foto = (isi = 0) => ({ body: new Uint8Array([0xff, 0xd8, 0xff, isi, 1, 2, 3]), contentType: "image/jpeg" });
const berkas = (kunci: string, isi = 0) => ({ kunci, ...foto(isi) });

const BERKAS_KTP = [berkas("ktp")];
const BERKAS_WARIS = [berkas("akta_kematian", 1), berkas("bukti_ahli_waris", 2), berkas("ktp", 3)];
const BERKAS_KLAIM = [berkas("ktp", 4), berkas("bukti_hubungan", 5)];

const TANPA_EMAIL = { name: "Bapak Tanpa Email", phoneNumber: "081234500000" };
const PEMOHON_EMAIL = "pemohon.baru@contoh.id";

/** A Hak Pakai whose holder has no recorded email, and the Akun of the person who asks for its Perpanjangan. */
async function tanpaEmail(setup: PerpanjanganSetup) {
  const fixture = await hakPakaiSiap(setup, { pemegang: TANPA_EMAIL });
  return { fixture, pemohon: await akunDenganEmail(setup, PEMOHON_EMAIL) };
}

async function ajukan(setup: PerpanjanganSetup, hakPakaiId: string, pemohon: { accountId: string; email: string }, jalur: "ktp" | "ahli_waris" | "klaim", extra: Record<string, unknown> = {}) {
  const berkasJalur = jalur === "ktp" ? BERKAS_KTP : jalur === "ahli_waris" ? BERKAS_WARIS : BERKAS_KLAIM;
  return setup.perpanjangan.ajukanPermohonan(pemohon, {
    hakPakaiId,
    jalur,
    nama: "Siti Rahma",
    nomorTelepon: "0812 3456 7890",
    berkas: berkasJalur,
    ...extra,
  });
}

async function diajukan(setup: PerpanjanganSetup, hakPakaiId: string, pemohon: { accountId: string; email: string }, jalur: "ktp" | "ahli_waris" | "klaim") {
  const hasil = await ajukan(setup, hakPakaiId, pemohon, jalur);
  if (!hasil.ok) throw new Error(`ajukanPermohonan refused: ${hasil.reason}`);
  return hasil.permohonanId;
}

async function setujui(setup: PerpanjanganSetup, fixture: Awaited<ReturnType<typeof hakPakaiSiap>>, permohonanId: string, extra: Record<string, unknown> = {}) {
  const hasil = await setup.perpanjangan.setujuiPermohonan(fixture.adminLokasi, { permohonanId, alasan: "Berkas sesuai", ...extra });
  if (!hasil.ok) throw new Error(`setujuiPermohonan refused: ${hasil.reason}`);
}

async function pesan(setup: PerpanjanganSetup, pemohon: { accountId: string; email: string }, permohonanId: string, terms = 1) {
  return setup.perpanjangan.pesanDariPermohonan(pemohon, { permohonanId, terms });
}

async function bayar(setup: PerpanjanganSetup, nomorTagihan: string) {
  const [tagihan] = await setup.billing.cariTagihan(nomorTagihan);
  const dibayar = await setup.billing.recordPayment(tagihan!.id, { method: QRIS, reference: null });
  if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
}

async function endDateOf(setup: PerpanjanganSetup, hakPakaiId: string) {
  return (await setup.inventory.hakPakaiUntukPerpanjangan(hakPakaiId))?.endDate;
}

async function barisPeriksa(setup: PerpanjanganSetup, fixture: Awaited<ReturnType<typeof hakPakaiSiap>>) {
  const antrean = await setup.queues.antreanLokasi(fixture.adminLokasi, fixture.lokasiMitra.id);
  return [...antrean.mendesak, ...antrean.lainnya].filter((row) => row.type === "periksa_dokumen_perpanjangan");
}

describe("the KTP path: a Hak Pakai with no recorded email", () => {
  it("collects a KTP in the private FileStore, is reviewed by the Admin Lokasi and ends in the same order step and payment effect", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const { fixture, pemohon } = await tanpaEmail(setup);
    const dulu = setup.files.stored.size;

    const permohonanId = await diajukan(setup, fixture.hakPakaiId, pemohon, "ktp");

    // The KTP is in the FileStore and nowhere in what the applicant reads back.
    expect(setup.files.stored.size).toBe(dulu + 1);
    const milik = await setup.perpanjangan.permohonanOf(pemohon, permohonanId);
    expect(milik).toMatchObject({ status: "diajukan", jalur: "ktp", berkas: [{ kunci: "ktp", label: "KTP Pemegang Hak" }], dapatDipesan: false });
    expect(JSON.stringify(milik)).not.toContain("perpanjangan-permohonan/");

    await setujui(setup, fixture, permohonanId);

    // The recorded email is the applicant's Email Terverifikasi: the direct path now knows this holder.
    const hak = await setup.inventory.hakPakaiUntukPerpanjangan(fixture.hakPakaiId);
    expect(hak?.pemegangHak).toMatchObject({ name: TANPA_EMAIL.name, phoneNumber: "+6281234567890", email: PEMOHON_EMAIL });
    expect(await setup.perpanjangan.status(fixture.hakPakaiId, pemohon)).toMatchObject({ boleh: true, jalur: "sudah_masuk" });
    expect(await setup.inventory.riwayatPemegangHak(fixture.hakPakaiId)).toHaveLength(1);

    const dipesan = await pesan(setup, pemohon, permohonanId);
    if (!dipesan.ok) throw new Error(`order refused: ${dipesan.reason}`);
    expect(dipesan.perpanjangan.tagihan.total).toBe(3_150_000);
    await bayar(setup, dipesan.perpanjangan.tagihan.nomorTagihan);
    expect(await endDateOf(setup, fixture.hakPakaiId)).toBe("2031-10-15");
    const tercatat = await setup.perpanjangan.perpanjanganOf(dipesan.perpanjangan.id);
    expect(tercatat).toMatchObject({ status: "lunas", endDateLama: "2026-10-15", endDateBaru: "2031-10-15" });
    expect(tercatat?.buktiId).not.toBeNull();
  });

  it("is audited without the phone number or the email in the entry", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const { fixture, pemohon } = await tanpaEmail(setup);
    await setujui(setup, fixture, await diajukan(setup, fixture.hakPakaiId, pemohon, "ktp"));

    const entri = await setup.audit.entriesForLokasi(fixture.lokasiMitra.id);
    const tindakan = entri.map((one) => one.action);
    expect(tindakan).toContain("perpanjangan.setujui");
    expect(tindakan).toContain("hak_pakai.ubah_kontak_pemegang");
    const teks = JSON.stringify(entri.filter((one) => one.action.startsWith("perpanjangan.") || one.action.startsWith("hak_pakai.")));
    expect(teks).not.toContain("81234567890");
    expect(teks).not.toContain(PEMOHON_EMAIL);
    expect(teks).toContain("***7890");
  });

  it("is refused for a Hak Pakai with no holder on record (that is the claim), and a claim for one that has a holder", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const { fixture, pemohon } = await tanpaEmail(setup);
    expect(await ajukan(setup, fixture.hakPakaiId, pemohon, "klaim")).toEqual({ ok: false, reason: "jalur_tidak_sesuai" });

    const menyusul = await hakPakaiSiap(setup, { dataMenyusul: true, cell: 1 });
    expect(await ajukan(setup, menyusul.hakPakaiId, pemohon, "ktp")).toEqual({ ok: false, reason: "jalur_tidak_sesuai" });
    expect(await ajukan(setup, menyusul.hakPakaiId, pemohon, "ahli_waris")).toEqual({ ok: false, reason: "jalur_tidak_sesuai" });
  });
});

describe("the heir path: one combined Ganti Pemegang Hak + Perpanjangan request", () => {
  it("records the heir as the new Pemegang Hak on approval, keeps the earlier holder in the history, and leads to the Tagihan", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const ahliWaris = await akunDenganEmail(setup, "ahli.waris@contoh.id");

    const permohonanId = await diajukan(setup, fixture.hakPakaiId, ahliWaris, "ahli_waris");
    expect(await setup.perpanjangan.permohonanOf(ahliWaris, permohonanId)).toMatchObject({
      berkas: [{ kunci: "akta_kematian" }, { kunci: "bukti_ahli_waris" }, { kunci: "ktp" }],
    });
    // Nothing changes hands until the Admin Lokasi has looked at the papers.
    expect((await setup.inventory.hakPakaiUntukPerpanjangan(fixture.hakPakaiId))?.pemegangHak?.name).toBe(PEMEGANG_HAK.name);

    await setujui(setup, fixture, permohonanId);

    expect((await setup.inventory.hakPakaiUntukPerpanjangan(fixture.hakPakaiId))?.pemegangHak).toMatchObject({ name: "Siti Rahma", email: "ahli.waris@contoh.id" });
    const riwayat = await setup.inventory.riwayatPemegangHak(fixture.hakPakaiId);
    expect(riwayat.map((satu) => satu.name)).toEqual([PEMEGANG_HAK.name, "Siti Rahma"]);
    expect(riwayat[0]!.endAt).toEqual(wib("2026-10-01 09:00"));
    expect(riwayat[1]!.endAt).toBeNull();
    // The earlier holder's email no longer finds the grave; the heir's does.
    expect(await setup.inventory.makamPemegangHak({ email: PEMEGANG_HAK.email })).toEqual([]);
    expect(await setup.inventory.makamPemegangHak({ email: "ahli.waris@contoh.id" })).toHaveLength(1);

    const dipesan = await pesan(setup, ahliWaris, permohonanId);
    expect(dipesan).toMatchObject({ ok: true });
    const entri = await setup.audit.entriesForLokasi(fixture.lokasiMitra.id);
    expect(entri.map((one) => one.action)).toEqual(expect.arrayContaining(["hak_pakai.ganti_pemegang", "perpanjangan.setujui"]));
  });

  it("asks for the death certificate, the heirship proof and the KTP, and takes no other kind of file", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const ahliWaris = await akunDenganEmail(setup, "ahli.waris@contoh.id");

    expect(await ajukan(setup, fixture.hakPakaiId, ahliWaris, "ahli_waris", { berkas: [berkas("ktp"), berkas("bukti_ahli_waris")] })).toEqual({
      ok: false,
      reason: "berkas_kurang",
      kunci: "akta_kematian",
    });
    expect(await ajukan(setup, fixture.hakPakaiId, ahliWaris, "ahli_waris", { berkas: [...BERKAS_WARIS, { kunci: "ktp", body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" }] })).toEqual({
      ok: false,
      reason: "berkas_tidak_didukung",
      kunci: "ktp",
    });
    expect(await ajukan(setup, fixture.hakPakaiId, ahliWaris, "ahli_waris", { berkas: [...BERKAS_WARIS, berkas("kwitansi_lama")] })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await ajukan(setup, fixture.hakPakaiId, ahliWaris, "ahli_waris", { nomorTelepon: "12345" })).toEqual({ ok: false, reason: "nomor_telepon_tidak_valid" });
    expect(await setup.perpanjangan.permohonanSaya(ahliWaris)).toEqual([]);
  });
});

describe("the claim path: a Hak Pakai with no Pemegang Hak on record", () => {
  it("records the claimant as the Pemegang Hak on approval, and completes a Hak Pakai flagged Perlu Verifikasi in the same review", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup, { dataMenyusul: true });
    const keluarga = await akunDenganEmail(setup, "kerabat@contoh.id");

    // A flagged Hak Pakai is exactly what the review completes, so it may be claimed before it is complete.
    expect(await setup.perpanjangan.status(fixture.hakPakaiId)).toEqual({ boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "perlu_verifikasi" } });
    const permohonanId = await diajukan(setup, fixture.hakPakaiId, keluarga, "klaim");
    expect(await setup.perpanjangan.permohonanOf(keluarga, permohonanId)).toMatchObject({ berkas: [{ kunci: "ktp" }, { kunci: "bukti_hubungan" }] });

    // The end date is not on record and the review gave none: nothing is approved and nothing changed.
    expect(await setup.perpanjangan.setujuiPermohonan(fixture.adminLokasi, { permohonanId, alasan: "Berkas sesuai" })).toEqual({ ok: false, reason: "tanggal_berakhir_wajib" });
    expect((await setup.perpanjangan.permohonanOf(keluarga, permohonanId))?.status).toBe("diajukan");

    await setujui(setup, fixture, permohonanId, { endDate: "2026-10-15" });

    const hak = await setup.inventory.hakPakaiUntukPerpanjangan(fixture.hakPakaiId);
    expect(hak).toMatchObject({ perluVerifikasi: false, endDate: "2026-10-15", pemegangHak: { name: "Siti Rahma", email: "kerabat@contoh.id" } });
    const dipesan = await pesan(setup, keluarga, permohonanId);
    expect(dipesan).toMatchObject({ ok: true });
    const entri = await setup.audit.entriesForLokasi(fixture.lokasiMitra.id);
    expect(entri.map((one) => one.action)).toEqual(expect.arrayContaining(["hak_pakai.ganti_pemegang", "hak_pakai.lengkapi", "perpanjangan.setujui"]));
  });

  it("changes nothing when part of the approval is refused (an invalid number corrected by the reviewer)", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup, { dataMenyusul: true });
    const keluarga = await akunDenganEmail(setup, "kerabat@contoh.id");
    const permohonanId = await diajukan(setup, fixture.hakPakaiId, keluarga, "klaim");

    const hasil = await setup.perpanjangan.setujuiPermohonan(fixture.adminLokasi, { permohonanId, alasan: "Berkas sesuai", nomorTelepon: "123", endDate: "2026-10-15" });

    expect(hasil).toEqual({ ok: false, reason: "pemegang_hak_gagal", sebab: "nomor_telepon_tidak_valid" });
    expect(await setup.inventory.hakPakaiUntukPerpanjangan(fixture.hakPakaiId)).toMatchObject({ perluVerifikasi: true, pemegangHak: null });
    expect((await setup.perpanjangan.permohonanOf(keluarga, permohonanId))?.status).toBe("diajukan");
  });
});

describe("Antrean Lokasi row and who may read a request", () => {
  it("shows 'Periksa dokumen Perpanjangan' while Diajukan, due 2 working days on the Lokasi's calendar, and only for that Lokasi", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const { fixture, pemohon } = await tanpaEmail(setup);
    const lain = await terverifikasiLokasi(setup as unknown as PemesananModul, { name: "Makam Sawah Besar", city: "Kabupaten Bekasi" });

    const permohonanId = await diajukan(setup, fixture.hakPakaiId, pemohon, "ktp");

    // Filed Thursday 09:00; Friday and Saturday are the two Hari Kerja, the last one closing at 15:00.
    const [baris] = await barisPeriksa(setup, fixture);
    expect(baris).toMatchObject({
      label: "Periksa dokumen Perpanjangan",
      subjectId: permohonanId,
      deadline: wib("2026-10-03 15:00"),
      pastDeadline: false,
    });
    expect(await barisPeriksa(setup, lain as never)).toEqual([]);
    setup.clock.set(wib("2026-10-03 16:00"));
    expect((await barisPeriksa(setup, fixture))[0]).toMatchObject({ pastDeadline: true });

    const staf = await setup.perpanjangan.permohonanUntukStaf(fixture.adminLokasi, permohonanId);
    expect(staf).toMatchObject({ status: "diajukan", berkas: [{ kunci: "ktp", url: expect.stringContaining("perpanjangan-permohonan/") }], hakPakai: { adaPemegang: true } });
    // Another Lokasi's Admin Lokasi, Admin Platform and the family see nothing of it, and cannot decide it.
    expect(await setup.perpanjangan.permohonanUntukStaf(lain.adminLokasi, permohonanId)).toBeNull();
    expect(await setup.perpanjangan.permohonanUntukStaf(fixture.admin, permohonanId)).toBeNull();
    const putusan = { permohonanId, alasan: "Berkas sesuai" };
    expect(await setup.perpanjangan.setujuiPermohonan(lain.adminLokasi, putusan)).toEqual({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.perpanjangan.tolakPermohonan(fixture.admin, putusan)).toEqual({ ok: false, reason: "tidak_berwenang" });
    const orang = await akunDenganEmail(setup, "orang.lain@contoh.id");
    expect(await setup.perpanjangan.permohonanOf(orang, permohonanId)).toBeNull();
    expect(await setup.perpanjangan.batalkanPermohonan(orang, { permohonanId })).toEqual({ ok: false, reason: "permohonan_tidak_ditemukan" });
    expect((await setup.perpanjangan.permohonanOf(pemohon, permohonanId))?.status).toBe("diajukan");
  });

  it("closes the row when the request is decided", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const { fixture, pemohon } = await tanpaEmail(setup);
    await setujui(setup, fixture, await diajukan(setup, fixture.hakPakaiId, pemohon, "ktp"));
    expect(await barisPeriksa(setup, fixture)).toEqual([]);
  });
});

describe("request statuses: Diajukan, Perlu Perbaikan and back, Disetujui, Ditolak, Dibatalkan", () => {
  it("goes Perlu Perbaikan and back to Diajukan: the row leaves the list, the reason reaches the applicant, and the 2 working days start again", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const { fixture, pemohon } = await tanpaEmail(setup);
    const permohonanId = await diajukan(setup, fixture.hakPakaiId, pemohon, "ktp");

    const kembali = await setup.perpanjangan.mintaPerbaikanPermohonan(fixture.adminLokasi, { permohonanId, alasan: "KTP buram, mohon foto ulang" });
    expect(kembali).toEqual({ ok: true });
    expect(await setup.perpanjangan.permohonanOf(pemohon, permohonanId)).toMatchObject({ status: "perlu_perbaikan", alasan: "KTP buram, mohon foto ulang", dapatDipesan: false });
    expect(await barisPeriksa(setup, fixture)).toEqual([]);
    // It cannot be approved or ordered on while it waits for the applicant.
    expect(await setup.perpanjangan.setujuiPermohonan(fixture.adminLokasi, { permohonanId, alasan: "ok" })).toEqual({ ok: false, reason: "tidak_dapat_diputuskan" });
    expect(await pesan(setup, pemohon, permohonanId)).toEqual({ ok: false, reason: "belum_disetujui" });

    setup.clock.set(wib("2026-10-02 10:00"));
    const diperbaiki = await setup.perpanjangan.perbaikiPermohonan(pemohon, { permohonanId, berkas: [berkas("ktp", 9)] });
    expect(diperbaiki).toEqual({ ok: true });
    expect(await setup.perpanjangan.permohonanOf(pemohon, permohonanId)).toMatchObject({ status: "diajukan" });
    // Filed Friday 10:00: Saturday and Monday are the two Hari Kerja.
    expect((await barisPeriksa(setup, fixture))[0]).toMatchObject({ subjectId: permohonanId, deadline: wib("2026-10-05 15:00") });
    // Only a request sent back can be corrected.
    expect(await setup.perpanjangan.perbaikiPermohonan(pemohon, { permohonanId, berkas: [berkas("ktp", 8)] })).toEqual({ ok: false, reason: "bukan_perlu_perbaikan" });
    await setujui(setup, fixture, permohonanId);
  });

  it("is Dibatalkan by the applicant before a decision, and never after one", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const { fixture, pemohon } = await tanpaEmail(setup);
    const pertama = await diajukan(setup, fixture.hakPakaiId, pemohon, "ktp");

    expect(await setup.perpanjangan.batalkanPermohonan(pemohon, { permohonanId: pertama })).toEqual({ ok: true });
    expect((await setup.perpanjangan.permohonanOf(pemohon, pertama))?.status).toBe("dibatalkan");
    expect(await barisPeriksa(setup, fixture)).toEqual([]);
    expect(await setup.perpanjangan.setujuiPermohonan(fixture.adminLokasi, { permohonanId: pertama, alasan: "ok" })).toEqual({ ok: false, reason: "tidak_dapat_diputuskan" });

    // A request sent back can still be withdrawn: nothing was decided.
    const kedua = await diajukan(setup, fixture.hakPakaiId, pemohon, "ktp");
    await setup.perpanjangan.mintaPerbaikanPermohonan(fixture.adminLokasi, { permohonanId: kedua, alasan: "Foto ulang" });
    expect(await setup.perpanjangan.batalkanPermohonan(pemohon, { permohonanId: kedua })).toEqual({ ok: true });

    const ketiga = await diajukan(setup, fixture.hakPakaiId, pemohon, "ktp");
    await setujui(setup, fixture, ketiga);
    expect(await setup.perpanjangan.batalkanPermohonan(pemohon, { permohonanId: ketiga })).toEqual({ ok: false, reason: "sudah_diputuskan" });
    expect((await setup.perpanjangan.permohonanOf(pemohon, ketiga))?.status).toBe("disetujui");
  });

  it("is Ditolak with a reason the applicant reads, changes nothing about the Hak Pakai, and can be filed again", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    const ahliWaris = await akunDenganEmail(setup, "ahli.waris@contoh.id");
    const permohonanId = await diajukan(setup, fixture.hakPakaiId, ahliWaris, "ahli_waris");

    expect(await setup.perpanjangan.tolakPermohonan(fixture.adminLokasi, { permohonanId, alasan: "" })).toEqual({ ok: false, reason: "input_tidak_valid" });
    expect(await setup.perpanjangan.tolakPermohonan(fixture.adminLokasi, { permohonanId, alasan: "Bukti ahli waris tidak sah" })).toEqual({ ok: true });

    expect(await setup.perpanjangan.permohonanOf(ahliWaris, permohonanId)).toMatchObject({ status: "ditolak", alasan: "Bukti ahli waris tidak sah", dapatDipesan: false });
    expect((await setup.inventory.hakPakaiUntukPerpanjangan(fixture.hakPakaiId))?.pemegangHak?.name).toBe(PEMEGANG_HAK.name);
    expect(await pesan(setup, ahliWaris, permohonanId)).toEqual({ ok: false, reason: "belum_disetujui" });
    const entri = await setup.audit.entriesAbout({ kind: "perpanjangan_permohonan", id: permohonanId });
    expect(entri.map((one) => one.action)).toEqual(["perpanjangan.tolak"]);
    expect(entri[0]).toMatchObject({ reason: "Bukti ahli waris tidak sah" });
    expect(await ajukan(setup, fixture.hakPakaiId, ahliWaris, "ahli_waris")).toMatchObject({ ok: true });
  });

  it("takes one open request per Hak Pakai at a time", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const { fixture, pemohon } = await tanpaEmail(setup);
    await diajukan(setup, fixture.hakPakaiId, pemohon, "ktp");
    const orang = await akunDenganEmail(setup, "orang.lain@contoh.id");

    expect(await ajukan(setup, fixture.hakPakaiId, pemohon, "ktp")).toEqual({ ok: false, reason: "permohonan_terbuka" });
    expect(await ajukan(setup, fixture.hakPakaiId, orang, "ktp")).toEqual({ ok: false, reason: "permohonan_terbuka" });
  });
});

describe("an approval stays valid for 30 days", () => {
  it("lets the applicant order again without uploading when the first Tagihan lapses, and needs a new review after 30 days", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const { fixture, pemohon } = await tanpaEmail(setup);
    const permohonanId = await diajukan(setup, fixture.hakPakaiId, pemohon, "ktp");
    setup.clock.set(wib("2026-10-02 10:00"));
    await setujui(setup, fixture, permohonanId);
    const disetujuiPada = setup.clock.now();
    expect((await setup.perpanjangan.permohonanOf(pemohon, permohonanId))?.berlakuSampai).toEqual(new Date(disetujuiPada.getTime() + 30 * HARI));

    const pertama = await pesan(setup, pemohon, permohonanId);
    if (!pertama.ok) throw new Error(`order refused: ${pertama.reason}`);
    // While the first Tagihan waits for its money, the same approval cannot order a second one.
    expect(await pesan(setup, pemohon, permohonanId)).toMatchObject({ ok: false, reason: "tagihan_terbuka" });

    setup.clock.set(pertama.perpanjangan.tagihan.dueAt);
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());
    expect((await setup.perpanjangan.perpanjanganOf(pertama.perpanjangan.id))?.status).toBe("dibatalkan");
    expect(await setup.perpanjangan.permohonanOf(pemohon, permohonanId)).toMatchObject({ status: "disetujui", dapatDipesan: true });

    // Day 29 after the approval: a new Tagihan without any new upload.
    setup.clock.set(new Date(disetujuiPada.getTime() + 29 * HARI));
    const kedua = await pesan(setup, pemohon, permohonanId);
    expect(kedua).toMatchObject({ ok: true });
    if (!kedua.ok) return;
    setup.clock.set(kedua.perpanjangan.tagihan.dueAt);
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());

    // Past day 30 the approval is spent: a new review is needed.
    setup.clock.set(new Date(disetujuiPada.getTime() + 30 * HARI + 60_000));
    expect(await setup.perpanjangan.permohonanOf(pemohon, permohonanId)).toMatchObject({ status: "disetujui", dapatDipesan: false });
    expect(await pesan(setup, pemohon, permohonanId)).toEqual({ ok: false, reason: "persetujuan_kedaluwarsa" });
    expect(await ajukan(setup, fixture.hakPakaiId, pemohon, "ktp")).toMatchObject({ ok: true });
  });

  it("is spent once its Perpanjangan is paid, and cannot be used by another Akun", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const { fixture, pemohon } = await tanpaEmail(setup);
    const permohonanId = await diajukan(setup, fixture.hakPakaiId, pemohon, "ktp");
    await setujui(setup, fixture, permohonanId);
    const orang = await akunDenganEmail(setup, "orang.lain@contoh.id");

    expect(await pesan(setup, orang, permohonanId)).toEqual({ ok: false, reason: "permohonan_tidak_ditemukan" });
    const dipesan = await pesan(setup, pemohon, permohonanId);
    if (!dipesan.ok) throw new Error(`order refused: ${dipesan.reason}`);
    await bayar(setup, dipesan.perpanjangan.tagihan.nomorTagihan);

    expect(await setup.perpanjangan.permohonanOf(pemohon, permohonanId)).toMatchObject({ dapatDipesan: false });
    expect(await pesan(setup, pemohon, permohonanId)).toEqual({ ok: false, reason: "sudah_dipakai" });
  });

  it("holds the order to the same terms as the direct path: K terms at most, and the price of the day", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const { fixture, pemohon } = await tanpaEmail(setup);
    const permohonanId = await diajukan(setup, fixture.hakPakaiId, pemohon, "ktp");
    await setujui(setup, fixture, permohonanId);

    expect(await pesan(setup, pemohon, permohonanId, 2)).toEqual({ ok: false, reason: "terms_melebihi_batas", maxTerms: 1 });
    expect(await setup.perpanjangan.tawaran(fixture.hakPakaiId)).toMatchObject({ ok: true, opsi: [{ terms: 1, total: 3_150_000 }] });
  });
});

describe("the same blocks as the direct path apply to a manual request", () => {
  it("says 'bisa diperpanjang mulai <tanggal>' before the window, and 'hubungi Admin Lokasi' for a Berakhir Hak Pakai", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const { fixture, pemohon } = await tanpaEmail(setup);

    setup.clock.set(wib("2026-07-14 12:00"));
    expect(await ajukan(setup, fixture.hakPakaiId, pemohon, "ktp")).toEqual({ ok: false, reason: "tidak_boleh", catatan: { kind: "terlalu_awal", mulaiPada: "2026-07-15" } });

    setup.clock.set(wib("2026-10-01 09:00"));
    await setup.inventory.akhiriHakPakai({ hakPakaiId: fixture.hakPakaiId, alasan: "Dikembalikan" });
    expect(await ajukan(setup, fixture.hakPakaiId, pemohon, "ktp")).toEqual({
      ok: false,
      reason: "tidak_boleh",
      catatan: { kind: "hubungi_admin_lokasi", sebab: "berakhir" },
    });
  });

  it("blocks a request, and an order on an approval, while a Saat Duka Tagihan of the Hak Pakai is overdue", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const modul = setup as unknown as PemesananModul;
    const fixture = await saatDukaFixture(modul);
    await siapkanOperatorPemesanan(modul);
    const placed = await setup.pemesanan.placeSaatDuka({ ...orderSaatDuka(fixture), rencanaPemakamanAt: "2026-10-02T10:00" });
    if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
    const [blok] = await setup.inventory.asStaff(fixture.adminLokasi).bloks(fixture.lokasiMitra.id);
    const petak = (await cellsOf(setup, fixture.adminLokasi, fixture.lokasiMitra.id, blok!.id)).filter((cell) => cell.kind === "petak")[0]!;
    const konfirmasi = await setup.pemesanan.konfirmasiSaatDuka(fixture.adminLokasi, { nomor: placed.pemesanan.nomor, petakId: petak.id, pemakamanAt: "2026-10-02T10:00" });
    if (!konfirmasi.ok) throw new Error(`confirmation refused: ${konfirmasi.reason}`);
    const order = await setup.pemesanan.orderOf(placed.pemesanan.nomor, fixture.pemesan);
    const hakPakaiId = (await setup.pemesanan.hakPakaiIdForTagihan(order!.tagihanId!))!;
    setup.clock.set(wib("2026-10-06 08:00"));
    const dicatat = await setup.pemesanan.catatPemakaman(fixture.adminLokasi, { nomor: placed.pemesanan.nomor, tanggal: "2026-10-06" });
    if (!dicatat.ok) throw new Error(`burial refused: ${dicatat.reason}`);

    // Five years on, the Hak Pakai is inside its window with its Saat Duka Tagihan never paid.
    setup.clock.set(wib("2031-09-20 09:00"));
    await setTagihanStatusForTest(db, order!.tagihanId!, "lewat_jatuh_tempo");
    const pemohon = await akunDenganEmail(setup, PEMOHON_EMAIL);
    expect(await ajukan(setup, hakPakaiId, pemohon, "ahli_waris")).toMatchObject({ ok: false, reason: "tidak_boleh", catatan: { kind: "lunasi_tagihan" } });

    // Paid, it opens; approved, then overdue again before the order: the order is refused too.
    await setTagihanStatusForTest(db, order!.tagihanId!, "lunas");
    const permohonanId = await diajukan(setup, hakPakaiId, pemohon, "ahli_waris");
    await setujui(setup, { ...fixture } as never, permohonanId);
    await setTagihanStatusForTest(db, order!.tagihanId!, "lewat_jatuh_tempo");
    expect(await pesan(setup, pemohon, permohonanId)).toMatchObject({ ok: false, reason: "tidak_boleh", catatan: { kind: "lunasi_tagihan" } });
  });
});

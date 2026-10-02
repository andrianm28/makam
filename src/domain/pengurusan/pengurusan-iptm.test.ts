/**
 * Pengurusan IPTM, the filing-only order (spec, Pengurusan: "Sudah dimakamkan? Kami urus IPTM-nya"; stories 78 and 82;
 * ticket 47), read only through the Pengurusan module's public functions and what its neighbours show from outside:
 * the Tagihan Billing holds, the refund requests Refunds holds and the Tugas Lapangan Field Work holds.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { lapsePayFirstTagihanTick } from "@/domain/billing";
import { addWorkingDays } from "@/domain/lokasi";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { pemesanDenganEmail, pengajuanOnTestDatabase, tpu, type PengajuanSetup } from "../../../tests/support/pengurusan";
import { signedInPetugasLapangan } from "../../../tests/support/publish";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const berkas = () => ({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" as const });
const QRIS = { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null } as const;

/** A family that buried at a DKI TPU on its own, the order placed on Friday 2 October 2026 at 10:00 WIB. */
async function pesananBerkas(setup: PengajuanSetup) {
  const admin = await siapkanOperatorPemesanan(setup as never);
  const petugas = await signedInPetugasLapangan(setup, admin, "petugas.pengantar@contoh.id");
  setup.clock.set(wib("2026-10-02 10:00"));
  const masuk = (key: Parameters<typeof setup.tariffs.setGlobalTariff>[1]["key"], amount: number) =>
    setup.tariffs.setGlobalTariff(admin, { key, amount, effectiveOn: "2026-10-01", reason: null });
  await masuk("biaya_pengurusan_pemakaman", 1_750_000);
  await masuk("biaya_pengurusan_berkas", 750_000);
  await masuk("retribusi_pemda_iptm", 250_000);
  await masuk("biaya_layanan_platform", 150_001);
  const tpuDki = await tpu(setup);
  const pemesan = (await pemesanDenganEmail(setup, "pemesan@contoh.id")).pemesan;
  const placed = await setup.pengurusan.placePengurusanIptm({
    pemesan,
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    tpuId: tpuDki.id,
    almarhumName: "Siti Aminah",
    tanggalWafat: "2026-09-25",
    jenis: "baru",
    kelayakan: { ktpDki: true, wafatDiJakarta: true },
    pemegangHak: { mode: "pemesan" },
  });
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  return { admin, petugas, pemesan, nomor: placed.pengurusan.nomor, dokumenDueAt: placed.pengurusan.dokumenDueAt };
}

type Dasar = Awaited<ReturnType<typeof pesananBerkas>>;

async function unggah(setup: PengajuanSetup, dasar: Dasar, nama?: string) {
  const order = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
  for (const dokumen of order!.dokumen.pengajuan) {
    if (nama && dokumen.nama !== nama) continue;
    const hasil = await setup.pengurusan.unggahDokumenPengajuan(dasar.pemesan, { nomor: dasar.nomor, nama: dokumen.nama, berkas: berkas() });
    if (!hasil.ok) throw new Error(`upload refused: ${hasil.reason}`);
  }
}

/** Every document is in and Admin Platform has checked them: the pay-first Tagihan is issued. */
async function sampaiMenungguPembayaran(setup: PengajuanSetup, dasar: Dasar) {
  setup.clock.set(wib("2026-10-02 14:00"));
  await unggah(setup, dasar);
  const lengkap = await setup.pengurusan.periksaDokumen(dasar.admin, { nomor: dasar.nomor });
  if (!lengkap.ok || lengkap.status !== "menunggu_pembayaran") throw new Error(`check refused: ${JSON.stringify(lengkap)}`);
  return lengkap.tagihan;
}

async function sampaiLunas(setup: PengajuanSetup, dasar: Dasar) {
  const tagihan = await sampaiMenungguPembayaran(setup, dasar);
  const dibayar = await setup.billing.recordPayment(tagihan.id, QRIS);
  if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
  await setup.pengurusan.pembayaranBerkasTick();
  return tagihan;
}

async function sampaiDiajukan(setup: PengajuanSetup, dasar: Dasar) {
  const tagihan = await sampaiLunas(setup, dasar);
  const diajukan = await setup.pengurusan.ajukanIptm(dasar.admin, { nomor: dasar.nomor });
  if (!diajukan.ok) throw new Error(`IPTM Diajukan refused: ${diajukan.reason}`);
  return tagihan;
}

describe("Pengurusan IPTM placed for a family that buried on its own", () => {
  it("starts at Dimakamkan with the documents due 7 days after the order and no Tagihan", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    expect(dasar.dokumenDueAt).toEqual(wib("2026-10-09 10:00"));
    const order = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
    expect(order).toMatchObject({ kind: "pengurusan_iptm", status: "dimakamkan", tagihan: null, konfirmasiDueAt: null });
    expect(order!.dokumen.pengajuan.length).toBeGreaterThan(0);
    const tindakan = await setup.pengurusan.perluTindakanBerkas(dasar.pemesan);
    expect(tindakan).toEqual([expect.objectContaining({ nomor: dasar.nomor, dueAt: wib("2026-10-09 10:00") })]);
  });

  it("takes no Tagihan and no Dokumen Lengkap while a document is missing", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    const order = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
    await unggah(setup, dasar, order!.dokumen.pengajuan[0]!.nama);
    const hasil = await setup.pengurusan.periksaDokumen(dasar.admin, { nomor: dasar.nomor });
    expect(hasil).toMatchObject({ ok: false, reason: "dokumen_belum_lengkap" });
    expect(await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "dimakamkan", tagihan: null });
  });

  it("lists the document check on the Admin Platform calendar, 1 working day after the last document is in", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    expect(await setup.pengurusan.periksaBerkasTerbuka()).toEqual([]);
    setup.clock.set(wib("2026-10-02 14:00"));
    await unggah(setup, dasar);
    const tenggat = addWorkingDays(await setup.lokasi.adminPlatformCalendar(), wib("2026-10-02 14:00"), 1);
    if (!tenggat.ok) throw new Error("calendar unavailable");
    expect(await setup.pengurusan.periksaBerkasTerbuka()).toEqual([
      expect.objectContaining({ nomor: dasar.nomor, dueAt: tenggat.at }),
    ]);
    await setup.pengurusan.periksaDokumen(dasar.admin, { nomor: dasar.nomor });
    expect(await setup.pengurusan.periksaBerkasTerbuka()).toEqual([]);
  });

  it("issues a pay-first Tagihan for the filing-only Biaya Pengurusan, due 3×24 h after issue, once the check passes", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    const tagihan = await sampaiMenungguPembayaran(setup, dasar);
    expect(tagihan.dueAt).toEqual(wib("2026-10-05 14:00"));
    const dibaca = await setup.billing.tagihan(tagihan.id);
    expect(dibaca).toMatchObject({ kind: "pay_first", status: "belum_dibayar", total: 1_000_000 });
    expect(dibaca!.lines.map((baris) => baris.kind)).toEqual(["biaya_pengurusan", "retribusi_pemda"]);
    expect(await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan)).toMatchObject({
      status: "menunggu_pembayaran",
      tagihan: { id: tagihan.id, total: 1_000_000 },
    });
  });

  it("lapses to Dibatalkan when the Tagihan is still unpaid 3×24 h after issue", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    await sampaiMenungguPembayaran(setup, dasar);
    setup.clock.set(wib("2026-10-05 13:59"));
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());
    await setup.pengurusan.pembayaranBerkasTick();
    expect(await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "menunggu_pembayaran" });

    setup.clock.set(wib("2026-10-05 14:01"));
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());
    await setup.pengurusan.pembayaranBerkasTick();
    await setup.pengurusan.pembayaranBerkasTick();
    expect(await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "dibatalkan" });
  });

  it("creates the Ambil surat pengantar Tugas only once the Tagihan is Lunas", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    const tagihan = await sampaiMenungguPembayaran(setup, dasar);
    const minta = () => setup.pengurusan.buatSuratPengantar(dasar.admin, { nomor: dasar.nomor, petugasAccountId: dasar.petugas.accountId });
    expect(await minta()).toEqual({ ok: false, reason: "belum_lunas" });
    expect(await setup.fieldwork.ambilSuratPengantarTerbuka()).toEqual([]);

    const dibayar = await setup.billing.recordPayment(tagihan.id, QRIS);
    if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
    const dibuat = await minta();
    expect(dibuat).toMatchObject({ ok: true });
    expect(await setup.fieldwork.ambilSuratPengantarTerbuka()).toEqual([
      expect.objectContaining({ assigneeAccountId: dasar.petugas.accountId, subject: expect.stringContaining(dasar.nomor) }),
    ]);
    expect(await minta()).toEqual({ ok: false, reason: "sudah_dibuat" });
  });

  it("lists the filing on the Admin Platform calendar, 3 working days after Lunas, and closes it at IPTM Diajukan", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    const tagihan = await sampaiMenungguPembayaran(setup, dasar);
    expect(await setup.pengurusan.pengajuanBerkasTerbuka()).toEqual([]);
    setup.clock.set(wib("2026-10-02 16:00"));
    await setup.billing.recordPayment(tagihan.id, QRIS);
    await setup.pengurusan.pembayaranBerkasTick();
    expect(await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "diproses" });
    const tenggat = addWorkingDays(await setup.lokasi.adminPlatformCalendar(), wib("2026-10-02 16:00"), 3);
    if (!tenggat.ok) throw new Error("calendar unavailable");
    expect(await setup.pengurusan.pengajuanBerkasTerbuka()).toEqual([expect.objectContaining({ nomor: dasar.nomor, dueAt: tenggat.at })]);

    const diajukan = await setup.pengurusan.ajukanIptm(dasar.admin, { nomor: dasar.nomor });
    expect(diajukan).toMatchObject({ ok: true, status: "iptm_diajukan" });
    expect(await setup.pengurusan.pengajuanBerkasTerbuka()).toEqual([]);
  });

  it("refuses to file before the Tagihan is Lunas", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    await sampaiMenungguPembayaran(setup, dasar);
    expect(await setup.pengurusan.ajukanIptm(dasar.admin, { nomor: dasar.nomor })).toEqual({ ok: false, reason: "status_tidak_sesuai" });
  });
});

describe("a PTSP rejection of a Pengurusan IPTM", () => {
  it("sends a fixable rejection back to Perlu Perbaikan, shows it in Perlu tindakan and refiles it with no new Tagihan", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    const tagihan = await sampaiDiajukan(setup, dasar);
    const order = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
    const buruk = order!.dokumen.pengajuan[0]!.nama;

    const ditolak = await setup.pengurusan.tolakPtsp(dasar.admin, { nomor: dasar.nomor, putusan: "perbaikan", alasan: "Foto KTP buram", dokumen: [buruk] });
    expect(ditolak).toMatchObject({ ok: true, status: "perlu_perbaikan" });
    expect(await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "perlu_perbaikan", alasan: "Foto KTP buram" });
    const tindakan = await setup.pengurusan.perluTindakanBerkas(dasar.pemesan);
    expect(tindakan).toEqual([expect.objectContaining({ nomor: dasar.nomor, kurang: [buruk], alasanPerbaikan: "Foto KTP buram" })]);
    expect(await setup.pengurusan.ajukanIptm(dasar.admin, { nomor: dasar.nomor })).toMatchObject({ ok: false, reason: "dokumen_belum_lengkap" });

    await unggah(setup, dasar, buruk);
    expect(await setup.pengurusan.perluTindakanBerkas(dasar.pemesan)).toEqual([]);
    expect(await setup.pengurusan.ajukanIptm(dasar.admin, { nomor: dasar.nomor })).toMatchObject({ ok: true, status: "iptm_diajukan" });

    const sesudah = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
    expect(sesudah!.tagihan!.id).toBe(tagihan.id);
    expect((await setup.billing.tagihan(tagihan.id))!.status).toBe("lunas");
    expect(await setup.refunds.permintaanTerbuka()).toEqual([]);
  });

  it("makes a final rejection Ditolak with the reason shown and refunds the whole Tagihan, Biaya Pengurusan included", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    await sampaiDiajukan(setup, dasar);

    const ditolak = await setup.pengurusan.tolakPtsp(dasar.admin, { nomor: dasar.nomor, putusan: "final", alasan: "Makam bukan di TPU yang menerima IPTM" });
    expect(ditolak).toMatchObject({ ok: true, status: "ditolak", pengembalian: 1_000_000 });
    expect(await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan)).toMatchObject({
      status: "ditolak",
      alasan: "Makam bukan di TPU yang menerima IPTM",
    });
    expect(await setup.refunds.permintaanTerbuka()).toEqual([
      expect.objectContaining({ nomorPemesanan: dasar.nomor, jumlah: 1_000_000, status: "diajukan" }),
    ]);
  });

  it("is Admin Platform's decision and only on a filed order", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    const masukan = { nomor: dasar.nomor, putusan: "final" as const, alasan: "Ditolak" };
    expect(await setup.pengurusan.tolakPtsp(dasar.petugas, masukan)).toMatchObject({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.pengurusan.tolakPtsp(dasar.admin, masukan)).toEqual({ ok: false, reason: "status_tidak_sesuai" });
    await sampaiDiajukan(setup, dasar);
    expect(await setup.pengurusan.tolakPtsp(dasar.admin, { ...masukan, alasan: "" })).toEqual({ ok: false, reason: "input_tidak_valid" });
  });
});

/**
 * Perpanjangan TPU, the IPTM renewal of a Makam TPU (spec, Pengurusan > Perpanjangan TPU; stories 79-83; ticket 48),
 * read only through the Pengurusan module's public functions and what its neighbours show from outside.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { lapsePayFirstTagihanTick } from "@/domain/billing";
import { addWorkingDays } from "@/domain/lokasi";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { pengajuanOnTestDatabase, type PengajuanSetup } from "../../../tests/support/pengurusan";
import { makamTpu } from "./schema";
import { eq } from "drizzle-orm";
import { pengingatIptmTick, type PengingatIptmDeps } from "./pengingat-iptm";
import { makamTpuDenganIptm } from "../../../tests/support/makam-tpu";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** A Makam TPU whose IPTM expires on `berlakuSampai`. */
async function makamBerakhir(setup: PengajuanSetup, berlakuSampai: string) {
  return makamTpuDenganIptm(setup, berlakuSampai);
}

const berkas = () => ({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" as const });
const QRIS = { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null } as const;
type Dasar = Awaited<ReturnType<typeof makamBerakhir>>;

/** An order placed on 20 December 2026, inside the 3 months before the IPTM's expiry on 15 February 2027. */
async function pesananPada(setup: PengajuanSetup, dasar: Dasar, berlakuSampai: string) {
  const hasil = await ajukan(setup, dasar, berlakuSampai);
  if (!hasil.ok) throw new Error(`order refused: ${hasil.reason}`);
  return hasil.pengurusan.nomor;
}
const pesanan = (setup: PengajuanSetup, dasar: Dasar) => pesananPada(setup, dasar, "2027-02-15");

async function unggah(setup: PengajuanSetup, dasar: Dasar, nomor: string, nama?: string) {
  const order = await setup.pengurusan.orderOf(nomor, dasar.pemesan);
  for (const dokumen of order!.dokumen.pengajuan) {
    if (nama && dokumen.nama !== nama) continue;
    const hasil = await setup.pengurusan.unggahDokumenPengajuan(dasar.pemesan, { nomor, nama: dokumen.nama, berkas: berkas() });
    if (!hasil.ok) throw new Error(`upload refused: ${hasil.reason}`);
  }
}

const ajukan = (setup: PengajuanSetup, dasar: Awaited<ReturnType<typeof makamBerakhir>>, berlakuSampai: string) =>
  setup.pengurusan.placePerpanjanganTpu({
    pemesan: dasar.pemesan,
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    makamTpuId: dasar.makamTpuId,
    berlakuSampai,
  });

describe("requesting a Perpanjangan TPU", () => {
  it("is refused more than 3 months before the IPTM expires and allowed from exactly 3 months before", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");

    setup.clock.set(wib("2026-11-14 10:00"));
    expect(await ajukan(setup, dasar, "2027-02-15")).toEqual({ ok: false, reason: "terlalu_awal" });

    setup.clock.set(wib("2026-11-15 10:00"));
    const hasil = await ajukan(setup, dasar, "2027-02-15");
    expect(hasil).toMatchObject({ ok: true, pengurusan: { status: "diajukan", lewatMasaTenggang: false } });
  });
});

describe("a second Perpanjangan TPU for the same Makam TPU", () => {
  it("is refused while one is open, so the Pemegang Hak is not charged twice", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2026-12-20 10:00"));
    const nomor = await pesanan(setup, dasar);
    expect(await ajukan(setup, dasar, "2027-02-15")).toEqual({ ok: false, reason: "sudah_dipesan" });

  });

  it("is allowed again once the earlier one was closed Ditolak", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2027-05-20 10:00"));
    const nomor = await pesananPada(setup, dasar, "2027-02-15");
    expect(await ajukan(setup, dasar, "2027-02-15")).toEqual({ ok: false, reason: "sudah_dipesan" });
    await setup.pengurusan.putuskanCekTpu(dasar.admin, { nomor, putusan: "tolak", alasan: "TPU tidak memperpanjang" });
    expect(await ajukan(setup, dasar, "2027-02-15")).toMatchObject({ ok: true });
  });

  it("lets only one of two simultaneous orders through", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2026-12-20 10:00"));
    const hasil = await Promise.all([ajukan(setup, dasar, "2027-02-15"), ajukan(setup, dasar, "2027-02-15")]);
    expect(hasil.filter((h) => h.ok)).toHaveLength(1);
    expect(hasil.filter((h) => !h.ok)).toEqual([{ ok: false, reason: "sudah_dipesan" }]);
  });
});

describe("the document check and the pay-first Tagihan", () => {
  it("issues no Tagihan before the check and, once the documents pass, a pay-first Tagihan for the filing-only Biaya Pengurusan due 3×24 h later", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2026-12-20 10:00"));
    const nomor = await pesanan(setup, dasar);
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ kind: "perpanjangan_tpu", status: "diajukan", tagihan: null });

    const order = await setup.pengurusan.orderOf(nomor, dasar.pemesan);
    await unggah(setup, dasar, nomor, order!.dokumen.pengajuan[0]!.nama);
    expect(await setup.pengurusan.periksaDokumen(dasar.admin, { nomor })).toMatchObject({ ok: false, reason: "dokumen_belum_lengkap" });

    setup.clock.set(wib("2026-12-20 14:00"));
    await unggah(setup, dasar, nomor);
    const hasil = await setup.pengurusan.periksaDokumen(dasar.admin, { nomor });
    if (!hasil.ok || hasil.status !== "menunggu_pembayaran") throw new Error(`check refused: ${JSON.stringify(hasil)}`);
    expect(hasil.tagihan.dueAt).toEqual(wib("2026-12-23 14:00"));
    const tagihan = await setup.billing.tagihan(hasil.tagihan.id);
    expect(tagihan!.total).toBe(1_000_000);
    expect(tagihan!.lines.map((baris) => baris.kind)).not.toContain("biaya_layanan_platform");
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ status: "menunggu_pembayaran" });
  });
});

describe("Perlu Perbaikan before payment", () => {
  it("sends a document needing a fix back to the Pemesan with no Tagihan, and the check runs again once it is uploaded", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2026-12-20 10:00"));
    const nomor = await pesanan(setup, dasar);
    await unggah(setup, dasar, nomor);
    const buruk = (await setup.pengurusan.orderOf(nomor, dasar.pemesan))!.dokumen.pengajuan[2]!.nama;

    const diminta = await setup.pengurusan.mintaPerbaikan(dasar.admin, { nomor, alasan: "Foto KTP buram", dokumen: [buruk] });
    expect(diminta).toEqual({ ok: true, status: "perlu_perbaikan" });
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ status: "perlu_perbaikan", tagihan: null, alasan: "Foto KTP buram" });
    expect(await setup.pengurusan.perluTindakanBerkas(dasar.pemesan)).toEqual([expect.objectContaining({ nomor, kurang: [buruk], alasanPerbaikan: "Foto KTP buram" })]);
    expect(await setup.pengurusan.periksaDokumen(dasar.admin, { nomor })).toMatchObject({ ok: false, reason: "dokumen_belum_lengkap" });

    await unggah(setup, dasar, nomor, buruk);
    expect(await setup.pengurusan.perluTindakanBerkas(dasar.pemesan)).toEqual([]);
    expect(await setup.pengurusan.periksaBerkasTerbuka()).toEqual([expect.objectContaining({ nomor })]);
    expect(await setup.pengurusan.periksaDokumen(dasar.admin, { nomor })).toMatchObject({ ok: true, status: "menunggu_pembayaran" });
  });
});

/** Every document in, checked: the Tagihan is out, issued 20 December 2026 at 14:00. */
async function sampaiMenungguPembayaran(setup: PengajuanSetup, dasar: Dasar) {
  setup.clock.set(wib("2026-12-20 10:00"));
  const nomor = await pesanan(setup, dasar);
  setup.clock.set(wib("2026-12-20 14:00"));
  await unggah(setup, dasar, nomor);
  const hasil = await setup.pengurusan.periksaDokumen(dasar.admin, { nomor });
  if (!hasil.ok || hasil.status !== "menunggu_pembayaran") throw new Error(`check refused: ${JSON.stringify(hasil)}`);
  return { nomor, tagihan: hasil.tagihan };
}

describe("paying the Tagihan", () => {
  it("lapses the order to Dibatalkan when the Tagihan is still unpaid 3×24 h after issue", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    const { nomor } = await sampaiMenungguPembayaran(setup, dasar);
    setup.clock.set(wib("2026-12-23 13:59"));
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());
    await setup.pengurusan.pembayaranBerkasTick();
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ status: "menunggu_pembayaran" });

    setup.clock.set(wib("2026-12-23 14:01"));
    await lapsePayFirstTagihanTick({ db }, setup.clock.now());
    await setup.pengurusan.pembayaranBerkasTick();
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ status: "dibatalkan" });
  });

  it("makes a paid order Diproses and lists its filing on the Admin Platform calendar, 3 working days after Lunas", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    const { nomor, tagihan } = await sampaiMenungguPembayaran(setup, dasar);
    const suratPengantarSebelumnya = await setup.fieldwork.ambilSuratPengantarTerbuka();
    setup.clock.set(wib("2026-12-21 09:00"));
    expect((await setup.billing.recordPayment(tagihan.id, QRIS)).ok).toBe(true);
    await setup.pengurusan.pembayaranBerkasTick();
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ status: "diproses" });
    const tenggat = addWorkingDays(await setup.lokasi.adminPlatformCalendar(), wib("2026-12-21 09:00"), 3);
    if (!tenggat.ok) throw new Error("calendar unavailable");
    expect(await setup.pengurusan.pengajuanBerkasTerbuka()).toEqual([expect.objectContaining({ nomor, dueAt: tenggat.at })]);
    // A renewal is filed from its own documents: paying makes no Ambil surat pengantar Tugas (that is the filing-only order's).
    expect(await setup.fieldwork.ambilSuratPengantarTerbuka()).toEqual(suratPengantarSebelumnya);
    expect(await setup.pengurusan.ajukanIptm(dasar.admin, { nomor })).toMatchObject({ ok: true, status: "iptm_diajukan" });
  });
});

describe("a request past the masa tenggang", () => {
  /** The IPTM expired on 15 February 2027, its masa tenggang (3 months) ended on 15 May 2027; the request comes on Thursday 20 May 2027. */
  async function lewatTenggang(setup: PengajuanSetup, dasar: Dasar) {
    setup.clock.set(wib("2027-05-20 10:00"));
    const hasil = await ajukan(setup, dasar, "2027-02-15");
    if (!hasil.ok) throw new Error(`order refused: ${hasil.reason}`);
    expect(hasil.pengurusan.lewatMasaTenggang).toBe(true);
    await unggah(setup, dasar, hasil.pengurusan.nomor);
    return hasil.pengurusan.nomor;
  }

  it("issues no Tagihan until the TPU check row is resolved, then goes on to the document check", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    const nomor = await lewatTenggang(setup, dasar);

    const tenggat = addWorkingDays(await setup.lokasi.adminPlatformCalendar(), wib("2027-05-20 10:00"), 1);
    if (!tenggat.ok) throw new Error("calendar unavailable");
    expect(await setup.pengurusan.cekTpuTerbuka()).toEqual([expect.objectContaining({ nomor, dueAt: tenggat.at })]);
    expect(await setup.pengurusan.periksaBerkasTerbuka()).toEqual([]);
    expect(await setup.pengurusan.periksaDokumen(dasar.admin, { nomor })).toEqual({ ok: false, reason: "cek_tpu_belum_selesai" });
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ status: "diajukan", tagihan: null });

    expect(await setup.pengurusan.putuskanCekTpu(dasar.admin, { nomor, putusan: "lanjut" })).toEqual({ ok: true, status: "diajukan" });
    expect(await setup.pengurusan.cekTpuTerbuka()).toEqual([]);
    expect(await setup.pengurusan.periksaBerkasTerbuka()).toEqual([expect.objectContaining({ nomor })]);
    expect(await setup.pengurusan.periksaDokumen(dasar.admin, { nomor })).toMatchObject({ ok: true, status: "menunggu_pembayaran" });
  });

  it("closes the request as Ditolak with the reason and no charge when the TPU will not renew", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    const nomor = await lewatTenggang(setup, dasar);

    const hasil = await setup.pengurusan.putuskanCekTpu(dasar.admin, { nomor, putusan: "tolak", alasan: "TPU menyatakan makam sudah dialihkan" });
    expect(hasil).toEqual({ ok: true, status: "ditolak" });
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ status: "ditolak", tagihan: null, alasan: "TPU menyatakan makam sudah dialihkan" });
    expect(await setup.pengurusan.cekTpuTerbuka()).toEqual([]);
    expect(await setup.pengurusan.periksaDokumen(dasar.admin, { nomor })).toEqual({ ok: false, reason: "status_tidak_sesuai" });
    expect(await setup.refunds.permintaanTerbuka()).toEqual([]);
  });

  it("cannot skip the TPU check by typing a later expiry date than the Makam TPU's recorded one, and shows both dates", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2027-05-20 10:00"));
    const hasil = await ajukan(setup, dasar, "2027-08-15");
    if (!hasil.ok) throw new Error(`order refused: ${hasil.reason}`);
    expect(hasil.pengurusan.lewatMasaTenggang).toBe(true);
    expect(await setup.pengurusan.orderOf(hasil.pengurusan.nomor, dasar.pemesan)).toMatchObject({
      perpanjangan: { iptmBerakhirPada: "2027-08-15", iptmTercatatBerakhirPada: "2027-02-15", lewatMasaTenggang: true },
    });
    expect(await setup.pengurusan.cekTpuTerbuka()).toHaveLength(1);
  });

  it("asks nothing of the TPU when the request is inside the masa tenggang", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2027-05-15 10:00"));
    const hasil = await ajukan(setup, dasar, "2027-02-15");
    expect(hasil).toMatchObject({ ok: true, pengurusan: { lewatMasaTenggang: false } });
    expect(await setup.pengurusan.cekTpuTerbuka()).toEqual([]);
  });
});

/** Paid, filed: IPTM Diajukan, the Tagihan Lunas on 21 December 2026. */
async function sampaiDiajukan(setup: PengajuanSetup, dasar: Dasar) {
  const { nomor, tagihan } = await sampaiMenungguPembayaran(setup, dasar);
  setup.clock.set(wib("2026-12-21 09:00"));
  await setup.billing.recordPayment(tagihan.id, QRIS);
  await setup.pengurusan.pembayaranBerkasTick();
  const diajukan = await setup.pengurusan.ajukanIptm(dasar.admin, { nomor });
  if (!diajukan.ok) throw new Error(`IPTM Diajukan refused: ${diajukan.reason}`);
  return { nomor, tagihan };
}

describe("a PTSP rejection of a Perpanjangan TPU", () => {
  it("sends a fixable rejection back to Perlu Perbaikan, refiled at no charge and with no new Tagihan", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    const { nomor, tagihan } = await sampaiDiajukan(setup, dasar);
    const buruk = (await setup.pengurusan.orderOf(nomor, dasar.pemesan))!.dokumen.pengajuan[0]!.nama;

    const ditolak = await setup.pengurusan.tolakPtsp(dasar.admin, { nomor, putusan: "perbaikan", alasan: "Scan IPTM tidak terbaca", dokumen: [buruk] });
    expect(ditolak).toEqual({ ok: true, status: "perlu_perbaikan" });
    expect(await setup.pengurusan.perluTindakanBerkas(dasar.pemesan)).toEqual([expect.objectContaining({ nomor, kurang: [buruk], alasanPerbaikan: "Scan IPTM tidak terbaca" })]);
    expect(await setup.pengurusan.ajukanIptm(dasar.admin, { nomor })).toMatchObject({ ok: false, reason: "dokumen_belum_lengkap" });

    await unggah(setup, dasar, nomor, buruk);
    expect(await setup.pengurusan.ajukanIptm(dasar.admin, { nomor })).toMatchObject({ ok: true, status: "iptm_diajukan" });
    const sesudah = await setup.pengurusan.orderOf(nomor, dasar.pemesan);
    expect(sesudah!.tagihan!.id).toBe(tagihan.id);
    expect((await setup.billing.tagihan(tagihan.id))!.status).toBe("lunas");
    expect(await setup.refunds.permintaanTerbuka()).toEqual([]);
  });

  it("makes a final rejection Ditolak with the reason shown and refunds the whole Tagihan", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    const { nomor } = await sampaiDiajukan(setup, dasar);

    const ditolak = await setup.pengurusan.tolakPtsp(dasar.admin, { nomor, putusan: "final", alasan: "IPTM sudah dicabut oleh TPU" });
    expect(ditolak).toMatchObject({ ok: true, status: "ditolak", pengembalian: 1_000_000 });
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ status: "ditolak", alasan: "IPTM sudah dicabut oleh TPU" });
    expect(await setup.refunds.permintaanTerbuka()).toEqual([expect.objectContaining({ nomorPemesanan: nomor, jumlah: 1_000_000, status: "diajukan" })]);
  });
});

describe("IPTM Terbit of a Perpanjangan TPU", () => {
  it("updates the Makam TPU's current IPTM and history, on the same record and without another Almarhum", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    const sebelum = (await setup.pengurusan.makamTpuSaya(dasar.pemesan))[0]!;
    expect(sebelum.riwayatIptm.map((entri) => entri.berlakuSampai)).toEqual(["2027-02-15"]);
    const { nomor } = await sampaiDiajukan(setup, dasar);

    setup.clock.set(wib("2026-12-24 11:00"));
    const terbit = await setup.pengurusan.terbitkanIptm(dasar.admin, { nomor, berkas: berkas(), berlakuSampai: "2030-02-15" });
    expect(terbit).toEqual({ ok: true, status: "iptm_terbit", makamTpuId: dasar.makamTpuId, diperbarui: true });

    const makam = await setup.pengurusan.makamTpuSaya(dasar.pemesan);
    expect(makam).toHaveLength(1);
    expect(makam[0]).toMatchObject({ id: dasar.makamTpuId, iptm: { berlakuSampai: "2030-02-15" }, almarhum: sebelum.almarhum });
    expect(makam[0]!.riwayatIptm.map((entri) => entri.berlakuSampai)).toEqual(["2027-02-15", "2030-02-15"]);
    expect(makam[0]!.riwayatIptm[1]).toMatchObject({ nomorPengurusan: nomor });
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ status: "iptm_terbit", makamTpuId: dasar.makamTpuId, iptm: { berlakuSampai: "2030-02-15" } });
    expect(await setup.pengurusan.iptmScanUrl(dasar.pemesan, nomor)).not.toBeNull();
  });
});

describe("correcting the IPTM expiry date", () => {
  it("lets Admin Platform correct the date read off the photo, audited with its reason, and re-reads the masa tenggang from it", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-05-30");
    setup.clock.set(wib("2027-05-20 10:00"));
    const nomor = await pesananPada(setup, dasar, "2027-05-30");
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ perpanjangan: { iptmBerakhirPada: "2027-05-30", lewatMasaTenggang: false } });

    const koreksi = await setup.pengurusan.koreksiIptmBerakhir(dasar.admin, { nomor, berlakuSampai: "2027-02-15", alasan: "Tanggal di foto IPTM: 15 Februari 2027" });
    expect(koreksi).toEqual({ ok: true, berlakuSampai: "2027-02-15" });
    expect(await setup.pengurusan.orderOf(nomor, dasar.pemesan)).toMatchObject({ perpanjangan: { iptmBerakhirPada: "2027-02-15", lewatMasaTenggang: true } });
    expect(await setup.pengurusan.cekTpuTerbuka()).toEqual([expect.objectContaining({ nomor })]);

    const order = await setup.pengurusan.orderForStaff(dasar.admin, nomor);
    const entri = (await setup.audit.entriesAbout({ kind: "pengurusan_tpu", id: order!.id })).find((satu) => satu.action === "pengurusan.iptm_berakhir_dikoreksi");
    expect(entri).toMatchObject({ before: { berlakuSampai: "2027-05-30" }, after: { berlakuSampai: "2027-02-15" }, reason: "Tanggal di foto IPTM: 15 Februari 2027" });
  });

  it("needs a reason and is refused once the Tagihan is issued", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    const { nomor } = await sampaiMenungguPembayaran(setup, dasar);
    const masukan = { nomor, berlakuSampai: "2027-02-16", alasan: "Salah baca" };
    expect(await setup.pengurusan.koreksiIptmBerakhir(dasar.admin, masukan)).toEqual({ ok: false, reason: "status_tidak_sesuai" });
    expect(await setup.pengurusan.koreksiIptmBerakhir(dasar.admin, { ...masukan, alasan: "" })).toEqual({ ok: false, reason: "input_tidak_valid" });
  });
});

describe("the IPTM expiry reminders", () => {
  const deps = (setup: PengajuanSetup): PengingatIptmDeps => ({
    db,
    identity: setup.identity,
    notifikasi: setup.notifications,
    tautan: (makamTpuId) => `https://makam.test/perpanjang-iptm/${makamTpuId}`,
  });
  /** One run of the tick at `waktu`, then the queued emails are sent, as the worker would. */
  async function tickPada(setup: PengajuanSetup, waktu: string) {
    setup.clock.set(wib(waktu));
    await pengingatIptmTick(deps(setup), setup.clock.now());
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
  }
  const keHolder = (setup: PengajuanSetup) => setup.email.sent.filter((pesan) => pesan.to === "pemegang@contoh.id" && pesan.subject.startsWith("Pengingat IPTM"));

  it("go to the Pemegang Hak 3 months and 1 month before the IPTM expires, once each, between 08:00 and 20:00, with the Perpanjangan link", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");

    await tickPada(setup, "2026-11-14 10:00");
    await tickPada(setup, "2026-11-15 07:00");
    expect(keHolder(setup)).toEqual([]);

    await tickPada(setup, "2026-11-15 10:00");
    expect(keHolder(setup)).toHaveLength(1);
    expect(keHolder(setup)[0]!.subject).toContain("3 bulan");
    expect(keHolder(setup)[0]!.text).toContain(`https://makam.test/perpanjang-iptm/${dasar.makamTpuId}`);

    await tickPada(setup, "2026-11-15 15:00");
    await tickPada(setup, "2026-12-20 10:00");
    expect(keHolder(setup)).toHaveLength(1);

    await tickPada(setup, "2027-01-15 10:00");
    expect(keHolder(setup)).toHaveLength(2);
    expect(keHolder(setup)[1]!.subject).toContain("1 bulan");

    await tickPada(setup, "2027-02-16 10:00");
    expect(keHolder(setup)).toHaveLength(2);
  });

  it("send one message when the tick runs twice at the same moment", async () => {
    const setup = pengajuanOnTestDatabase(db);
    await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2026-11-15 10:00"));
    const pertama = await pengingatIptmTick(deps(setup), setup.clock.now());
    const kedua = await pengingatIptmTick(deps(setup), setup.clock.now());
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());
    expect(keHolder(setup)).toHaveLength(1);
    expect(pertama).toMatchObject({ diumumkan: 1 });
    expect(kedua).toMatchObject({ diumumkan: 1 });
  });

  it("stop once a Perpanjangan TPU is ordered for the IPTM", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    await tickPada(setup, "2026-11-15 10:00");
    expect(keHolder(setup)).toHaveLength(1);

    setup.clock.set(wib("2026-12-20 10:00"));
    await pesanan(setup, dasar);
    await tickPada(setup, "2027-01-15 10:00");
    expect(keHolder(setup)).toHaveLength(1);
    expect(await pengingatIptmTick(deps(setup), setup.clock.now())).toEqual({ diumumkan: 0, dilewati: 1 });
  });
});

describe("what a Perpanjangan TPU stores", () => {
  it("holds no Almarhum, date of death, burial type, eligibility answers or Tumpang grave, because it is not a burial", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2026-12-20 10:00"));
    const nomor = await pesanan(setup, dasar);

    const order = await setup.pengurusan.orderOf(nomor, dasar.pemesan);
    expect(order).toMatchObject({ kind: "perpanjangan_tpu", almarhum: null, jenisPenguburan: null, kelayakan: null, kuburan: null });
  });

  it("shows its Antrean rows without an Almarhum and its Surat Kuasa with the grave's Blok but no Almarhum", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2026-12-20 10:00"));
    const nomor = await pesanan(setup, dasar);
    await unggah(setup, dasar, nomor);

    expect(await setup.pengurusan.periksaBerkasTerbuka()).toMatchObject([{ nomor, almarhumName: null }]);
    expect(await setup.pengurusan.suratKuasa(dasar.pemesan, nomor)).toMatchObject({ almarhum: null, blokNomor: "Blok B-12 No. 34" });

    const lengkap = await setup.pengurusan.periksaDokumen(dasar.admin, { nomor });
    if (!lengkap.ok || lengkap.status !== "menunggu_pembayaran") throw new Error("check refused");
    await setup.billing.recordPayment(lengkap.tagihan.id, QRIS);
    await setup.pengurusan.pembayaranBerkasTick();
    expect(await setup.pengurusan.pengajuanBerkasTerbuka()).toMatchObject([{ nomor, almarhumName: null }]);
  });

  it("shows a past-grace request's TPU check row without an Almarhum", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2027-05-20 10:00"));
    const nomor = await pesananPada(setup, dasar, "2027-02-15");
    expect(await setup.pengurusan.cekTpuTerbuka()).toMatchObject([{ nomor, almarhumName: null }]);
  });
});

describe("the IPTM expiry reminder of a Makam TPU with no email on record", () => {
  const deps = (setup: PengajuanSetup): PengingatIptmDeps => ({
    db,
    identity: setup.identity,
    notifikasi: setup.notifications,
    tautan: (makamTpuId) => `https://makam.test/perpanjang-iptm/${makamTpuId}`,
  });
  /** The Pemegang Hak has no email and no Akun is attached to the Makam TPU. */
  async function tanpaEmail(setup: PengajuanSetup, berlakuSampai: string) {
    const dasar = await makamBerakhir(setup, berlakuSampai);
    const [makam] = await db.select().from(makamTpu).where(eq(makamTpu.id, dasar.makamTpuId));
    await db.update(makamTpu).set({ pemegangAccountId: null, pemegangHak: { ...makam!.pemegangHak, email: null } }).where(eq(makamTpu.id, dasar.makamTpuId));
    return dasar;
  }
  const tick = async (setup: PengajuanSetup, waktu: string) => {
    setup.clock.set(wib(waktu));
    return pengingatIptmTick(deps(setup), setup.clock.now());
  };

  it("opens one Telepon Pemesan row for that Makam TPU instead of sending anything", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await tanpaEmail(setup, "2027-02-15");

    await tick(setup, "2026-11-15 10:00");
    await setup.notifications.kirimPesanJatuhTempo(setup.clock.now());

    expect(setup.email.sent.filter((pesan) => pesan.subject.startsWith("Pengingat IPTM"))).toEqual([]);
    expect(await setup.notifications.teleponPemesanTerbuka()).toMatchObject([
      { subjectKind: "makam_tpu", subjectId: dasar.makamTpuId, sebab: "tanpa_email", lokasiId: null },
    ]);
  });

  it("does not open it twice for the same reminder, even once a staff member has logged the call, and stays idempotent", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await tanpaEmail(setup, "2027-02-15");
    await tick(setup, "2026-11-15 10:00");
    await tick(setup, "2026-11-15 10:00");
    await tick(setup, "2026-11-15 15:00");
    const terbuka = await setup.notifications.teleponPemesanTerbuka();
    expect(terbuka).toHaveLength(1);

    const admin = dasar.admin;
    const dicatat = await setup.notifications.catatPanggilan(admin, { teleponId: terbuka[0]!.id, hasil: "janji_bayar" });
    expect(dicatat.ok).toBe(true);
    await tick(setup, "2026-11-16 10:00");
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([]);
  });

  it("opens a row again for the 1 month reminder, which is a reminder of its own", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await tanpaEmail(setup, "2027-02-15");
    await tick(setup, "2026-11-15 10:00");
    const [pertama] = await setup.notifications.teleponPemesanTerbuka();
    await setup.notifications.catatPanggilan(dasar.admin, { teleponId: pertama!.id, hasil: "janji_bayar" });

    await tick(setup, "2027-01-15 10:00");
    expect(await setup.notifications.teleponPemesanTerbuka()).toHaveLength(1);
  });

  it("opens none once a Perpanjangan TPU is ordered for the Makam TPU", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2026-12-20 10:00"));
    await pesanan(setup, dasar);
    const [makam] = await db.select().from(makamTpu).where(eq(makamTpu.id, dasar.makamTpuId));
    await db.update(makamTpu).set({ pemegangAccountId: null, pemegangHak: { ...makam!.pemegangHak, email: null } }).where(eq(makamTpu.id, dasar.makamTpuId));

    await tick(setup, "2027-01-15 10:00");
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([]);
  });

  it("closes the row that is already open when a Perpanjangan TPU is then ordered for the Makam TPU, so nobody phones someone who has ordered", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await tanpaEmail(setup, "2027-02-15");
    await tick(setup, "2026-11-15 10:00");
    expect(await setup.notifications.teleponPemesanTerbuka()).toHaveLength(1);

    // The Makam TPU now belongs to an Akun that orders the renewal.
    await db.update(makamTpu).set({ pemegangAccountId: dasar.pemesan.accountId }).where(eq(makamTpu.id, dasar.makamTpuId));
    setup.clock.set(wib("2026-12-20 10:00"));
    await pesanan(setup, dasar);

    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([]);
    await tick(setup, "2027-01-15 10:00");
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([]);
  });

  it("leaves a 3-month row that is still open alone when the 1-month reminder fires, and opens nothing new", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await tanpaEmail(setup, "2027-02-15");
    await tick(setup, "2026-11-15 10:00");
    const [pertama] = await setup.notifications.teleponPemesanTerbuka();

    await tick(setup, "2027-01-15 10:00");
    expect(await setup.notifications.teleponPemesanTerbuka()).toMatchObject([{ id: pertama!.id, subjectId: dasar.makamTpuId }]);
  });

  it("cannot open a second row for the same reminder after the first was closed, however many ticks run at once", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await tanpaEmail(setup, "2027-02-15");
    setup.clock.set(wib("2026-11-15 10:00"));
    await Promise.all(Array.from({ length: 6 }, () => pengingatIptmTick(deps(setup), setup.clock.now())));
    const [pertama] = await setup.notifications.teleponPemesanTerbuka();
    await setup.notifications.catatPanggilan(dasar.admin, { teleponId: pertama!.id, hasil: "sudah_dihubungi" });

    await Promise.all(Array.from({ length: 6 }, () => pengingatIptmTick(deps(setup), setup.clock.now())));
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([]);
    expect(await setup.notifications.teleponPemesanRiwayat("makam_tpu", dasar.makamTpuId)).toHaveLength(1);
  });

  it("does not open a row outside 08:00-20:00 WIB", async () => {
    const setup = pengajuanOnTestDatabase(db);
    await tanpaEmail(setup, "2027-02-15");
    await tick(setup, "2026-11-15 07:00");
    expect(await setup.notifications.teleponPemesanTerbuka()).toEqual([]);
  });
});

describe("the Surat Kuasa of a Perpanjangan TPU", () => {
  it("is available from the moment the order is placed, naming the company alone, so the signed copy can be uploaded with the other documents", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await makamBerakhir(setup, "2027-02-15");
    setup.clock.set(wib("2026-12-20 10:00"));
    const nomor = await pesanan(setup, dasar);
    const surat = await setup.pengurusan.suratKuasa(dasar.pemesan, nomor);
    expect(surat).toMatchObject({ nomor, penerimaKuasa: { perusahaan: "PT Jaya Korpora Prima" }, blokNomor: "Blok B-12 No. 34" });
    await setup.pengurusan.mintaPerbaikan(dasar.admin, { nomor, alasan: "x", dokumen: ["KTP Pemegang Hak"] });
    expect(await setup.pengurusan.suratKuasa(dasar.pemesan, nomor)).not.toBeNull();
  });
});

/**
 * The filing of a Saat Duka TPU order (spec, Pengurusan; stories 74-77 and 147; ticket 46), read
 * only through the Pengurusan module's public functions and what its neighbours show from outside:
 * the Tagihan Billing holds, the refund requests Refunds holds, the Tugas Lapangan Field Work holds
 * and the family messages the module announced.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import {
  fotoIptm,
  kuburanTumpang,
  orderSaatDukaTpu,
  pemesanDenganEmail,
  pengajuanOnTestDatabase,
  tpu,
  type PengajuanSetup,
} from "../../../tests/support/pengurusan";
import { buktiTransfer } from "../../../tests/support/refunds";
import { signedInPetugasLapangan } from "../../../tests/support/publish";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const SURAT_KUASA = "Surat Kuasa bermaterai";
const berkas = () => ({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" as const });

/** The three global tariffs, with a non-zero Retribusi Pemda so a refund has a line besides the Biaya Pengurusan. */
async function tarif(setup: PengajuanSetup, admin: Awaited<ReturnType<typeof siapkanOperatorPemesanan>>) {
  const masuk = (key: Parameters<typeof setup.tariffs.setGlobalTariff>[1]["key"], amount: number) =>
    setup.tariffs.setGlobalTariff(admin, { key, amount, effectiveOn: "2026-10-01", reason: null });
  await masuk("biaya_pengurusan_pemakaman", 1_750_000);
  await masuk("biaya_pengurusan_berkas", 750_000);
  await masuk("retribusi_pemda_iptm", 250_000);
  await masuk("biaya_layanan_platform", 150_001);
}

/** A Saat Duka TPU order placed, confirmed for 2026-10-02 09:00 and ready to be recorded Dimakamkan. */
async function pesananDikonfirmasi(
  setup: PengajuanSetup,
  options: { email?: string; almarhumName?: string; jenis?: "baru" | "tumpang"; pemegangHak?: Parameters<typeof orderSaatDukaTpu>[1] extends infer T ? T : never } = {},
) {
  const admin = await siapkanOperatorPemesanan(setup as never);
  const petugas = await signedInPetugasLapangan(setup, admin, "petugas.pengantar@contoh.id");
  setup.clock.set(wib("2026-10-01 10:00"));
  await tarif(setup, admin);
  const tpuDki = await tpu(setup);
  const pemesan = (await pemesanDenganEmail(setup, options.email ?? "pemesan@contoh.id")).pemesan;
  const tumpang = options.jenis === "tumpang";
  const placed = await setup.pengurusan.placeSaatDukaTpu(
    orderSaatDukaTpu(
      { tpuDki, pemesan },
      {
        almarhumName: options.almarhumName ?? "Siti Aminah",
        ...(tumpang ? { jenis: "tumpang" as const, kuburan: kuburanTumpang(), fotoIptm: fotoIptm() } : {}),
        ...(options.pemegangHak ?? {}),
      },
    ),
  );
  if (!placed.ok) throw new Error(`order refused: ${placed.reason}`);
  const nomor = placed.pengurusan.nomor;
  const konfirmasi = await setup.pengurusan.konfirmasiSaatDukaTpu(admin, {
    nomor,
    pemakamanAt: "2026-10-02 09:00",
    kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
    petugasAccountId: petugas.accountId,
    catatan: "",
  });
  if (!konfirmasi.ok) throw new Error(`confirmation refused: ${konfirmasi.reason}`);
  return { admin, petugas, pemesan, nomor, tagihanId: konfirmasi.tagihan.id, tpuDki };
}

type Dasar = Awaited<ReturnType<typeof pesananDikonfirmasi>>;

async function dimakamkan(setup: PengajuanSetup, dasar: Dasar) {
  setup.clock.set(wib("2026-10-02 12:00"));
  const hasil = await setup.pengurusan.catatDimakamkan(dasar.admin, { nomor: dasar.nomor });
  if (!hasil.ok) throw new Error(`Dimakamkan refused: ${hasil.reason}`);
}

async function unggahSemua(setup: PengajuanSetup, dasar: Dasar) {
  const order = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
  for (const dokumen of order!.dokumen.pengajuan) {
    const hasil = await setup.pengurusan.unggahDokumenPengajuan(dasar.pemesan, { nomor: dasar.nomor, nama: dokumen.nama, berkas: berkas() });
    if (!hasil.ok) throw new Error(`upload refused: ${hasil.reason}`);
  }
}

async function sampaiDiajukan(setup: PengajuanSetup, dasar: Dasar) {
  await dimakamkan(setup, dasar);
  await unggahSemua(setup, dasar);
  const lengkap = await setup.pengurusan.periksaDokumen(dasar.admin, { nomor: dasar.nomor });
  if (!lengkap.ok) throw new Error(`Dokumen Lengkap refused: ${lengkap.reason}`);
  const diajukan = await setup.pengurusan.ajukanIptm(dasar.admin, { nomor: dasar.nomor });
  if (!diajukan.ok) throw new Error(`IPTM Diajukan refused: ${diajukan.reason}`);
}

describe("Dimakamkan on a Saat Duka TPU order", () => {
  it("opens the 7-day window for the filing documents and lists the missing ones in Perlu tindakan", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    expect(await setup.pengurusan.perluTindakanBerkas(dasar.pemesan)).toEqual([]);

    setup.clock.set(wib("2026-10-02 12:00"));
    const hasil = await setup.pengurusan.catatDimakamkan(dasar.admin, { nomor: dasar.nomor });
    expect(hasil).toEqual({ ok: true, status: "dimakamkan", dokumenDueAt: wib("2026-10-09 12:00") });

    const order = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
    expect(order).toMatchObject({ status: "dimakamkan" });
    const tindakan = await setup.pengurusan.perluTindakanBerkas(dasar.pemesan);
    expect(tindakan).toHaveLength(1);
    expect(tindakan[0]).toMatchObject({ nomor: dasar.nomor, dueAt: wib("2026-10-09 12:00"), terlambat: false });
    expect(tindakan[0]!.kurang).toEqual(order!.dokumen.pengajuan.map((dokumen) => dokumen.nama));

    setup.clock.set(wib("2026-10-09 12:01"));
    expect((await setup.pengurusan.perluTindakanBerkas(dasar.pemesan))[0]).toMatchObject({ terlambat: true });
  });

  it("starts the pay-after Tagihan's Lewat Jatuh Tempo clock from the recorded burial", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    expect((await setup.billing.payAfterAnchored()).map((satu) => satu.id)).not.toContain(dasar.tagihanId);

    await dimakamkan(setup, dasar);
    const jangkar = (await setup.billing.payAfterAnchored()).find((satu) => satu.id === dasar.tagihanId);
    expect(jangkar?.lewatJatuhTempoAt).toEqual(wib("2026-10-05 12:00"));
  });

  it("is Admin Platform's step and only for a confirmed order", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    expect(await setup.pengurusan.catatDimakamkan(dasar.petugas, { nomor: dasar.nomor })).toMatchObject({ ok: false, reason: "tidak_berwenang" });
    expect(await setup.pengurusan.catatDimakamkan(dasar.admin, { nomor: "MKM-2026-999999" })).toEqual({ ok: false, reason: "pengurusan_tidak_ditemukan" });

    await dimakamkan(setup, dasar);
    expect(await setup.pengurusan.catatDimakamkan(dasar.admin, { nomor: dasar.nomor })).toEqual({ ok: false, reason: "status_tidak_sesuai" });
  });
});

describe("the order's timeline as its Pemesan reads it", () => {
  it("runs Diajukan, Dikonfirmasi, Dimakamkan, Dokumen Lengkap, IPTM Diajukan and IPTM Terbit, each with its moment", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    await dimakamkan(setup, dasar);
    await unggahSemua(setup, dasar);
    setup.clock.set(wib("2026-10-03 10:00"));
    await setup.pengurusan.periksaDokumen(dasar.admin, { nomor: dasar.nomor });
    setup.clock.set(wib("2026-10-06 10:00"));
    await setup.pengurusan.ajukanIptm(dasar.admin, { nomor: dasar.nomor });
    setup.clock.set(wib("2026-10-12 10:00"));
    await setup.pengurusan.terbitkanIptm(dasar.admin, { nomor: dasar.nomor, berkas: berkas(), berlakuSampai: "2029-10-11", blokNomor: "A-1" });

    const order = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
    expect(order!.riwayat).toEqual([
      { status: "diajukan", pada: wib("2026-10-01 10:00") },
      { status: "dikonfirmasi", pada: wib("2026-10-01 10:00") },
      { status: "dimakamkan", pada: wib("2026-10-02 12:00") },
      { status: "dokumen_lengkap", pada: wib("2026-10-03 10:00") },
      { status: "iptm_diajukan", pada: wib("2026-10-06 10:00") },
      { status: "iptm_terbit", pada: wib("2026-10-12 10:00") },
    ]);
    expect(order).toMatchObject({ iptm: { berlakuSampai: "2029-10-11" }, pengajuan: { dokumenDueAt: wib("2026-10-09 12:00"), kurang: [] } });
  });

  it("ends at Dibatalkan for a cancelled order", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    setup.clock.set(wib("2026-10-01 15:00"));
    await setup.pengurusan.batalkanPengurusan(dasar.pemesan, { nomor: dasar.nomor });
    const order = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
    expect(order!.riwayat.at(-1)).toEqual({ status: "dibatalkan", pada: wib("2026-10-01 15:00") });
  });
});

describe("the Surat Kuasa", () => {
  it("names PT Jaya Korpora Prima, the filing staff member and the Pemegang Hak who signs", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    await dimakamkan(setup, dasar);

    const surat = await setup.pengurusan.suratKuasa(dasar.pemesan, dasar.nomor);
    expect(surat).toMatchObject({
      nomor: dasar.nomor,
      penerimaKuasa: { perusahaan: "PT Jaya Korpora Prima", wakil: { name: dasar.admin.email } },
      pemberiKuasa: { name: "Budi Santoso" },
      tpu: { name: "TPU Kober" },
      almarhum: { name: "Siti Aminah" },
      tanggal: "2026-10-02",
    });
    expect(await setup.pengurusan.suratKuasaUntukStaf(dasar.admin, dasar.nomor)).toEqual(surat);
    // Another Akun's order is nobody else's page.
    const lain = (await pemesanDenganEmail(setup, "lain@contoh.id")).pemesan;
    expect(await setup.pengurusan.suratKuasa(lain, dasar.nomor)).toBeNull();
  });

  it("is on the filing checklist as the document the Pemegang Hak signs and uploads", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    const order = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
    expect(order!.dokumen.pengajuan.map((dokumen) => dokumen.nama)).toContain(SURAT_KUASA);
  });
});

describe("the Surat Kuasa as a PDF", () => {
  it("is rendered by the PdfRenderer, kept in the private FileStore and handed over as a signed URL that expires after 5 minutes", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    await dimakamkan(setup, dasar);

    const url = await setup.pengurusan.suratKuasaPdfUrl(dasar.pemesan, dasar.nomor);
    expect(url).not.toBeNull();
    expect(setup.pdfSuratKuasa.rendered).toEqual([expect.objectContaining({ url: expect.stringContaining(`/pengurusan/${dasar.nomor}/surat-kuasa`) })]);
    const buka = setup.files.open(url!);
    expect(buka).toMatchObject({ contentType: "application/pdf" });
    expect(new TextDecoder().decode(buka!.body.slice(0, 5))).toBe("%PDF-");
    setup.clock.set(new Date(setup.clock.now().getTime() + 301_000));
    expect(setup.files.open(url!)).toBeNull();
  });

  it("is read without an actor by the render page, as the Pemesan reads it", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    expect(await setup.pengurusan.suratKuasaUntukCetak("MKM-2026-999999")).toBeNull();
    expect(await setup.pengurusan.suratKuasaUntukCetak(dasar.nomor)).toEqual(await setup.pengurusan.suratKuasa(dasar.pemesan, dasar.nomor));
  });

  it("is only for the Pemesan of a confirmed order", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    await dimakamkan(setup, dasar);
    const lain = (await pemesanDenganEmail(setup, "lain@contoh.id")).pemesan;

    expect(await setup.pengurusan.suratKuasaPdfUrl(lain, dasar.nomor)).toBeNull();
    expect(await setup.pengurusan.suratKuasaPdfUrl(dasar.pemesan, "MKM-2026-999999")).toBeNull();
    expect(setup.pdfSuratKuasa.rendered).toEqual([]);
  });
});

describe("the filing documents", () => {
  it("become Dokumen Lengkap only once every document, the signed Surat Kuasa among them, is uploaded", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    await dimakamkan(setup, dasar);
    const order = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
    const semua = order!.dokumen.pengajuan.map((dokumen) => dokumen.nama);

    expect(await setup.pengurusan.unggahDokumenPengajuan(dasar.pemesan, { nomor: dasar.nomor, nama: "KTP Pemegang Hak", berkas: berkas() })).toEqual({
      ok: true,
      kurang: semua.filter((nama) => nama !== "KTP Pemegang Hak"),
    });
    expect(await setup.pengurusan.periksaDokumen(dasar.admin, { nomor: dasar.nomor })).toMatchObject({
      ok: false,
      reason: "dokumen_belum_lengkap",
      kurang: semua.filter((nama) => nama !== "KTP Pemegang Hak"),
    });

    await unggahSemua(setup, dasar);
    expect(await setup.pengurusan.perluTindakanBerkas(dasar.pemesan)).toEqual([]);
    expect(await setup.pengurusan.periksaDokumen(dasar.admin, { nomor: dasar.nomor })).toEqual({ ok: true, status: "dokumen_lengkap" });
    expect(await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "dokumen_lengkap" });
  });

  it("are uploaded by their own Pemesan, from the list and only after the burial", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    const unggah = (pemesan: { accountId: string }, nama: string, isi = berkas()) =>
      setup.pengurusan.unggahDokumenPengajuan(pemesan, { nomor: dasar.nomor, nama, berkas: isi });
    expect(await unggah(dasar.pemesan, "KTP Pemegang Hak")).toEqual({ ok: false, reason: "status_tidak_sesuai" });

    await dimakamkan(setup, dasar);
    const lain = (await pemesanDenganEmail(setup, "lain@contoh.id")).pemesan;
    expect(await unggah(lain, "KTP Pemegang Hak")).toEqual({ ok: false, reason: "pengurusan_tidak_ditemukan" });
    expect(await unggah(dasar.pemesan, "Dokumen karangan")).toEqual({ ok: false, reason: "dokumen_tidak_dikenal" });
    expect(await unggah(dasar.pemesan, "KTP Pemegang Hak", { body: new Uint8Array([1]), contentType: "text/html" as never })).toEqual({ ok: false, reason: "input_tidak_valid" });
  });
});

describe("IPTM Diajukan", () => {
  it("is a Tier 3 row due 7 days after Dokumen Lengkap, and a Berkas IPTM Tugas Lapangan can be created for the originals", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    await dimakamkan(setup, dasar);
    await unggahSemua(setup, dasar);
    setup.clock.set(wib("2026-10-03 10:00"));
    await setup.pengurusan.periksaDokumen(dasar.admin, { nomor: dasar.nomor });

    expect(await setup.pengurusan.pengajuanIptmTerbuka()).toEqual([
      expect.objectContaining({ nomor: dasar.nomor, dokumenLengkapPada: wib("2026-10-03 10:00"), dueAt: wib("2026-10-10 10:00") }),
    ]);

    const diajukan = await setup.pengurusan.ajukanIptm(dasar.admin, { nomor: dasar.nomor, berkasPetugasAccountId: dasar.petugas.accountId });
    expect(diajukan).toMatchObject({ ok: true, status: "iptm_diajukan" });
    expect(await setup.pengurusan.pengajuanIptmTerbuka()).toEqual([]);
    const tugas = await setup.fieldwork.tugasSaya(dasar.petugas);
    expect(tugas.map((satu) => satu.type)).toContain("berkas_iptm");
  });

  it("cannot be filed before Dokumen Lengkap", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    await dimakamkan(setup, dasar);
    expect(await setup.pengurusan.ajukanIptm(dasar.admin, { nomor: dasar.nomor })).toEqual({ ok: false, reason: "status_tidak_sesuai" });
  });
});

describe("IPTM Terbit and the Makam TPU", () => {
  it("hands the IPTM over to the Pemesan and the Pemegang Hak while the Tagihan is unpaid, and creates the Makam TPU", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup, {
      pemegangHak: { pemegangHak: { mode: "lain", name: "Hasan Basri", phoneNumber: "081311112222", email: "hasan@contoh.id" } },
    });
    await sampaiDiajukan(setup, dasar);
    setup.clock.set(wib("2026-10-20 09:00"));

    const terbit = await setup.pengurusan.terbitkanIptm(dasar.admin, {
      nomor: dasar.nomor,
      berkas: berkas(),
      berlakuSampai: "2029-10-19",
      blokNomor: "Blok C-3 No. 7",
    });
    expect(terbit).toMatchObject({ ok: true, status: "iptm_terbit", diperbarui: false });

    // The Tagihan is still unpaid and the permit is handed over regardless.
    expect((await setup.billing.tagihan(dasar.tagihanId))!.status).not.toBe("lunas");
    expect(await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "iptm_terbit" });
    expect(await setup.pengurusan.iptmScanUrl(dasar.pemesan, dasar.nomor)).toEqual(expect.stringContaining("pengurusan"));
    expect(setup.iptmDiumumkan).toEqual([
      expect.objectContaining({ nomor: dasar.nomor, email: "pemesan@contoh.id", pemegangHak: { name: "Hasan Basri", email: "hasan@contoh.id" }, berlakuSampai: "2029-10-19" }),
    ]);

    // The Makam TPU shows in the Pemesan's Makam tab with TPU, grave, Almarhum, Pemegang Hak and the permit.
    const makam = await setup.pengurusan.makamTpuSaya(dasar.pemesan);
    expect(makam).toEqual([
      expect.objectContaining({
        tpu: expect.objectContaining({ name: "TPU Kober" }),
        blokNomor: "Blok C-3 No. 7",
        almarhum: [{ name: "Siti Aminah", tanggalWafat: "2026-09-30" }],
        pemegangHak: { name: "Hasan Basri", phoneNumber: "+6281311112222", email: "hasan@contoh.id" },
        iptm: { berlakuSampai: "2029-10-19" },
        riwayatIptm: [expect.objectContaining({ berlakuSampai: "2029-10-19", nomorPengurusan: dasar.nomor })],
      }),
    ]);
  });

  it("refuses an expiry in the past, a Baru order without a blok and a nomor, and any step out of sequence", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    await dimakamkan(setup, dasar);
    const terbit = (over: object) => setup.pengurusan.terbitkanIptm(dasar.admin, { nomor: dasar.nomor, berkas: berkas(), berlakuSampai: "2029-10-19", blokNomor: "B-1", ...over });
    expect(await terbit({})).toEqual({ ok: false, reason: "status_tidak_sesuai" });

    await unggahSemua(setup, dasar);
    await setup.pengurusan.periksaDokumen(dasar.admin, { nomor: dasar.nomor });
    await setup.pengurusan.ajukanIptm(dasar.admin, { nomor: dasar.nomor });
    expect(await terbit({ berlakuSampai: "2026-10-02" })).toEqual({ ok: false, reason: "kedaluwarsa_di_masa_lalu" });
    expect(await terbit({ blokNomor: undefined })).toEqual({ ok: false, reason: "blok_nomor_wajib" });
    expect(await terbit({ blokNomor: "B-1" })).toMatchObject({ ok: true });
  });

  it("updates the existing Makam TPU for a Tumpang order instead of creating a second one", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const pertama = await pesananDikonfirmasi(setup);
    await sampaiDiajukan(setup, pertama);
    setup.clock.set(wib("2026-10-20 09:00"));
    await setup.pengurusan.terbitkanIptm(pertama.admin, { nomor: pertama.nomor, berkas: berkas(), berlakuSampai: "2029-10-19", blokNomor: "Blok B-12 No. 34" });

    // A second order, a Tumpang in the same grave (written differently), by the same family.
    setup.clock.set(wib("2026-11-01 10:00"));
    const kedua = await setup.pengurusan.placeSaatDukaTpu(
      orderSaatDukaTpu(
        { tpuDki: pertama.tpuDki, pemesan: pertama.pemesan },
        { almarhumName: "Ahmad Fauzi", tanggalWafat: "2026-10-30", jenis: "tumpang", kuburan: { blokNomor: " blok b-12 no. 34 ", nama: "Siti Aminah" }, fotoIptm: fotoIptm() },
      ),
    );
    if (!kedua.ok) throw new Error(`order refused: ${kedua.reason}`);
    const nomor = kedua.pengurusan.nomor;
    const konfirmasi = await setup.pengurusan.konfirmasiSaatDukaTpu(pertama.admin, {
      nomor,
      pemakamanAt: "2026-11-02 09:00",
      kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
      petugasAccountId: pertama.petugas.accountId,
      catatan: "",
    });
    if (!konfirmasi.ok) throw new Error(`confirmation refused: ${konfirmasi.reason}`);
    setup.clock.set(wib("2026-11-02 12:00"));
    await setup.pengurusan.catatDimakamkan(pertama.admin, { nomor });
    const order = await setup.pengurusan.orderOf(nomor, pertama.pemesan);
    for (const dokumen of order!.dokumen.pengajuan) {
      await setup.pengurusan.unggahDokumenPengajuan(pertama.pemesan, { nomor, nama: dokumen.nama, berkas: berkas() });
    }
    await setup.pengurusan.periksaDokumen(pertama.admin, { nomor });
    await setup.pengurusan.ajukanIptm(pertama.admin, { nomor });
    const terbit = await setup.pengurusan.terbitkanIptm(pertama.admin, { nomor, berkas: berkas(), berlakuSampai: "2029-11-20" });
    expect(terbit).toMatchObject({ ok: true, diperbarui: true });

    const makam = await setup.pengurusan.makamTpuSaya(pertama.pemesan);
    expect(makam).toHaveLength(1);
    expect(makam[0]).toMatchObject({
      almarhum: [{ name: "Siti Aminah", tanggalWafat: "2026-09-30" }, { name: "Ahmad Fauzi", tanggalWafat: "2026-10-30" }],
      iptm: { berlakuSampai: "2029-11-20" },
    });
    expect(makam[0]!.riwayatIptm.map((iptm) => iptm.berlakuSampai)).toEqual(["2029-10-19", "2029-11-20"]);
  });

  it("prefills the grave description of a TPU Layanan order from the Makam TPU, for its own Pemegang Hak account only", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    await sampaiDiajukan(setup, dasar);
    await setup.pengurusan.terbitkanIptm(dasar.admin, { nomor: dasar.nomor, berkas: berkas(), berlakuSampai: "2029-10-19", blokNomor: "Blok C-3 No. 7" });
    const [makam] = await setup.pengurusan.makamTpuSaya(dasar.pemesan);
    expect(await setup.pengurusan.deskripsiMakamTpu(dasar.pemesan, makam!.id)).toEqual({
      tpuId: dasar.tpuDki.id,
      blokNomor: "Blok C-3 No. 7",
      almarhumName: "Siti Aminah",
    });
    const lain = (await pemesanDenganEmail(setup, "lain@contoh.id")).pemesan;
    expect(await setup.pengurusan.deskripsiMakamTpu(lain, makam!.id)).toBeNull();
  });
});

describe("cancelling a Saat Duka TPU order", () => {
  it("voids an unpaid Tagihan and makes the order Dibatalkan, at Dikonfirmasi or at Dimakamkan", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    expect(await setup.pengurusan.batalkanPengurusan(dasar.pemesan, { nomor: dasar.nomor, alasan: "Ganti rencana" })).toEqual({
      ok: true,
      status: "dibatalkan",
      tagihanDibatalkan: true,
      pengembalian: 0,
    });
    expect((await setup.billing.tagihan(dasar.tagihanId))!.status).toBe("dibatalkan");
    expect(await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan)).toMatchObject({ status: "dibatalkan", alasan: "Ganti rencana" });

    const setup2 = pengajuanOnTestDatabase(db);
    await resetDatabase();
    const kedua = await pesananDikonfirmasi(setup2);
    await dimakamkan(setup2, kedua);
    expect(await setup2.pengurusan.batalkanPengurusan(kedua.pemesan, { nomor: kedua.nomor })).toMatchObject({ ok: true, tagihanDibatalkan: true });
  });

  it("is refused once the IPTM is filed", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    await sampaiDiajukan(setup, dasar);
    expect(await setup.pengurusan.batalkanPengurusan(dasar.pemesan, { nomor: dasar.nomor })).toEqual({ ok: false, reason: "sudah_diajukan" });
    expect((await setup.billing.tagihan(dasar.tagihanId))!.status).not.toBe("dibatalkan");
  });

  it("asks for the full amount paid back when a paid order is cancelled before Dimakamkan", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    const dibayar = await setup.billing.recordPayment(dasar.tagihanId, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);

    const hasil = await setup.pengurusan.batalkanPengurusan(dasar.pemesan, { nomor: dasar.nomor, alasan: "Batal" });
    expect(hasil).toEqual({ ok: true, status: "dibatalkan", tagihanDibatalkan: false, pengembalian: 2_000_000 });
    expect(await setup.refunds.permintaanTerbuka()).toEqual([
      expect.objectContaining({ nomorPemesanan: dasar.nomor, jumlah: 2_000_000, status: "diajukan" }),
    ]);
  });

  it("keeps the Biaya Pengurusan and refunds the other lines when a paid order is cancelled at or past Dimakamkan", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    const dibayar = await setup.billing.recordPayment(dasar.tagihanId, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
    await dimakamkan(setup, dasar);

    const hasil = await setup.pengurusan.batalkanPengurusan(dasar.pemesan, { nomor: dasar.nomor });
    expect(hasil).toEqual({ ok: true, status: "dibatalkan", tagihanDibatalkan: false, pengembalian: 250_000 });
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect(permintaan).toMatchObject({ nomorPemesanan: dasar.nomor, jumlah: 250_000 });
    expect(permintaan!.lines.map((baris) => baris.label)).not.toContain("Biaya Pengurusan");
  });

  it("sends a refund raised after Dimakamkan, without the Biaya Pengurusan, through approval to a Bukti Pengembalian Dana", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    const dibayar = await setup.billing.recordPayment(dasar.tagihanId, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
    await dimakamkan(setup, dasar);
    await setup.pengurusan.batalkanPengurusan(dasar.pemesan, { nomor: dasar.nomor });
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    const pemesanActor = { ...dasar.pemesan, phoneNumber: null, roles: ["pemesan" as const], lokasiIds: [], totp: "tidak_perlu" as const, sessionId: "sesi-uji" };
    const isi = await setup.refunds.isiRekeningPemesan(pemesanActor, {
      nomorPemesanan: dasar.nomor,
      rekening: { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Siti" },
    });
    expect(isi).toMatchObject({ ok: true });

    const setuju = await setup.refunds.setujuiPengembalian(dasar.admin, { permintaanId: permintaan!.id });
    if (!setuju.ok) throw new Error(`approval refused: ${setuju.reason}`);
    const terbit = await setup.refunds.terbitkanBuktiPengembalianDana(dasar.admin, {
      permintaanId: permintaan!.id,
      ditransferPada: "2026-10-02",
      bukti: buktiTransfer,
    });
    if (!terbit.ok) throw new Error(`transfer refused: ${terbit.reason}`);
    expect(terbit.bukti).toMatchObject({ amount: 250_000 });
    expect(await setup.refunds.buktiPengembalianDana(terbit.bukti.link)).not.toBeNull();
  });

  it("lets only the Pemesan of a cancelled paid TPU order enter the refund rekening, until Admin Platform approves it", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    const dibayar = await setup.billing.recordPayment(dasar.tagihanId, { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null });
    if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
    await setup.pengurusan.batalkanPengurusan(dasar.pemesan, { nomor: dasar.nomor });
    const actorDari = (akun: typeof dasar.pemesan) => ({ ...akun, phoneNumber: null, roles: ["pemesan" as const], lokasiIds: [], totp: "tidak_perlu" as const, sessionId: "sesi-uji" });
    const rekening = { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Siti" };

    const lain = (await pemesanDenganEmail(setup, "lain@contoh.id")).pemesan;
    expect(await setup.refunds.isiRekeningPemesan(actorDari(lain), { nomorPemesanan: dasar.nomor, rekening })).toMatchObject({ ok: false, reason: "tidak_ditemukan" });
    expect(await setup.refunds.isiRekeningPemesan(actorDari(dasar.pemesan), { nomorPemesanan: dasar.nomor, rekening })).toMatchObject({ ok: true });
    expect(await setup.refunds.permintaanUntukPesanan(dasar.nomor)).toMatchObject({ status: "diajukan", jumlah: 2_000_000, rekening: { nomor: "7123456789" } });

    const [permintaan] = await setup.refunds.permintaanTerbuka();
    await setup.refunds.setujuiPengembalian(dasar.admin, { permintaanId: permintaan!.id });
    expect(await setup.refunds.isiRekeningPemesan(actorDari(dasar.pemesan), { nomorPemesanan: dasar.nomor, rekening })).toMatchObject({ ok: false, reason: "terkunci" });
  });
});

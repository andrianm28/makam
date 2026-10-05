/**
 * The order page of a Pengurusan (`/pengurusan/<Nomor Pemesanan>`), read the way its Pemesan reads it (ticket 116, found
 * by the selector audit of the UAT runner): the real page, signed in with a Kode Masuk, on the Pengurusan module's own
 * read model and a real Postgres, rendered to static markup. The orders are made through the module's public functions,
 * as the neighbouring tests make them.
 *
 * A Saat Duka TPU order has a burial the Operator agreed with the TPU. A Pengurusan IPTM (filing-only) order has none:
 * the family buried on its own and the order starts at Dimakamkan, so a page that reads a burial time off it breaks.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeFileStore } from "@/adapters/memory";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam, wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { browser } from "../../../../tests/support/next-request";
import { siapkanOperatorPemesanan } from "../../../../tests/support/pemesanan";
import { orderSaatDukaTpu, pemesanDenganEmail, pengajuanOnTestDatabase, tpu, type PengajuanSetup } from "../../../../tests/support/pengurusan";
import { signedInPetugasLapangan } from "../../../../tests/support/publish";
import { testServerRuntime } from "../../../../tests/support/server-runtime";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

const { default: PengurusanPage } = await import("./page");
const { PengurusanIptmPemesan } = await import("./pengurusan-iptm-pemesan");
const { isiRekeningPengembalianPengurusanAction } = await import("./pengajuan-actions");

const { db, close } = testDatabase();
afterAll(close);
// The page reads through the `web` runtime, so it is built on this run's database; the orders are made on the same one.
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const EMAIL = "pemesan@contoh.id";
const berkas = () => ({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" as const });
const QRIS = { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null } as const;

/** What the Pemesan reads: the markup as plain text, whitespace collapsed. */
const bacaan = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** The Pemesan opens the order's page, signed in as the Kode Masuk that placed it signs them in. */
async function halaman(nomor: string) {
  browser.reset();
  browser.store((await server.logIn(EMAIL)).session.cookies);
  const html = renderToStaticMarkup(await PengurusanPage({ params: Promise.resolve({ nomor }) } as never));
  return { html, teks: bacaan(html) };
}

/** The tariffs, the Admin Platform, a DKI TPU and a Pemesan with an Email Terverifikasi: what any Pengurusan order needs. */
async function dasarTpu(setup: PengajuanSetup) {
  const admin = await siapkanOperatorPemesanan(setup as never);
  setup.clock.set(wib("2026-10-01 10:00"));
  const masuk = (key: Parameters<typeof setup.tariffs.setGlobalTariff>[1]["key"], amount: number) =>
    setup.tariffs.setGlobalTariff(admin, { key, amount, effectiveOn: "2026-10-01", reason: null });
  await masuk("biaya_pengurusan_pemakaman", 1_750_000);
  await masuk("biaya_pengurusan_berkas", 750_000);
  await masuk("retribusi_pemda_iptm", 250_000);
  await masuk("biaya_layanan_platform", 150_001);
  const tpuDki = await tpu(setup);
  const pemesan = (await pemesanDenganEmail(setup, EMAIL)).pemesan;
  return { admin, tpuDki, pemesan };
}

/** A family that buried at a DKI TPU on its own, the order placed on Friday 2 October 2026 (at 10:00 WIB unless told). */
async function pesananBerkas(setup: PengajuanSetup, waktu = "2026-10-02 10:00") {
  const { admin, tpuDki, pemesan } = await dasarTpu(setup);
  setup.clock.set(wib(waktu));
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
  return { admin, pemesan, nomor: placed.pengurusan.nomor };
}

type Dasar = Awaited<ReturnType<typeof pesananBerkas>>;

async function unggahSemua(setup: PengajuanSetup, dasar: Dasar, nama?: string) {
  const order = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
  for (const dokumen of order!.dokumen.pengajuan) {
    if (nama && dokumen.nama !== nama) continue;
    const hasil = await setup.pengurusan.unggahDokumenPengajuan(dasar.pemesan, { nomor: dasar.nomor, nama: dokumen.nama, berkas: berkas() });
    if (!hasil.ok) throw new Error(`upload refused: ${hasil.reason}`);
  }
}

/** Every document is in and Admin Platform has checked them: the pay-first Tagihan is issued, due 3×24 h later. */
async function sampaiMenungguPembayaran(setup: PengajuanSetup, dasar: Dasar) {
  setup.clock.set(wib("2026-10-02 14:00"));
  await unggahSemua(setup, dasar);
  const lengkap = await setup.pengurusan.periksaDokumen(dasar.admin, { nomor: dasar.nomor });
  if (!lengkap.ok || lengkap.status !== "menunggu_pembayaran") throw new Error(`check refused: ${JSON.stringify(lengkap)}`);
  return lengkap.tagihan;
}

async function sampaiDiproses(setup: PengajuanSetup, dasar: Dasar) {
  const tagihan = await sampaiMenungguPembayaran(setup, dasar);
  const dibayar = await setup.billing.recordPayment(tagihan.id, QRIS);
  if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
  await setup.pengurusan.pembayaranBerkasTick();
}

async function sampaiDiajukan(setup: PengajuanSetup, dasar: Dasar) {
  await sampaiDiproses(setup, dasar);
  const diajukan = await setup.pengurusan.ajukanIptm(dasar.admin, { nomor: dasar.nomor });
  if (!diajukan.ok) throw new Error(`IPTM Diajukan refused: ${diajukan.reason}`);
}

async function sampaiPerluPerbaikan(setup: PengajuanSetup, dasar: Dasar) {
  await sampaiDiajukan(setup, dasar);
  const order = await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan);
  const ditolak = await setup.pengurusan.tolakPtsp(dasar.admin, {
    nomor: dasar.nomor,
    putusan: "perbaikan",
    alasan: "Foto KTP buram",
    dokumen: [order!.dokumen.pengajuan[0]!.nama],
  });
  if (!ditolak.ok) throw new Error(`rejection refused: ${ditolak.reason}`);
}

async function sampaiDitolak(setup: PengajuanSetup, dasar: Dasar) {
  await sampaiDiajukan(setup, dasar);
  const ditolak = await setup.pengurusan.tolakPtsp(dasar.admin, { nomor: dasar.nomor, putusan: "final", alasan: "Makam bukan di TPU yang menerima IPTM" });
  if (!ditolak.ok) throw new Error(`rejection refused: ${ditolak.reason}`);
}

async function sampaiTerbit(setup: PengajuanSetup, dasar: Dasar) {
  await sampaiDiajukan(setup, dasar);
  const terbit = await setup.pengurusan.terbitkanIptm(dasar.admin, { nomor: dasar.nomor, berkas: berkas(), berlakuSampai: "2029-10-11", blokNomor: "A-1" });
  if (!terbit.ok) throw new Error(`IPTM Terbit refused: ${terbit.reason}`);
  // The page signs the link to the scan through the web runtime's FileStore, not the fixture's: hand it what the fixture stored.
  for (const file of setup.files.stored.values()) await (server.runtime().adapters.files as FakeFileStore).put(file);
}

async function sampaiDibatalkan(setup: PengajuanSetup, dasar: Dasar) {
  const batal = await setup.pengurusan.batalkanPengurusan(dasar.pemesan, { nomor: dasar.nomor, alasan: "Keluarga mengurus sendiri" });
  if (!batal.ok) throw new Error(`cancellation refused: ${batal.reason}`);
}

/** What only a burial arranged by us makes true: none of it may be said to a family that buried on its own. */
const HANYA_UNTUK_PEMAKAMAN = ["Waktu pemakaman", "Pemakaman sudah dikonfirmasi", "Waktu konfirmasi", "Dibawa saat pemakaman", "Tagihan terbit setelah pemakaman dikonfirmasi"];

describe("the order page of a Pengurusan IPTM, for a family that buried on its own", () => {
  it("opens at Dimakamkan, straight after the family places it, with no burial time and the documents still to upload", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);

    const { html, teks } = await halaman(dasar.nomor);

    expect(teks).toContain(dasar.nomor);
    expect(teks).toContain("Dimakamkan");
    expect(teks).toContain(`Unggah paling lambat ${formatTanggalJam(wib("2026-10-09 10:00"))}`);
    expect(teks).toContain("KTP Pemegang Hak");
    expect(teks).toContain("TPU Kober");
    expect(teks).toContain("Siti Aminah, wafat 25 September 2026");
    for (const katakan of HANYA_UNTUK_PEMAKAMAN) expect(teks).not.toContain(katakan);
    // Nothing is billed until Admin Platform has checked the documents.
    expect(html).not.toContain("/dokumen/");
  });

  it("shows the pay-first Tagihan with its number, amount and due time and a Buka Tagihan link at Menunggu Pembayaran", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    await sampaiMenungguPembayaran(setup, dasar);
    const { tagihan } = (await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan))!;

    const { html, teks } = await halaman(dasar.nomor);

    expect(teks).toContain("Menunggu Pembayaran");
    expect(teks).toContain(`Tagihan ${tagihan!.nomor} sebesar ${formatRupiah(1_000_000)} jatuh tempo ${formatTanggalJam(wib("2026-10-05 14:00"))}`);
    expect(html).toContain(`href="/dokumen/${tagihan!.link}"`);
    expect(teks).toContain("Buka Tagihan");
    // One link, not two: the page tells the family to pay, and gives them the one place to do it.
    expect(html.split('href="/dokumen/').length - 1).toBe(1);
    expect(teks).toContain("Bayar Tagihan agar kami bisa mengajukan IPTM");
  });

  it("tells a family whose order came in at night nothing about the TPU window closing", async () => {
    const setup = pengajuanOnTestDatabase(db);
    // 20:30 WIB is outside the TPU window (06:00–18:00), which is what a Saat Duka TPU order placed then is told about.
    const dasar = await pesananBerkas(setup, "2026-10-02 20:30");
    await sampaiMenungguPembayaran(setup, dasar);

    const { teks } = await halaman(dasar.nomor);

    expect(teks).toContain("Menunggu Pembayaran");
    expect(teks).not.toContain("di luar jam layanan TPU");
    expect(teks).not.toContain("belum bisa dihitung");
  });

  it.each([
    ["Dimakamkan", async () => {}, "Unggah paling lambat"],
    ["Menunggu Pembayaran", sampaiMenungguPembayaran, "Bayar Tagihan agar kami bisa mengajukan IPTM"],
    ["Diproses", sampaiDiproses, "IPTM akan diajukan oleh tim kami"],
    ["IPTM Diajukan", sampaiDiajukan, "IPTM sudah diajukan di JakEVO"],
    ["Perlu Perbaikan", sampaiPerluPerbaikan, "Perbaikan diminta: Foto KTP buram"],
    ["IPTM Terbit", sampaiTerbit, "Berlaku sampai 2029-10-11"],
    ["Ditolak", sampaiDitolak, "Pengajuan ditolak PTSP"],
    ["Dibatalkan", sampaiDibatalkan, "Dibatalkan"],
  ] as const)("renders at %s, and says no burial time", async (label, sampai, katakan) => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    await sampai(setup, dasar);

    const { teks } = await halaman(dasar.nomor);

    expect(teks).toContain(dasar.nomor);
    expect(teks).toContain(label);
    expect(teks).toContain(katakan);
    for (const bukan of HANYA_UNTUK_PEMAKAMAN) expect(teks).not.toContain(bukan);
  });

  it("renders at Dokumen Lengkap too, a status the module reaches only for a Saat Duka TPU order, and says no burial time", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    const order = (await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan))!;

    // The module bills a filing-only order the moment its documents pass, so no call leaves it here: the view is handed the status.
    const teks = bacaan(renderToStaticMarkup(createElement(PengurusanIptmPemesan, { order: { ...order, status: "dokumen_lengkap" }, scanUrl: null, pengembalian: null })));

    expect(teks).toContain(dasar.nomor);
    expect(teks).toContain("Dokumen Lengkap");
    expect(teks).toContain("IPTM akan diajukan oleh tim kami");
    for (const bukan of HANYA_UNTUK_PEMAKAMAN) expect(teks).not.toContain(bukan);
  });

  it("still asks for the rekening of a refund when the family cancels after paying, in the minute before the order is Diproses", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    const tagihan = await sampaiMenungguPembayaran(setup, dasar);
    // Lunas, but the worker's minute tick has not yet made the order Diproses, so the family can still cancel it.
    const dibayar = await setup.billing.recordPayment(tagihan.id, QRIS);
    if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
    await sampaiDibatalkan(setup, dasar);
    const [permintaan] = await setup.refunds.permintaanTerbuka();

    const { html, teks } = await halaman(dasar.nomor);

    expect(permintaan).toMatchObject({ nomorPemesanan: dasar.nomor, status: "diajukan" });
    expect(html).toContain('data-testid="rekening-pengembalian"');
    expect(teks).toContain(`Dana sebesar ${formatRupiah(permintaan!.jumlah)} akan dikembalikan`);
  });

  it("asks for the rekening of the full refund a final PTSP rejection raises, as it does at Dibatalkan, and Refunds receives what the family enters", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    await sampaiDitolak(setup, dasar);
    const [permintaan] = await setup.refunds.permintaanTerbuka();

    const { html, teks } = await halaman(dasar.nomor);

    expect(permintaan).toMatchObject({ nomorPemesanan: dasar.nomor, status: "diajukan", penuh: true });
    expect(teks).toContain("Pengajuan ditolak PTSP");
    expect(html).toContain('data-testid="rekening-pengembalian"');
    expect(teks).toContain(`Dana sebesar ${formatRupiah(permintaan!.jumlah)} akan dikembalikan`);

    // The form is the one Dibatalkan has: its action stores the account on the request, which Admin Platform then reads to transfer.
    const form = new FormData();
    form.set("nomor", dasar.nomor);
    form.set("bank", "Bank Syariah Indonesia");
    form.set("nomorRekening", "7123456789");
    form.set("nama", "Budi Santoso");
    expect(await isiRekeningPengembalianPengurusanAction({ status: "idle" }, form)).toMatchObject({ status: "berhasil" });
    expect(await setup.refunds.permintaanUntukPesanan(dasar.nomor)).toMatchObject({ rekening: { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Budi Santoso" } });
  });

  it("says a refund already approved at Ditolak is waiting for its transfer, with no form to change the account", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    await sampaiDitolak(setup, dasar);
    const [permintaan] = await setup.refunds.permintaanTerbuka();
    expect((await setup.refunds.setujuiPengembalian(dasar.admin, { permintaanId: permintaan!.id })).ok).toBe(true);

    const { html, teks } = await halaman(dasar.nomor);

    expect(html).not.toContain('data-testid="rekening-pengembalian"');
    expect(html).toContain('data-testid="rekening-pengembalian-terkunci"');
    expect(teks).toContain(`Pengembalian dana ${formatRupiah(permintaan!.jumlah)} sudah disetujui dan menunggu transfer`);
  });

  it("gives the Tagihan link only while the Tagihan is open: once it is paid, at Diproses, there is nothing left to pay", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananBerkas(setup);
    await sampaiDiproses(setup, dasar);

    const { html } = await halaman(dasar.nomor);

    expect(html).not.toContain("/dokumen/");
  });
});

describe("the order page of a Saat Duka TPU order, which has a burial", () => {
  /** Placed, and confirmed by Admin Platform with the TPU for Friday 2 October 2026 at 09:00 WIB. */
  async function pesananDikonfirmasi(setup: PengajuanSetup) {
    const { admin, tpuDki, pemesan } = await dasarTpu(setup);
    const petugas = await signedInPetugasLapangan(setup, admin, "petugas.pengantar@contoh.id");
    const placed = await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu({ tpuDki, pemesan }));
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
    return { admin, pemesan, nomor };
  }

  it("still shows the burial the TPU agreed to, with the Tagihan issued at the confirmation", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    const { tagihan } = (await setup.pengurusan.orderOf(dasar.nomor, dasar.pemesan))!;

    const { html, teks } = await halaman(dasar.nomor);

    expect(teks).toContain("Pemakaman sudah dikonfirmasi");
    expect(teks).toContain(`Waktu pemakaman ${formatTanggalJam(wib("2026-10-02 09:00"))}`);
    expect(teks).toContain("Petugas TPU Kober, 0218501234");
    expect(teks).toContain(`Tagihan ${tagihan!.nomor} sebesar`);
    expect(html).toContain(`href="/dokumen/${tagihan!.link}"`);
    expect(teks).toContain("Dibawa saat pemakaman");
  });

  it("still shows the burial time once the burial is recorded as Dimakamkan", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const dasar = await pesananDikonfirmasi(setup);
    setup.clock.set(wib("2026-10-02 12:00"));
    const dimakamkan = await setup.pengurusan.catatDimakamkan(dasar.admin, { nomor: dasar.nomor });
    if (!dimakamkan.ok) throw new Error(`Dimakamkan refused: ${dimakamkan.reason}`);

    const { teks } = await halaman(dasar.nomor);

    expect(teks).toContain("Dimakamkan");
    expect(teks).toContain(`Waktu pemakaman ${formatTanggalJam(wib("2026-10-02 09:00"))}`);
  });
});

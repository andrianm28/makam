/**
 * The hari-H Layanan of a Saat Duka TPU order, as its family reaches them from Akun Saya (ticket 120; found by the review
 * of ticket 117): the Pesanan tab lists the order and links it to `/pengurusan/<Nomor Pemesanan>`, and that page must show
 * every Pekerjaan Layanan of the order in every status the order can be in, a job that was cancelled included, with where
 * its refund stands. The real pages, signed in with a Kode Masuk, on the modules' own read models and a real Postgres,
 * rendered to static markup; the orders are made through the modules' public functions.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRupiah } from "@/lib/rupiah";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { saatDukaTpuDikonfirmasi, siapTpuBertarif, type SiapTpuBertarif } from "../../../../tests/support/layanan-tpu";
import { browser } from "../../../../tests/support/next-request";
import { buktiTransfer } from "../../../../tests/support/refunds";
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
const { default: AkunPesananPage } = await import("../../(site)/akun/pesanan/page");

const { db, close } = testDatabase();
afterAll(close);
// The pages read through the `web` runtime, so it is built on this run's database; the orders are made on the same one.
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const EMAIL = "pemesan.tpu@contoh.id";
const QRIS = { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null } as const;
const REKENING = { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Budi Santoso" };
const LABEL_BUNGA = "Layanan – Bunga Tabur (Reguler)";
const SUDAH_DIBATALKAN = "Pekerjaan ini dibatalkan dan tidak akan dikerjakan.";

/** What the family reads: the markup as plain text, whitespace collapsed. */
const bacaan = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** The refund block under the Layanan hari-H list, as plain text; empty when the page has none. */
function blokPengembalian(html: string) {
  return bacaan(html.match(/data-testid="pengembalian-layanan-tpu"[\s\S]*?<\/div>/)?.[0] ?? "");
}

/** The Pemesan signs in, as the Kode Masuk that placed the order signs them in. */
async function masuk() {
  browser.reset();
  browser.store((await server.logIn(EMAIL)).session.cookies);
}

/** The family's Pesanan tab: its markup, signed in. */
async function tabPesanan() {
  await masuk();
  return renderToStaticMarkup(await AkunPesananPage());
}

/** `/pengurusan/<nomor>`: where the Pesanan tab sends a Saat Duka TPU order. */
async function halamanPengurusan(nomor: string) {
  await masuk();
  const html = renderToStaticMarkup(await PengurusanPage({ params: Promise.resolve({ nomor }) } as never));
  return { html, teks: bacaan(html) };
}

/** A confirmed Saat Duka TPU order with one hari-H Bunga Tabur, paid (Lunas) or not. */
async function pesananDikonfirmasi(s: SiapTpuBertarif, options: { dibayar: boolean }) {
  const { nomor, hasil } = await saatDukaTpuDikonfirmasi(s.setup, s, [{ layananVariantId: s.bunga.id, teks: "Untuk almarhum" }]);
  if (options.dibayar) {
    const dibayar = await s.setup.billing.recordPayment(hasil.tagihan.id, QRIS);
    if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
  }
  return { nomor, tagihan: hasil.tagihan };
}

const batalkan = async (s: SiapTpuBertarif, nomor: string) => {
  const batal = await s.setup.pengurusan.batalkanPengurusan(s.pemesan, { nomor });
  if (!batal.ok) throw new Error(`cancellation refused: ${batal.reason}`);
};

describe("Akun Saya reaches the hari-H Layanan of a Saat Duka TPU order in every status of the order", () => {
  it("lists them while the order is Dikonfirmasi, on the page the Pesanan tab links the order to", async () => {
    const s = await siapTpuBertarif(db);
    const { nomor } = await pesananDikonfirmasi(s, { dibayar: false });

    expect(await tabPesanan()).toContain(`href="/pengurusan/${nomor}"`);
    const { teks, html } = await halamanPengurusan(nomor);

    expect(teks).toContain("Layanan hari-H");
    expect(teks).toContain(LABEL_BUNGA);
    expect(teks).toContain("Dijadwalkan");
    expect(teks).toContain("ditagihkan pada Tagihan di atas");
    // And the Layanan page of the same jobs, which nothing linked from here before, is one click away.
    expect(html).toContain(`href="/layanan/${nomor}"`);
  });

  it("still lists them once the burial is recorded (Dimakamkan)", async () => {
    const s = await siapTpuBertarif(db);
    const { nomor } = await pesananDikonfirmasi(s, { dibayar: true });
    const dimakamkan = await s.setup.pengurusan.catatDimakamkan(s.admin, { nomor });
    expect(dimakamkan).toMatchObject({ ok: true, status: "dimakamkan" });

    expect(await tabPesanan()).toContain(`href="/pengurusan/${nomor}"`);
    const { teks } = await halamanPengurusan(nomor);

    expect(teks).toContain("Layanan hari-H");
    expect(teks).toContain(LABEL_BUNGA);
  });

  it("lists the Dibatalkan job of a cancelled order nobody had paid, and promises no refund", async () => {
    const s = await siapTpuBertarif(db);
    const { nomor } = await pesananDikonfirmasi(s, { dibayar: false });
    await batalkan(s, nomor);

    expect(await tabPesanan()).toContain(`href="/pengurusan/${nomor}"`);
    const { teks, html } = await halamanPengurusan(nomor);

    expect(teks).toContain("Layanan hari-H");
    expect(teks).toContain(LABEL_BUNGA);
    expect(teks).toContain(SUDAH_DIBATALKAN);
    expect(html).not.toContain("pengembalian-layanan-tpu");
    // A cancelled order shows no Tagihan, so the Layanan are not said to be billed on one "di atas".
    expect(teks).not.toContain("Tagihan di atas");
  });

  it("lists the Dibatalkan job of a cancelled, paid order with its refund Diajukan, then Disetujui, then Ditransfer with its Bukti Pengembalian Dana", async () => {
    const s = await siapTpuBertarif(db);
    const { nomor, tagihan } = await pesananDikonfirmasi(s, { dibayar: true });
    await batalkan(s, nomor);
    const [permintaan] = await s.setup.refunds.permintaanTerbuka();
    const jumlah = formatRupiah(permintaan!.jumlah);
    expect(permintaan).toMatchObject({ nomorPemesanan: nomor, jumlah: tagihan.total });

    // Asked, waiting for Admin Platform.
    let halaman = await halamanPengurusan(nomor);
    expect(halaman.teks).toContain(LABEL_BUNGA);
    expect(halaman.teks).toContain(SUDAH_DIBATALKAN);
    expect(blokPengembalian(halaman.html)).toContain(`${jumlah} · menunggu persetujuan Admin Platform`);

    // Approved, waiting for the transfer. Admin Platform records the bank account, so the state reads the same whoever entered it.
    const rekening = await s.setup.refunds.isiRekeningAdmin(s.admin, { permintaanId: permintaan!.id, rekening: REKENING, alasan: "Dicatat lewat telepon" });
    if (!rekening.ok) throw new Error(`rekening refused: ${rekening.reason}`);
    const setuju = await s.setup.refunds.setujuiPengembalian(s.admin, { permintaanId: permintaan!.id });
    if (!setuju.ok) throw new Error(`approval refused: ${setuju.reason}`);
    halaman = await halamanPengurusan(nomor);
    expect(blokPengembalian(halaman.html)).toContain(`${jumlah} · sudah disetujui, menunggu transfer`);

    // Sent: the Bukti Pengembalian Dana is the family's to open, from the same place.
    const terbit = await s.setup.refunds.terbitkanBuktiPengembalianDana(s.admin, { permintaanId: permintaan!.id, ditransferPada: "2026-10-01", bukti: buktiTransfer });
    if (!terbit.ok) throw new Error(`transfer refused: ${terbit.reason}`);
    halaman = await halamanPengurusan(nomor);
    expect(blokPengembalian(halaman.html)).toContain(`${jumlah} · sudah ditransfer`);
    expect(halaman.html).toContain(`href="/dokumen/${terbit.bukti.link}"`);
    expect(halaman.teks).toContain(terbit.bukti.nomor);
  });
});

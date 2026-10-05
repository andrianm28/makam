/**
 * The order page of a Perpanjangan TPU (`/pengurusan/<Nomor Pemesanan>`), read the way its Pemegang Hak reads it (ticket 121): the real
 * page, signed in with a Kode Masuk, on the Pengurusan module's own read model and a real Postgres, rendered to static markup. The
 * order is made through the module's public functions, as `perpanjangan-tpu.test.ts` makes it.
 *
 * A final PTSP rejection of a paid renewal refunds the whole Tagihan, and the refund waits for the bank account the family gives on
 * this page, as it does on an order the family cancelled.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { makamTpuDenganIptm } from "../../../../tests/support/makam-tpu";
import { browser } from "../../../../tests/support/next-request";
import { pengajuanOnTestDatabase } from "../../../../tests/support/pengurusan";
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
const { isiRekeningPengembalianPengurusanAction } = await import("./pengajuan-actions");

const { db, close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

/** The Makam TPU's own Pemegang Hak: the Akun `makamTpuDenganIptm` places the order with. */
const EMAIL = "pemegang@contoh.id";
const berkas = () => ({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" as const });
const QRIS = { method: { kind: "penyedia_pembayaran", channel: "QRIS" }, reference: null } as const;

async function halaman(nomor: string) {
  browser.reset();
  browser.store((await server.logIn(EMAIL)).session.cookies);
  const html = renderToStaticMarkup(await PengurusanPage({ params: Promise.resolve({ nomor }) } as never));
  return { html, teks: html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() };
}

/** A renewal placed on 20 December 2026, its documents checked, paid and filed at the PTSP: IPTM Diajukan. */
async function perpanjanganDiajukan(setup: ReturnType<typeof pengajuanOnTestDatabase>) {
  const dasar = await makamTpuDenganIptm(setup, "2027-02-15");
  setup.clock.set(wib("2026-12-20 10:00"));
  const dipesan = await setup.pengurusan.placePerpanjanganTpu({
    pemesan: dasar.pemesan,
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    makamTpuId: dasar.makamTpuId,
    berlakuSampai: "2027-02-15",
  });
  if (!dipesan.ok) throw new Error(`order refused: ${dipesan.reason}`);
  const nomor = dipesan.pengurusan.nomor;
  setup.clock.set(wib("2026-12-20 14:00"));
  const order = await setup.pengurusan.orderOf(nomor, dasar.pemesan);
  for (const dokumen of order!.dokumen.pengajuan) {
    const diunggah = await setup.pengurusan.unggahDokumenPengajuan(dasar.pemesan, { nomor, nama: dokumen.nama, berkas: berkas() });
    if (!diunggah.ok) throw new Error(`upload refused: ${diunggah.reason}`);
  }
  const lengkap = await setup.pengurusan.periksaDokumen(dasar.admin, { nomor });
  if (!lengkap.ok || lengkap.status !== "menunggu_pembayaran") throw new Error(`check refused: ${JSON.stringify(lengkap)}`);
  setup.clock.set(wib("2026-12-21 09:00"));
  const dibayar = await setup.billing.recordPayment(lengkap.tagihan.id, QRIS);
  if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
  await setup.pengurusan.pembayaranBerkasTick();
  const diajukan = await setup.pengurusan.ajukanIptm(dasar.admin, { nomor });
  if (!diajukan.ok) throw new Error(`IPTM Diajukan refused: ${diajukan.reason}`);
  return { admin: dasar.admin, nomor };
}

describe("the order page of a Perpanjangan TPU", () => {
  it("asks for the rekening of the full refund once the PTSP refuses it for good, as for an order the family cancelled, and Refunds receives it", async () => {
    const setup = pengajuanOnTestDatabase(db);
    const { admin, nomor } = await perpanjanganDiajukan(setup);

    // While the PTSP has not answered nothing is owed back, so nothing about a refund is on the page.
    expect((await halaman(nomor)).html).not.toContain('data-testid="rekening-pengembalian"');

    const ditolak = await setup.pengurusan.tolakPtsp(admin, { nomor, putusan: "final", alasan: "IPTM sudah dicabut oleh TPU" });
    expect(ditolak).toMatchObject({ ok: true, status: "ditolak", pengembalian: 1_000_000 });
    const { html, teks } = await halaman(nomor);

    expect(html).toContain('data-testid="rekening-pengembalian"');
    expect(teks).toContain(`Dana sebesar ${formatRupiah(1_000_000)} akan dikembalikan`);

    const form = new FormData();
    form.set("nomor", nomor);
    form.set("bank", "Bank Syariah Indonesia");
    form.set("nomorRekening", "7123456789");
    form.set("nama", "Hj. Rahmawati");
    expect(await isiRekeningPengembalianPengurusanAction({ status: "idle" }, form)).toMatchObject({ status: "berhasil" });
    expect(await setup.refunds.permintaanUntukPesanan(nomor)).toMatchObject({ rekening: { bank: "Bank Syariah Indonesia", nomor: "7123456789", nama: "Hj. Rahmawati" } });
  });
});

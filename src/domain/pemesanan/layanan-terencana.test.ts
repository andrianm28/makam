/**
 * Layanan chosen at checkout for an empty plot on a Pemesanan Terencana (spec, Layanan > Order; Pemesanan > Terencana; Billing >
 * due rules; ticket 53). One Petak Makam only. The Layanan is checked when the order is placed, priced with the Hak Pakai when the
 * Lokasi Mitra confirms (one Tagihan, one Biaya Layanan Platform), scheduled when that Tagihan is paid, and cancelled when the
 * order is withdrawn or its payment hold lapses. Through the modules' public functions only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { adminPlatformOf } from "../../../tests/support/identity";
import { pemesananOnTestDatabase, pemesanDenganEmail, siapkanOperatorPemesanan, tawarkanLayananDi, unitIds, type PemesananSetup } from "../../../tests/support/pemesanan";
import { terencanaLokasi } from "../../../tests/support/terencana";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const dataPemesan = {
  pemesanName: "Rina Wulandari",
  phoneNumber: "081234567890",
  pemegangHak: { mode: "pemesan" },
  calonPenghuni: { mode: "saya" },
} as const;
const QRIS = { kind: "penyedia_pembayaran", channel: "QRIS" } as const;

/** A Terencana Lokasi Mitra offering a Pembersihan for an empty plot (3-day lead time, Rp 400.000), and a Pemesan. */
async function siap(setup: PemesananSetup) {
  const { actor: admin } = await adminPlatformOf(setup);
  await siapkanOperatorPemesanan(setup);
  const fixture = await terencanaLokasi(setup, admin);
  const { varian } = await tawarkanLayananDi(setup, fixture.lokasiMitra.id, { nama: "Pembersihan Makam", bisaHariH: false, adaDiPetakKosong: true, leadTimeDays: 3, amount: 400_000 });
  const { pemesan } = await pemesanDenganEmail(setup, "keluarga@contoh.id");
  const id = await unitIds(setup, fixture, ["A-01", "A-02"]);
  return { fixture, varian, pemesan, id };
}
type Siap = Awaited<ReturnType<typeof siap>>;

const pesan = (setup: PemesananSetup, dasar: Siap, petak: string[], layanan: unknown) =>
  setup.pemesanan.placeTerencana({
    ...dataPemesan,
    pemesan: dasar.pemesan,
    lokasiId: dasar.fixture.lokasiMitra.id,
    units: petak.map((nomor) => ({ petakId: dasar.id[nomor] })),
    layanan,
  });

/** An order for A-01 with the Pembersihan on 20 Oktober, placed and confirmed. */
async function dikonfirmasi(setup: PemesananSetup) {
  const dasar = await siap(setup);
  const placed = await pesan(setup, dasar, ["A-01"], [{ layananVariantId: dasar.varian.id, targetDate: "2026-10-20" }]);
  if (!placed.ok) throw new Error(`placeTerencana refused: ${placed.reason}`);
  const hasil = await setup.pemesanan.konfirmasiTerencana(dasar.fixture.adminLokasi, { nomor: placed.pemesanan.nomor });
  if (!hasil.ok) throw new Error(`konfirmasiTerencana refused: ${hasil.reason}`);
  return { ...dasar, nomor: placed.pemesanan.nomor, tagihan: hasil.tagihan };
}

describe("Layanan chosen for an empty plot on a Pemesanan Terencana", () => {
  it("is refused when the order has more than one plot, and nothing is held", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await siap(setup);
    expect(await pesan(setup, dasar, ["A-01", "A-02"], [{ layananVariantId: dasar.varian.id, targetDate: "2026-10-20" }])).toEqual({ ok: false, reason: "layanan_satu_petak" });
    expect((await pesan(setup, dasar, ["A-01"], [])).ok).toBe(true);
  });

  it("is refused when the Lokasi does not offer it for an empty plot, or the target date is inside its lead time", async () => {
    const setup = pemesananOnTestDatabase(db);
    const dasar = await siap(setup);
    // 1 Oktober 09:00 plus a 3-day lead time: 3 Oktober is too early.
    expect(await pesan(setup, dasar, ["A-01"], [{ layananVariantId: dasar.varian.id, targetDate: "2026-10-03" }])).toEqual({ ok: false, reason: "lead_time_melewati" });
    expect(await pesan(setup, dasar, ["A-01"], [{ layananVariantId: "00000000-0000-4000-8000-000000000000", targetDate: "2026-10-20" }])).toEqual({ ok: false, reason: "layanan_tidak_tersedia" });
  });

  it("is priced with the Hak Pakai on the one Tagihan when the Lokasi confirms, with one Biaya Layanan Platform", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await dikonfirmasi(setup);
    const tagihan = await setup.billing.tagihan(fixture.tagihan.id);
    expect(tagihan!.lines.filter((line) => line.kind === "harga_hak_pakai")).toHaveLength(1);
    expect(tagihan!.lines.filter((line) => line.kind === "layanan")).toMatchObject([{ amount: 400_000, targetDate: "2026-10-20" }]);
    expect(tagihan!.lines.filter((line) => line.kind === "biaya_layanan_platform")).toHaveLength(1);
    expect(fixture.tagihan.dueAt.getTime()).toBeLessThanOrEqual(wib("2026-10-04 09:00").getTime());
    expect((await setup.layanan.pesananLayananOf(fixture.nomor, fixture.pemesan))?.item).toMatchObject([{ targetDate: "2026-10-20", pekerjaan: { status: "menunggu_pembayaran" } }]);
  });

  it("has its Pekerjaan Layanan Dijadwalkan when the Tagihan is paid, and the order Aktif", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await dikonfirmasi(setup);
    expect((await setup.billing.recordPayment(fixture.tagihan.id, { method: QRIS, reference: null })).ok).toBe(true);
    expect((await setup.layanan.pesananLayananOf(fixture.nomor, fixture.pemesan))?.item).toMatchObject([{ pekerjaan: { status: "dijadwalkan" } }]);
    expect(await setup.pemesanan.terencanaUntukStaf(fixture.fixture.adminLokasi, fixture.nomor)).toMatchObject({ status: "aktif" });
  });

  it("has its Pekerjaan Layanan Dibatalkan when the payment hold lapses", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await dikonfirmasi(setup);
    setup.clock.set(fixture.tagihan.dueAt);
    expect(await setup.pemesanan.lewatBatasBayarTick(setup.clock.now())).toMatchObject({ dibatalkan: 1 });
    expect((await setup.layanan.pesananLayananOf(fixture.nomor, fixture.pemesan))?.item).toMatchObject([{ pekerjaan: { status: "dibatalkan" } }]);
  });

  it("has its Pekerjaan Layanan Dibatalkan when the Pemesan withdraws the order before paying", async () => {
    const setup = pemesananOnTestDatabase(db);
    const fixture = await dikonfirmasi(setup);
    expect(await setup.pemesanan.tarikTerencana(fixture.pemesan, { nomor: fixture.nomor })).toMatchObject({ ok: true });
    expect((await setup.layanan.pesananLayananOf(fixture.nomor, fixture.pemesan))?.item).toMatchObject([{ pekerjaan: { status: "dibatalkan" } }]);
  });
});

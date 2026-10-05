/**
 * The Terencana wizard's Kirim, as the Server Action answers it, with Layanan chosen for the empty plot (ticket 53). What the
 * order and its Layanan mean is the Pemesanan module's own tests; this asks that the action carries the choice through.
 *
 * The second half asks it for what the family picked on "Data & kirim" (ticket 118): `layananPetakKosong` turns the
 * picks into the Layanan the form sends and the sum the screen adds to the total, and the order is placed and
 * confirmed for real, so that the total shown can be read against the Tagihan the order gets.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { opsiLayananView } from "@/components/layanan/opsi-view";
import { targetPalingDini } from "@/domain/layanan";
import type { PilihanPerLayanan } from "@/lib/layanan-pilihan";
import { browser } from "../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { adminPlatformOf } from "../../../../tests/support/identity";
import { siapkanOperatorPemesanan, tawarkanLayananDi, unitIds } from "../../../../tests/support/pemesanan";
import { terencanaLokasi } from "../../../../tests/support/terencana";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { kirimPesananTerencana } from "./actions";
import { layananPetakKosong } from "./layanan-petak";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

/**
 * A Terencana Lokasi Mitra offering a Pembersihan for an empty plot (and, when asked, a Laporan Foto too), built
 * through the same runtime the action uses.
 */
async function siap(options: { denganFoto?: boolean } = {}) {
  const rt = server.runtime();
  const setup = { ...rt, clock: server.clock, email: server.email() } as never as Parameters<typeof terencanaLokasi>[0] & Parameters<typeof tawarkanLayananDi>[0];
  const { actor: admin } = await adminPlatformOf(setup);
  await siapkanOperatorPemesanan(setup as never);
  const fixture = await terencanaLokasi(setup, admin);
  const { layanan: layananDasar, varian } = await tawarkanLayananDi(setup, fixture.lokasiMitra.id, { nama: "Pembersihan Makam", bisaHariH: false, adaDiPetakKosong: true, leadTimeDays: 3, amount: 400_000 });
  const foto = options.denganFoto
    ? await tawarkanLayananDi(setup, fixture.lokasiMitra.id, { nama: "Laporan Foto", bisaHariH: false, adaDiPetakKosong: true, leadTimeDays: 1, amount: 150_000 })
    : null;
  const id = await unitIds(setup as never, fixture, ["A-01", "A-02", "A-07", "A-08"]);
  return { rt, fixture, varian, layanan: layananDasar, foto, id };
}

const draft = (dasar: Awaited<ReturnType<typeof siap>>, petak: string[], layanan?: unknown) => ({
  pemesanName: "Rina Wulandari",
  email: "pemesan@contoh.id",
  phoneNumber: "081234567890",
  lokasiId: dasar.fixture.lokasiMitra.id,
  units: petak.map((nomor) => ({ petakId: dasar.id[nomor] })),
  pemegangHak: { mode: "pemesan" },
  calonPenghuni: { mode: "saya" },
  ...(layanan === undefined ? {} : { layanan }),
});

describe("Kirim pesanan Terencana with Layanan for the empty plot (Server Action)", () => {
  it("carries the Layanan to the order, so the Lokasi's confirmation prices them on the one Tagihan", async () => {
    const dasar = await siap();
    const login = await server.logIn("pemesan@contoh.id");
    browser.store(login.session.cookies);

    const hasil = await kirimPesananTerencana(draft(dasar, ["A-01"], [{ layananVariantId: dasar.varian.id, targetDate: "2026-10-20", teks: null }]));
    expect(hasil.status).toBe("selesai");
    if (hasil.status !== "selesai") return;

    const konfirmasi = await dasar.rt.pemesanan.konfirmasiTerencana(dasar.fixture.adminLokasi, { nomor: hasil.nomor });
    if (!konfirmasi.ok) throw new Error(`confirmation refused: ${konfirmasi.reason}`);
    const tagihan = await dasar.rt.billing.tagihan(konfirmasi.tagihan.id);
    expect(tagihan!.lines.filter((line) => line.kind === "layanan")).toMatchObject([{ amount: 400_000, targetDate: "2026-10-20" }]);
    expect(tagihan!.lines.filter((line) => line.kind === "biaya_layanan_platform")).toHaveLength(1);
  });

  it("words a refusal of the Layanan for the screen, and places nothing", async () => {
    const dasar = await siap();
    const login = await server.logIn("pemesan@contoh.id");
    browser.store(login.session.cookies);

    const duaPetak = await kirimPesananTerencana(draft(dasar, ["A-01", "A-02"], [{ layananVariantId: dasar.varian.id, targetDate: "2026-10-20", teks: null }]));
    expect(duaPetak).toEqual({ status: "gagal", message: expect.stringContaining("satu petak") });
    const terlaluDekat = await kirimPesananTerencana(draft(dasar, ["A-01"], [{ layananVariantId: dasar.varian.id, targetDate: "2026-10-03", teks: null }]));
    expect(terlaluDekat).toEqual({ status: "gagal", message: expect.stringContaining("tanggal") });
    // The plot was never held: the same plot can still be ordered without Layanan.
    expect((await kirimPesananTerencana(draft(dasar, ["A-01"]))).status).toBe("selesai");
  });
});

type Dasar = Awaited<ReturnType<typeof siap>>;

/** What the page hands "Data & kirim": the Layanan offered for an empty plot, each with the first day its lead time allows. */
async function ditawarkan(dasar: Dasar) {
  const grup = await dasar.rt.layanan.penawaranCheckout(dasar.fixture.lokasiMitra.id, "petak_kosong");
  return grup.map((satu) => opsiLayananView({ ...satu, tanggalPalingDini: targetPalingDini(satu.layanan.leadTimeDays, server.clock.now()) }));
}

/** The total the sticky bar shows for one chosen Petak Makam: the Denah's all-in total plus what the Layanan picked add to it. */
async function totalDitampilkan(dasar: Dasar, nomor: string, tambahan: number) {
  const denah = await dasar.rt.pemesanan.denahTerencana(dasar.fixture.lokasiMitra.id, { petak: [nomor], kavling: null });
  if (!denah) throw new Error("the Denah is not there");
  return denah.total.total + tambahan;
}

/** Kirim for one Petak Makam with these Layanan, then the Lokasi Mitra's confirmation, and the Tagihan it issues read back. */
async function tagihanDariPesanan(dasar: Dasar, nomor: string, layanan: unknown) {
  const hasil = await kirimPesananTerencana(draft(dasar, [nomor], layanan));
  if (hasil.status !== "selesai") throw new Error(`order not placed: ${JSON.stringify(hasil)}`);
  const konfirmasi = await dasar.rt.pemesanan.konfirmasiTerencana(dasar.fixture.adminLokasi, { nomor: hasil.nomor });
  if (!konfirmasi.ok) throw new Error(`confirmation refused: ${konfirmasi.reason}`);
  const tagihan = await dasar.rt.billing.tagihan(konfirmasi.tagihan.id);
  if (!tagihan) throw new Error("the Tagihan cannot be read back");
  return tagihan;
}

describe("the Layanan picked on Terencana's Data & kirim, against the Tagihan the order gets", () => {
  it("the total shown is the total of the Tagihan, for Layanan the family picked with their dates", async () => {
    const dasar = await siap({ denganFoto: true });
    browser.store((await server.logIn("pemesan@contoh.id")).session.cookies);
    const pilihan: PilihanPerLayanan = {
      [dasar.layanan.id]: { varianId: dasar.varian.id, teks: "", targetDate: "2026-10-20" },
      [dasar.foto!.layanan.id]: { varianId: dasar.foto!.varian.id, teks: "", targetDate: "2026-10-22" },
    };

    const layanan = layananPetakKosong(await ditawarkan(dasar), pilihan);
    expect(layanan.ditolak).toBeNull();
    const ditampilkan = await totalDitampilkan(dasar, "A-01", layanan.subtotal);
    const tagihan = await tagihanDariPesanan(dasar, "A-01", layanan.item);

    // Each Layanan is a line of its own on the Tagihan, on the date the family picked for it (in the Tagihan's own order).
    const baris = tagihan.lines.filter((line) => line.kind === "layanan");
    expect(baris).toHaveLength(2);
    expect(baris).toEqual(
      expect.arrayContaining([expect.objectContaining({ amount: 400_000, targetDate: "2026-10-20" }), expect.objectContaining({ amount: 150_000, targetDate: "2026-10-22" })]),
    );
    expect(tagihan.total).toBe(ditampilkan);
  });

  it("a Layanan put back to 'Tidak dipesan' is neither on the Tagihan nor in the total shown", async () => {
    const dasar = await siap({ denganFoto: true });
    browser.store((await server.logIn("pemesan@contoh.id")).session.cookies);
    const pilihan: PilihanPerLayanan = {
      [dasar.layanan.id]: { varianId: dasar.varian.id, teks: "", targetDate: "2026-10-20" },
      // Picked and dated first, then put back.
      [dasar.foto!.layanan.id]: { varianId: "", teks: "", targetDate: "2026-10-22" },
    };

    const layanan = layananPetakKosong(await ditawarkan(dasar), pilihan);
    const ditampilkan = await totalDitampilkan(dasar, "A-01", layanan.subtotal);
    const tagihan = await tagihanDariPesanan(dasar, "A-01", layanan.item);

    expect(tagihan.lines.filter((line) => line.kind === "layanan")).toMatchObject([{ amount: 400_000, targetDate: "2026-10-20" }]);
    expect(tagihan.total).toBe(ditampilkan);
  });

  it("a Layanan picked with no date is refused on the screen instead of left out of the order, and with its date it reaches the Tagihan the total promised", async () => {
    const dasar = await siap({ denganFoto: true });
    browser.store((await server.logIn("pemesan@contoh.id")).session.cookies);
    const opsi = await ditawarkan(dasar);
    const bersih = { varianId: dasar.varian.id, teks: "", targetDate: "2026-10-20" };
    const foto = { varianId: dasar.foto!.varian.id, teks: "", targetDate: "" };

    // The Laporan Foto has no date: Kirim is refused in words that name it, so no order goes out without it.
    const tanpaTanggal = layananPetakKosong(opsi, { [dasar.layanan.id]: bersih, [dasar.foto!.layanan.id]: foto });
    expect(tanpaTanggal.ditolak).toContain("Laporan Foto");
    // What the screen adds to the total is what the Tagihan would hold of it: the Pembersihan alone.
    expect(tanpaTanggal.subtotal).toBe(400_000);

    // The family picks the date, and the same two Layanan are sent and priced together.
    const lengkap = layananPetakKosong(opsi, { [dasar.layanan.id]: bersih, [dasar.foto!.layanan.id]: { ...foto, targetDate: "2026-10-22" } });
    expect(lengkap.ditolak).toBeNull();
    const ditampilkan = await totalDitampilkan(dasar, "A-01", lengkap.subtotal);
    const tagihan = await tagihanDariPesanan(dasar, "A-01", lengkap.item);
    expect(tagihan.lines.filter((line) => line.kind === "layanan")).toHaveLength(2);
    expect(tagihan.total).toBe(ditampilkan);
  });

  it("Kirim refuses a Layanan that arrives without its date, in words, and holds no plot for it", async () => {
    const dasar = await siap();
    browser.store((await server.logIn("pemesan@contoh.id")).session.cookies);

    const hasil = await kirimPesananTerencana(draft(dasar, ["A-01"], [{ layananVariantId: dasar.varian.id, targetDate: "", teks: null }]));

    expect(hasil).toEqual({ status: "gagal", message: expect.stringMatching(/\S/) });
    // Nothing was placed: the same plot can still be ordered, without the Layanan.
    expect((await kirimPesananTerencana(draft(dasar, ["A-01"]))).status).toBe("selesai");
  });
});

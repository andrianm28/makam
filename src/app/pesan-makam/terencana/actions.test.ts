/**
 * The Terencana wizard's Kirim, as the Server Action answers it, with Layanan chosen for the empty plot (ticket 53). What the
 * order and its Layanan mean is the Pemesanan module's own tests; this asks that the action carries the choice through.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { adminPlatformOf } from "../../../../tests/support/identity";
import { siapkanOperatorPemesanan, tawarkanLayananDi, unitIds } from "../../../../tests/support/pemesanan";
import { terencanaLokasi } from "../../../../tests/support/terencana";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { kirimPesananTerencana } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

/** A Terencana Lokasi Mitra offering a Pembersihan for an empty plot, built through the same runtime the action uses. */
async function siap() {
  const rt = server.runtime();
  const setup = { ...rt, clock: server.clock, email: server.email() } as never as Parameters<typeof terencanaLokasi>[0] & Parameters<typeof tawarkanLayananDi>[0];
  const { actor: admin } = await adminPlatformOf(setup);
  await siapkanOperatorPemesanan(setup as never);
  const fixture = await terencanaLokasi(setup, admin);
  const { varian } = await tawarkanLayananDi(setup, fixture.lokasiMitra.id, { nama: "Pembersihan Makam", bisaHariH: false, adaDiPetakKosong: true, leadTimeDays: 3, amount: 400_000 });
  const id = await unitIds(setup as never, fixture, ["A-01", "A-02"]);
  return { rt, fixture, varian, id };
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

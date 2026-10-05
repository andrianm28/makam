/**
 * The guide "Pengurusan di TPU DKI" (`/pengurusan-tpu`, ticket 124), read the way a family reads it: the real page on the
 * Layanan and Tariffs modules' own reads and a real Postgres, rendered to static markup. The card "Harga Layanan di TPU DKI"
 * lists the Layanan a DKI TPU offers at their DKI prices (the price list the TPU order itself is priced from), and says
 * "harga contoh" beside each amount while the prices may still be examples (the beta, ticket 112).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUMOPOD_LIVE_BASE_URL } from "@/lib/env";
import { formatRupiah } from "@/lib/rupiah";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { layananOnTestDatabase } from "../../../../tests/support/layanan";
import { HARGA_BUNGA_TABUR, HARGA_PEMBERSIHAN, siapTpu } from "../../../../tests/support/layanan-tpu";
import { testServerRuntime } from "../../../../tests/support/server-runtime";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));

const { default: PengurusanTpuPage } = await import("./page");

const { db, close } = testDatabase();
afterAll(close);
testServerRuntime();
beforeEach(resetDatabase);
afterEach(() => vi.unstubAllEnvs());

/** What the family reads: the markup as plain text, whitespace collapsed. */
const bacaan = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

async function halaman() {
  const html = renderToStaticMarkup(await PengurusanTpuPage());
  return { html, teks: bacaan(html) };
}

/** The card that lists the Layanan prices: from its title to the title of the card after it. */
function kartuHargaLayanan(teks: string) {
  const mulai = teks.indexOf("Harga Layanan di TPU DKI");
  const sampai = teks.indexOf("Tiga jalan masuk lewat Makam.co.id");
  expect(mulai, "the card of the Layanan prices is on the page").toBeGreaterThan(-1);
  expect(sampai, "the card of the three ways in follows it").toBeGreaterThan(mulai);
  return teks.slice(mulai, sampai);
}

describe("Pengurusan di TPU DKI, the DKI Layanan price list", () => {
  it("lists each Layanan a DKI TPU offers with its DKI price, in catalog order, and no longer says Segera hadir", async () => {
    await siapTpu(layananOnTestDatabase(db));

    const kartu = kartuHargaLayanan((await halaman()).teks);

    expect(kartu).toContain("Bunga Tabur");
    expect(kartu).toContain(formatRupiah(HARGA_BUNGA_TABUR));
    expect(kartu).toContain("Pembersihan Makam");
    expect(kartu).toContain(formatRupiah(HARGA_PEMBERSIHAN));
    expect(kartu.indexOf("Bunga Tabur")).toBeLessThan(kartu.indexOf("Pembersihan Makam"));
    expect(kartu).not.toContain("Segera hadir");
    expect(kartu).not.toContain("belum tersedia");
  });

  it("says each Layanan's variant under its name", async () => {
    await siapTpu(layananOnTestDatabase(db));

    const kartu = kartuHargaLayanan((await halaman()).teks);

    // `siapTpu` gives each of its two Layanan one variant, "Reguler".
    expect(kartu.match(/Reguler/g)).toHaveLength(2);
  });

  it("says that one price holds at every DKI TPU and carries no Biaya Layanan Platform", async () => {
    await siapTpu(layananOnTestDatabase(db));

    const kartu = kartuHargaLayanan((await halaman()).teks);

    expect(kartu).toContain("Satu harga untuk semua TPU DKI, tanpa Biaya Layanan Platform.");
  });

  it("labels every amount 'harga contoh' while the prices may still be examples, with a note that says what that means", async () => {
    await siapTpu(layananOnTestDatabase(db));

    const kartu = kartuHargaLayanan((await halaman()).teks);

    expect(kartu).toContain(`${formatRupiah(HARGA_BUNGA_TABUR)} harga contoh`);
    expect(kartu).toContain(`${formatRupiah(HARGA_PEMBERSIHAN)} harga contoh`);
    expect(kartu).toContain("Selama masa uji coba, harga Layanan di atas adalah harga contoh, bukan harga yang berlaku.");
  });

  it("labels no amount once the prices are the Operator's own, on a production paying live", async () => {
    await siapTpu(layananOnTestDatabase(db));
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("RILIS_TERBUKA", "3");
    vi.stubEnv("SUMOPOD_BASE_URL", SUMOPOD_LIVE_BASE_URL);

    const kartu = kartuHargaLayanan((await halaman()).teks);

    expect(kartu).toContain(formatRupiah(HARGA_BUNGA_TABUR));
    expect(kartu).toContain(formatRupiah(HARGA_PEMBERSIHAN));
    expect(kartu).not.toContain("harga contoh");
  });

  it("leads the family from the prices to the order of a Layanan at a DKI TPU", async () => {
    await siapTpu(layananOnTestDatabase(db));

    const { html, teks } = await halaman();

    expect(kartuHargaLayanan(teks)).toContain("Pesan Layanan di TPU DKI");
    expect(html).toContain('href="/layanan/tpu"');
  });

  it("says plainly that no Layanan is offered at a DKI TPU yet, never Segera hadir, when none is", async () => {
    const { teks } = await halaman();

    const kartu = kartuHargaLayanan(teks);
    expect(kartu).toContain("Layanan di TPU DKI belum tersedia.");
    expect(kartu).not.toContain("Segera hadir");
    expect(kartu).not.toContain("harga contoh");
  });
});

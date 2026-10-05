/**
 * Akun Saya's Makam tab, read the way a Pemegang Hak reads it (ticket 120; owner rule C4, 2026-10-05: "Tampilkan juga di
 * Akun Saya"): the card of a Hak Pakai that was extended links its latest Bukti Perpanjangan in its documents, the way it
 * links the Bukti Pemesanan, and the document is served on its own page as every other Bukti is. The real page, signed in
 * with a Kode Masuk to the email recorded on the Hak Pakai, on the modules' read models and a real Postgres, rendered to
 * static markup; the Perpanjangan is made and paid through the module's public functions.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { browser } from "../../../../../tests/support/next-request";
import { akunDenganEmail, hakPakaiSiap, PEMEGANG_HAK, perpanjanganOnTestDatabase, type PerpanjanganSetup } from "../../../../../tests/support/perpanjangan";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => import("../../../../../tests/support/next-request"));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

const { default: AkunMakamPage } = await import("./page");

const { db, close } = testDatabase();
afterAll(close);
// The page reads through the `web` runtime, so it is built on this run's database; the Hak Pakai is made on the same one.
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const QRIS = { kind: "penyedia_pembayaran", channel: "QRIS" } as const;

/** What the family reads: the markup as plain text, whitespace collapsed. */
const bacaan = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** The Pemegang Hak opens the Makam tab, signed in with a Kode Masuk to the email recorded on the Hak Pakai. */
async function tabMakam() {
  browser.reset();
  browser.store((await server.logIn(PEMEGANG_HAK.email)).session.cookies);
  const html = renderToStaticMarkup(await AkunMakamPage());
  return { html, teks: bacaan(html) };
}

/** The holder orders one term of Perpanjangan and anyone pays it: the Hak Pakai is extended and the Bukti Perpanjangan issued. */
async function perpanjang(setup: PerpanjanganSetup, hakPakaiId: string) {
  const dipesan = await setup.perpanjangan.ajukan({ hakPakaiId, terms: 1, pemohon: await akunDenganEmail(setup, PEMEGANG_HAK.email) });
  if (!dipesan.ok) throw new Error(`ajukan refused: ${dipesan.reason}`);
  const [tagihan] = await setup.billing.cariTagihan(dipesan.perpanjangan.tagihan.nomorTagihan);
  const dibayar = await setup.billing.recordPayment(tagihan!.id, { method: QRIS, reference: null });
  if (!dibayar.ok) throw new Error(`payment refused: ${dibayar.reason}`);
}

describe("Akun Saya's Makam tab links the Bukti Perpanjangan of a Hak Pakai that was extended", () => {
  it("shows the card of a Hak Pakai that was never extended with no Bukti Perpanjangan", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);

    const { teks, html } = await tabMakam();

    expect(teks).toContain(fixture.nomorMakam);
    expect(teks).toContain("Perpanjang Makam");
    expect(teks).not.toContain("Bukti Perpanjangan");
    expect(html).not.toContain("BPP/");
  });

  it("links its Bukti Perpanjangan once the Perpanjangan is paid, on the page every Bukti has", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    await perpanjang(setup, fixture.hakPakaiId);
    const bukti = await setup.perpanjangan.buktiPerpanjanganTerbaru(fixture.hakPakaiId);

    const { teks, html } = await tabMakam();

    expect(html).toContain(`href="/dokumen/${bukti!.link}"`);
    expect(teks).toContain(bukti!.nomor);
    expect(teks).toContain("Bukti Perpanjangan");
  });

  it("links only the latest Bukti Perpanjangan after a second Perpanjangan", async () => {
    const setup = perpanjanganOnTestDatabase(db);
    const fixture = await hakPakaiSiap(setup);
    await perpanjang(setup, fixture.hakPakaiId);
    const pertama = await setup.perpanjangan.buktiPerpanjanganTerbaru(fixture.hakPakaiId);
    // Five years on, inside the window of the new end date (2031-10-15).
    setup.clock.set(wib("2031-08-01 10:00"));
    await perpanjang(setup, fixture.hakPakaiId);
    const terbaru = await setup.perpanjangan.buktiPerpanjanganTerbaru(fixture.hakPakaiId);

    const { html } = await tabMakam();

    expect(html).toContain(`href="/dokumen/${terbaru!.link}"`);
    expect(html).not.toContain(pertama!.link);
  });
});

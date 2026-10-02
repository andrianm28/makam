/**
 * Ordering a Perpanjangan from its page with "Tambah Layanan" (Server Action; ticket 53): the action carries the
 * chosen Layanan (one JSON form field) to the Perpanjangan module, which puts them on the same Tagihan. What a
 * Perpanjangan and its Layanan mean is the Perpanjangan module's own tests.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { tawarkanLayananDi } from "../../../../../tests/support/pemesanan";
import { hakPakaiSiap, PEMEGANG_HAK } from "../../../../../tests/support/perpanjangan";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { pesanPerpanjangan } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

/** The place an action redirected to, from the error Next throws for `redirect()`. */
async function tujuan(jalankan: () => Promise<unknown>): Promise<string> {
  try {
    await jalankan();
  } catch (galat) {
    const digest = (galat as { digest?: string }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2]!;
    throw galat;
  }
  throw new Error("the action did not redirect");
}

async function siap() {
  const rt = server.runtime();
  const setup = { ...rt, clock: server.clock, email: server.email() } as never as Parameters<typeof hakPakaiSiap>[0] & Parameters<typeof tawarkanLayananDi>[0];
  const fixture = await hakPakaiSiap(setup);
  const { varian } = await tawarkanLayananDi(setup, fixture.lokasiMitra.id, { nama: "Pembersihan Makam", bisaHariH: false, adaDiPetakKosong: true, leadTimeDays: 3, amount: 400_000 });
  const login = await server.logIn(PEMEGANG_HAK.email);
  browser.store(login.session.cookies);
  return { rt, fixture, varian };
}

/** The Tagihan the action landed on, read the way its public page does. */
async function tagihanDi(rt: ReturnType<typeof server.runtime>, jalan: string) {
  const dokumen = await rt.billing.documentByLink(decodeURIComponent(jalan.split("/")[2]!));
  if (dokumen?.type !== "tagihan") throw new Error("the action did not land on a Tagihan");
  return dokumen.tagihan;
}

const formulir = (hakPakaiId: string, layananJson?: string) => {
  const data = new FormData();
  data.set("hakPakaiId", hakPakaiId);
  data.set("terms", "1");
  if (layananJson !== undefined) data.set("layananJson", layananJson);
  return data;
};

describe("Pesan Perpanjangan with Tambah Layanan (Server Action)", () => {
  it("puts the chosen Layanan on the Perpanjangan's one Tagihan and lands on it", async () => {
    const { rt, fixture, varian } = await siap();
    const lokasi = await tujuan(() => pesanPerpanjangan(formulir(fixture.hakPakaiId, JSON.stringify([{ layananVariantId: varian.id, targetDate: "2026-10-20", teks: null }]))));

    expect(lokasi).toMatch(/^\/dokumen\//);
    const tagihan = await tagihanDi(rt, lokasi);
    expect(tagihan.lines.filter((line) => line.kind === "layanan")).toMatchObject([{ amount: 400_000, targetDate: "2026-10-20" }]);
    expect(tagihan!.lines.filter((line) => line.kind === "biaya_layanan_platform")).toHaveLength(1);
  });

  it("with no Layanan field orders the Perpanjangan alone", async () => {
    const { rt, fixture } = await siap();
    const lokasi = await tujuan(() => pesanPerpanjangan(formulir(fixture.hakPakaiId)));
    expect((await tagihanDi(rt, lokasi)).lines.filter((line) => line.kind === "layanan")).toEqual([]);
  });

  it("sends a Layanan field that is not valid back to the page with a message, and orders nothing", async () => {
    const { fixture } = await siap();
    const lokasi = await tujuan(() => pesanPerpanjangan(formulir(fixture.hakPakaiId, "bukan json")));
    expect(lokasi).toMatch(new RegExp(`^/perpanjangan/${fixture.hakPakaiId}\\?galat=`));
    // Nothing was issued, so the next order is not met by an open Tagihan.
    expect(await tujuan(() => pesanPerpanjangan(formulir(fixture.hakPakaiId)))).toMatch(/^\/dokumen\//);
  });
});

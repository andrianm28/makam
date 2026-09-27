import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { authenticatorCode } from "../../../../../tests/support/totp";
import { simpanHargaDki, tambahLayanan, tandaiBolehDiTpu, tawarkanLayanan } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../tests/support/next-request"));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

/** The first Admin Platform, signed in in this browser and past TOTP. */
async function signInAsAdminPlatform() {
  const { identity } = server.runtime();
  const seeded = await identity.seedFirstAdminPlatform({ email: "admin@makam.co.id", phoneNumber: "081111111111" });
  if (!seeded.ok) throw new Error(`seed refused: ${seeded.reason}`);
  const login = await server.logIn("admin@makam.co.id");
  browser.store(login.session.cookies);
  const actor = async () => (await identity.actorFromCookies(browser.cookieHeader()))!;
  const enrolment = await identity.startTotpEnrolment(await actor());
  if (!enrolment.ok) throw new Error(`enrolment refused: ${enrolment.reason}`);
  const passed = await identity.passTotp(await actor(), authenticatorCode(enrolment.secret, server.clock.now()));
  if (!passed.ok) throw new Error(`TOTP refused: ${passed.reason}`);
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

/** A Layanan in the catalog, typed as the form does. */
const layanan = {
  name: "Pembersihan Makam",
  description: "Membersihkan dan merapikan makam.",
  bukti: "foto_sebelum_dan_sesudah",
  leadTimeDays: "3",
  teksLabel: "",
  varian: "Reguler\nLengkap",
  reason: "",
};

describe("the Katalog Layanan Server Actions", () => {
  it("adds a Layanan with one Pilihan per line, and refuses a name that is already taken", async () => {
    await signInAsAdminPlatform();
    expect(await tambahLayanan({ status: "idle" }, form(layanan))).toEqual({
      status: "berhasil",
      message: "Layanan Pembersihan Makam ditambahkan ke katalog.",
    });
    const katalog = await server.runtime().layanan.katalog();
    expect(katalog[0].varian.map((one) => one.name)).toEqual(["Lengkap", "Reguler"]);

    expect(await tambahLayanan({ status: "idle" }, form({ ...layanan, name: "pembersihan   makam" }))).toEqual({
      status: "gagal",
      message: "Sudah ada nama ini di katalog.",
    });
    expect(await server.runtime().layanan.katalog()).toHaveLength(1);
  });

  it("says which value to fix when the form is not valid, and keeps nothing", async () => {
    await signInAsAdminPlatform();
    expect(await tambahLayanan({ status: "idle" }, form({ ...layanan, leadTimeDays: "-1" }))).toEqual({
      status: "gagal",
      message: "Isi waktu paling awal dalam hari: bilangan bulat dari 0 sampai 365.",
    });
    expect(await tambahLayanan({ status: "idle" }, form({ ...layanan, varian: "  " }))).toEqual({
      status: "gagal",
      message: "Isi sedikit satu Pilihan, satu nama per baris dan tanpa duplikat.",
    });
    expect(await server.runtime().layanan.katalog()).toEqual([]);
  });

  it("a signed-out caller is refused, and the catalog stays empty", async () => {
    expect(await tambahLayanan({ status: "idle" }, form(layanan))).toEqual({
      status: "gagal",
      message: "Sesi Anda sudah berakhir. Silakan masuk lagi.",
    });
    expect(await server.runtime().layanan.katalog()).toEqual([]);
  });

  it("marks a Pilihan for TPU DKI, and takes a new DKI price for it", async () => {
    await signInAsAdminPlatform();
    await tambahLayanan({ status: "idle" }, form({ ...layanan, name: "Batu Nisan", bukti: "foto_sesudah" }));
    const [marmer] = (await server.runtime().layanan.katalog())[0].varian;

    expect(await tandaiBolehDiTpu({ status: "idle" }, form({ layananVariantId: marmer.id, boleh: "true", reason: "" }))).toEqual({
      status: "berhasil",
      message: "Pilihan ini boleh di TPU DKI.",
    });
    expect(await simpanHargaDki(
      { status: "idle" },
      form({ layananVariantId: marmer.id, amount: "600.000", effectiveOn: "2026-10-01", reason: "" }),
    )).toEqual({ status: "berhasil", message: "Harga di TPU DKI Rp 600.000 berlaku mulai 1 Oktober 2026." });
    expect(await server.runtime().tariffs.hargaLayananDki(marmer.id, server.clock.now())).toMatchObject({ amount: 600_000 });
  });

  it("offers a Pilihan at a Lokasi Mitra with that place's price, so the page can show it", async () => {
    await signInAsAdminPlatform();
    const { identity, lokasi } = server.runtime();
    const actor = (await identity.actorFromCookies(browser.cookieHeader()))!;
    const dibuat = await lokasi.createLokasiMitra(actor, {
      name: "Makam Wakaf Al-Ikhlas",
      pengelolaName: "Yayasan Al-Ikhlas",
      address: "Jl. Raya Pondok Rangon No. 1",
      city: "Kota Jakarta Timur",
    });
    if (!dibuat.ok) throw new Error(`Lokasi Mitra refused: ${dibuat.reason}`);
    await tambahLayanan({ status: "idle" }, form(layanan));
    const [reguler] = (await server.runtime().layanan.katalog())[0].varian;

    // A Lokasi Mitra that is not listed offers nothing yet, whatever the switch says.
    expect(
      await tawarkanLayanan(
        { status: "idle" },
        form({ lokasiId: dibuat.lokasiMitra.id, layananVariantId: reguler.id, amount: "500.000", effectiveOn: "2026-10-01", reason: "" }),
      ),
    ).toEqual({ status: "berhasil", message: "Lokasi Mitra ini menawarkan Pilihan itu seharga Rp 500.000 mulai 1 Oktober 2026." });
    expect(await server.runtime().layanan.penawaranLokasi(dibuat.lokasiMitra.id, server.clock.now())).toEqual([]);
    expect(await server.runtime().tariffs.hargaLayananLokasi(dibuat.lokasiMitra.id, reguler.id, server.clock.now())).toMatchObject({
      amount: 500_000,
    });
  });
});

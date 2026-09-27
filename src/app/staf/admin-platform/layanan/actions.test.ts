import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { authenticatorCode } from "../../../../../tests/support/totp";
import { hapusLayanan, simpanHargaDki, tambahLayanan, tandaiBolehDiTpu, tawarkanLayanan } from "./actions";

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

/** Every price version one Lokasi Mitra has for one variant, in entry order. */
function versionsOf(lokasiId: string, layananVariantId: string) {
  return server.runtime()
    .tariffs.hargaLayananLokasiSemuaHistory(lokasiId)
    .then((all) => all.get(layananVariantId) ?? []);
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

/** A Layanan in the catalog, typed as the form does: its kind, and the proof that kind requires. */
const layanan = {
  name: "Pembersihan Makam",
  description: "Membersihkan dan merapikan makam.",
  jenis: "pembersihan",
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

  it("refuses a proof that is not the kind's own, and says which proof the kind takes", async () => {
    await signInAsAdminPlatform();
    // What a stale or tampered form would send for a Pembersihan Makam.
    expect(await tambahLayanan({ status: "idle" }, form({ ...layanan, bukti: "foto_dan_video" }))).toEqual({
      status: "gagal",
      message: "Bukti untuk Pembersihan Makam adalah Foto sebelum dan sesudah; bukti tidak bisa dipilih bebas.",
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
    await tambahLayanan({ status: "idle" }, form({ ...layanan, name: "Batu Nisan", jenis: "nisan", bukti: "foto_sesudah" }));
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

  it("removes a Layanan from the catalog with a reason, and refuses one that is in use", async () => {
    await signInAsAdminPlatform();
    await tambahLayanan({ status: "idle" }, form(layanan));
    const [ditarik] = (await server.runtime().layanan.katalog())[0].varian;
    const actor = (await server.runtime().identity.actorFromCookies(browser.cookieHeader()))!;
    const dibuat = await server.runtime().lokasi.createLokasiMitra(actor, {
      name: "Makam Wakaf Al-Ikhlas",
      pengelolaName: "Yayasan Al-Ikhlas",
      address: "Jl. Raya Pondok Rangon No. 1",
      city: "Kota Jakarta Timur",
    });
    if (!dibuat.ok) throw new Error(`Lokasi Mitra refused: ${dibuat.reason}`);
    await tawarkanLayanan(
      { status: "idle" },
      form({ lokasiId: dibuat.lokasiMitra.id, layananVariantId: ditarik.id, amount: "500.000", effectiveOn: "2026-10-01", reason: "" }),
    );

    const katalog = (await server.runtime().layanan.katalog())[0];
    expect(await hapusLayanan({ status: "idle" }, form({ layananId: katalog.id, reason: "" }))).toEqual({
      status: "gagal",
      message: "Alasan paling banyak 500 huruf.",
    });
    expect(await hapusLayanan({ status: "idle" }, form({ layananId: katalog.id, reason: "Pensiun" }))).toEqual({
      status: "gagal",
      message: "Layanan ini masih dipakai: salah satu Pilihan-nya pernah ditawarkan di sebuah Lokasi Mitra atau masuk sebuah Paket Layanan.",
    });
    expect(await server.runtime().layanan.katalog()).toHaveLength(1);
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

  it("writes nothing at all when the price is refused: no offering, no price, no Entri Audit", async () => {
    await signInAsAdminPlatform();
    const { identity, lokasi, audit } = server.runtime();
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

    // A date that has passed never rewrites a price, so the version is refused.
    expect(
      await tawarkanLayanan(
        { status: "idle" },
        form({ lokasiId: dibuat.lokasiMitra.id, layananVariantId: reguler.id, amount: "500.000", effectiveOn: "2026-09-01", reason: "" }),
      ),
    ).toEqual({ status: "gagal", message: "Tanggal berlaku tidak boleh sebelum hari ini." });

    // Half-offered is the state this must never leave behind: the Lokasi offers
    // nothing, nothing is priced, and neither fact reached the Audit Log.
    const [entry] = await server.runtime().layanan.asStaff(actor).lokasiLayanan(dibuat.lokasiMitra.id, server.clock.now());
    expect(entry.varian.map((one) => [one.name, one.ditawarkan, one.harga])).toEqual([
      ["Lengkap", false, null],
      ["Reguler", false, null],
    ]);
    expect(await versionsOf(dibuat.lokasiMitra.id, reguler.id)).toEqual([]);
    expect(
      (await audit.entriesForLokasi(dibuat.lokasiMitra.id)).filter((entry) => ["layanan.tawarkan", "tarif.ubah_harga_layanan"].includes(entry.action)),
    ).toEqual([]);
  });

  it("writes the price once per submit: one version, one price Entri Audit, however the action is wired", async () => {
    await signInAsAdminPlatform();
    const { identity, lokasi, tariffs, audit } = server.runtime();
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

    // A second submit of the same decision is a new price, not a repeated write of
    // the first one: this is what catches an action that prices on top of a module
    // that already priced.
    const submit = (amount: string, effectiveOn: string) =>
      tawarkanLayanan({ status: "idle" }, form({ lokasiId: dibuat.lokasiMitra.id, layananVariantId: reguler.id, amount, effectiveOn, reason: "" }));

    expect((await submit("500.000", "2026-10-01")).status).toBe("berhasil");
    expect(await versionsOf(dibuat.lokasiMitra.id, reguler.id)).toMatchObject([{ seq: 1, amount: 500_000 }]);
    expect((await audit.entriesForLokasi(dibuat.lokasiMitra.id)).filter((entry) => entry.action === "tarif.ubah_harga_layanan")).toHaveLength(1);

    expect((await submit("550.000", "2026-11-01")).status).toBe("berhasil");
    // Two submits, two versions, two audits: one write each, never four.
    expect(await versionsOf(dibuat.lokasiMitra.id, reguler.id)).toMatchObject([
      { seq: 1, amount: 500_000 },
      { seq: 2, amount: 550_000 },
    ]);
    expect((await audit.entriesForLokasi(dibuat.lokasiMitra.id)).filter((entry) => entry.action === "tarif.ubah_harga_layanan")).toHaveLength(2);
    expect((await audit.entriesForLokasi(dibuat.lokasiMitra.id)).filter((entry) => entry.action === "layanan.tawarkan")).toHaveLength(2);
    expect(await tariffs.hargaLayananLokasi(dibuat.lokasiMitra.id, reguler.id, server.clock.now())).toMatchObject({ amount: 500_000 });
  });
});

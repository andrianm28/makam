/**
 * The confirmation a Wakif reads after filing a Pengajuan Wakaf (`/wakaf-tanah?nomor=<Nomor Pengajuan>`, ticket 124): the
 * real page, signed in as the Wakif, on the Wakaf module's own read and a real Postgres, rendered to static markup.
 *
 * Outside Jabodetabek the Pengajuan is closed as Dirujuk at once, so what the Wakif is told must be that status and the
 * pointer to the local KUA and BWI (spec, Wakaf; story 111). Inside Jabodetabek the confirmation says what it always has.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PETUNJUK_DIRUJUK } from "@/domain/wakaf/skema";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { browser } from "../../../../tests/support/next-request";
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

const { default: WakafTanahPage } = await import("./page");

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const EMAIL = "wakif@contoh.id";
const PENGAJUAN = {
  tujuan: "sosial" as const,
  wakifNama: "Haji Slamet",
  wakifTelepon: "0812 3456 7890",
  hubunganDenganTanah: "Pemilik",
  kabKota: "Kota Depok",
  alamat: "Jl. Raya Sawangan No. 12, Pancoran Mas",
  pin: { lat: -6.4, lng: 106.82 },
  luasM2: 1500,
  jenisBukti: "SHM",
  nazhirNama: "Yayasan Wakaf Al-Ikhlas",
};

/** What the Wakif reads: the markup as plain text, whitespace collapsed. */
const bacaan = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** A Wakif signed in with a Kode Masuk files a Pengajuan for land in `kabKota` and opens its confirmation page. */
async function konfirmasi(kabKota: string) {
  const akun = await server.logIn(EMAIL);
  browser.store(akun.session.cookies);
  const diajukan = await server.runtime().wakaf.ajukanWakaf({ accountId: akun.account.id, email: EMAIL }, { ...PENGAJUAN, kabKota });
  if (!diajukan.ok) throw new Error(`Pengajuan refused: ${diajukan.reason}`);
  const html = renderToStaticMarkup(await WakafTanahPage({ searchParams: Promise.resolve({ nomor: diajukan.nomor }) }));
  return { nomor: diajukan.nomor, status: diajukan.status, teks: bacaan(html) };
}

describe("the confirmation of a Pengajuan Wakaf, for land outside Jabodetabek", () => {
  it("shows the Pengajuan's status, Dirujuk, with the pointer to the local KUA and BWI", async () => {
    const { nomor, status, teks } = await konfirmasi("Kabupaten Sleman");

    expect(status).toBe("dirujuk");
    expect(teks).toContain("Pengajuan wakaf diterima");
    expect(teks).toContain(`Nomor Pengajuan Anda ${nomor}.`);
    expect(teks).toContain("Status: Dirujuk");
    expect(teks).toContain(PETUNJUK_DIRUJUK);
    expect(teks).toContain("Kantor Urusan Agama (KUA)");
    expect(teks).toContain("Badan Wakaf Indonesia (BWI)");
  });

  it("promises no first contact within 3 working days, because a Dirujuk Pengajuan is closed, and says where the news also goes", async () => {
    const { teks } = await konfirmasi("Kota Bandung");

    expect(teks).not.toContain("Tim kami menghubungi Anda dalam 3 hari kerja");
    expect(teks).toContain(`Kabar ini juga kami kirim ke ${EMAIL}.`);
  });

  it("still leads the Wakif to the Wakaf tab of Akun Saya", async () => {
    const { teks } = await konfirmasi("Kabupaten Karawang");

    expect(teks).toContain("Lihat di Akun Saya, tab Wakaf");
  });
});

describe("the confirmation of a Pengajuan Wakaf, for land inside Jabodetabek", () => {
  it("is unchanged: the news by email at every status change and the first contact within 3 working days, with no Dirujuk", async () => {
    const { nomor, status, teks } = await konfirmasi("Kota Depok");

    expect(status).toBe("diajukan");
    expect(teks).toContain("Pengajuan wakaf diterima");
    expect(teks).toContain(`Nomor Pengajuan Anda ${nomor}.`);
    expect(teks).toContain(`Kami mengirim kabar ke ${EMAIL} setiap kali statusnya berubah. Tim kami menghubungi Anda dalam 3 hari kerja.`);
    expect(teks).toContain("Lihat di Akun Saya, tab Wakaf");
    expect(teks).not.toContain("Dirujuk");
    expect(teks).not.toContain("KUA");
    expect(teks).not.toContain("BWI");
  });
});

/**
 * The Mitra Jasa's Pencairan page (`/staf/mitra-jasa/pencairan`), read the way a Mitra Jasa reads it (ticket 55 AC 3, found
 * by the UAT runner audit): the real page, signed in with a Kode Masuk, on the Payouts module's own read and a real Postgres,
 * rendered to static markup. The Pencairan are written through the module's public function, as the Layanan module writes them.
 *
 * A Mitra Jasa sees their own jobs paid for and nothing else: no other Mitra Jasa, no family, no order, no Hak Pakai, no Potongan.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTanggal, wib, wibDateOf } from "@/lib/time/jakarta";
import type { Actor } from "@/domain/identity";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { browser } from "../../../../../tests/support/next-request";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { signInAsAdminPlatform, signInAsMitraJasa } from "../../../../../tests/support/server-sign-in";

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

const { default: PencairanPage } = await import("./page");

const { db, close } = testDatabase();
afterAll(close);
// The page reads through the `web` runtime, so it is built on this run's database; the Pencairan are written on the same one.
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
  server.clock.set(wib("2026-10-01 09:00"));
});

const BUNGA = { layanan: "Layanan – Bunga Tabur (Reguler)", tpu: "TPU Kober", tanggal: "2026-10-05", tarif: 150_001 };
const PEMBERSIHAN = { layanan: "Layanan – Pembersihan Makam (Reguler)", tpu: "TPU Cilincing", tanggal: "2026-10-06", tarif: 400_003 };

/** What the Mitra Jasa reads: the markup as plain text, whitespace collapsed. */
const bacaan = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** The Mitra Jasa opens the page in the browser they are signed in in. */
async function halaman() {
  const html = renderToStaticMarkup(await PencairanPage());
  return { html, teks: bacaan(html) };
}

/**
 * A job approved, recorded the way the Layanan module records it: with the order number a Mitra Jasa must never see, and
 * the end of its Keluhan window, 3×24 h after the approval (which is now).
 */
async function catat(akun: Actor, pekerjaan: { layanan: string; tpu: string; tanggal: string; tarif: number }) {
  return db.transaction(async (tx) => {
    const dibuat = await server.runtime().payouts.catatItemLayananMitraJasa(tx, {
      akunId: akun.accountId,
      nama: "Rina Partial",
      lokasiId: null,
      pekerjaan: `${pekerjaan.layanan} – ${pekerjaan.tpu}`,
      layanan: pekerjaan.layanan,
      tpu: pekerjaan.tpu,
      tanggal: pekerjaan.tanggal,
      tarif: pekerjaan.tarif,
      nomorPemesanan: "MKM-2026-000123",
      jatuhTempoPalingCepat: new Date(server.clock.now().getTime() + 72 * 60 * 60 * 1000),
    });
    if (!dibuat.ok) throw new Error(`item refused: ${dibuat.reason}`);
    return dibuat.id;
  });
}

describe("the Mitra Jasa's Pencairan page", () => {
  it("shows the signed-in Mitra Jasa their Pencairan newest first, each with its status, the Layanan, TPU, date and rate of its job and the total", async () => {
    const admin = await signInAsAdminPlatform(server);
    const rina = await signInAsMitraJasa(server, admin, "rina@contoh.id");
    await catat(rina, BUNGA);
    server.clock.set(wib("2026-10-02 09:00"));
    const baru = await catat(rina, PEMBERSIHAN);
    server.clock.set(wib("2026-10-05 10:00"));
    await db.transaction((tx) => server.runtime().payouts.jadikanJatuhTempo(tx, baru));

    const { teks } = await halaman();

    expect(teks).toContain("Pencairan");
    // The older one waits for its masa keluhan: the earliest it can fall due is the day its 3×24 h end.
    expect(teks).toContain("Belum Jatuh Tempo Jatuh tempo paling cepat 4 Oktober 2026");
    // The newer one fell due: its badge is followed by the date it is to be paid by, the one Admin Platform's Antrean carries.
    const [antrean] = await server.runtime().payouts.pencairanJatuhTempo();
    expect(teks).toContain(`Jatuh Tempo Dibayar paling lambat ${formatTanggal(wibDateOf(antrean.jatuhTempoAt))}`);
    expect(teks).toContain("Layanan – Pembersihan Makam (Reguler) TPU Cilincing · 6 Oktober 2026 Rp 400.003");
    expect(teks).toContain("Layanan – Bunga Tabur (Reguler) TPU Kober · 5 Oktober 2026 Rp 150.001");
    expect(teks).toMatch(/Total Rp 400\.003/);
    expect(teks).toMatch(/Total Rp 150\.001/);
    // The newer job first.
    expect(teks.indexOf("Pembersihan Makam")).toBeLessThan(teks.indexOf("Bunga Tabur"));
    // Paid in full: no Potongan anywhere on the page, and nothing of the order.
    expect(teks).not.toMatch(/potongan|MKM-|hak pakai/i);
  });

  it("shows a held Pencairan as Ditahan with the day it fell due, and a cancelled one as Dibatalkan, and never says why", async () => {
    const admin = await signInAsAdminPlatform(server);
    const rina = await signInAsMitraJasa(server, admin, "rina@contoh.id");
    const ditahan = await catat(rina, BUNGA);
    const dibatalkan = await catat(rina, PEMBERSIHAN);
    server.clock.set(wib("2026-10-05 10:00"));
    await db.transaction((tx) => server.runtime().payouts.jadikanJatuhTempo(tx, ditahan));
    expect(await server.runtime().payouts.tahanPencairan(admin, { itemId: ditahan, alasan: "Foto buktinya diperiksa ulang" })).toMatchObject({ ok: true });
    await db.transaction((tx) => server.runtime().payouts.batalkanItem(tx, { itemId: dibatalkan, alasan: "diganti_pelaksana" }));

    const { teks } = await halaman();

    expect(teks).toContain("Ditahan Jatuh tempo sejak 5 Oktober 2026");
    expect(teks).toContain("Dibatalkan 5 Oktober 2026");
    expect(teks).not.toMatch(/diperiksa|diganti/);
    // A cancelled Pencairan is on this page, so the page cannot say that a Pencairan is beyond cancelling.
    expect(teks).not.toContain("tidak lagi bisa dibatalkan");
  });

  it("shows only their own Pencairan: another Mitra Jasa's jobs, TPU and rates are nowhere on it", async () => {
    const admin = await signInAsAdminPlatform(server);
    const budi = await signInAsMitraJasa(server, admin, "budi@contoh.id");
    await catat(budi, PEMBERSIHAN);
    const rina = await signInAsMitraJasa(server, admin, "rina@contoh.id");
    await catat(rina, BUNGA);

    const { teks } = await halaman();

    expect(teks).toContain("Bunga Tabur");
    expect(teks).not.toContain("Pembersihan Makam");
    expect(teks).not.toContain("TPU Cilincing");
    expect(teks).not.toContain("400.003");
  });

  it("says there is nothing yet, and what will appear, for a Mitra Jasa with no Pencairan", async () => {
    const admin = await signInAsAdminPlatform(server);
    await signInAsMitraJasa(server, admin, "rina@contoh.id");

    const { teks } = await halaman();

    expect(teks).toContain("Belum ada Pencairan");
    expect(teks).not.toContain("Total");
  });

  it("is still read by a Ditangguhkan Mitra Jasa, who keeps their history and what they are owed", async () => {
    const admin = await signInAsAdminPlatform(server);
    const dibuat = await server.runtime().layanan.buatMitraJasa(admin, "rina@contoh.id", {
      namaLengkap: "Rina Partial",
      nik: "3201014503900001",
      area: "Jakarta Timur",
      kontakSiagaNama: null,
      kontakSiagaTelepon: null,
    });
    if (!dibuat.ok) throw new Error(dibuat.reason);
    const rina = await signInAsMitraJasa(server, admin, "rina@contoh.id");
    await catat(rina, BUNGA);
    const ditangguhkan = await server.runtime().layanan.ubahStatus(admin, dibuat.mitraJasaId, { status: "ditangguhkan", alasan: "Keluhan upheld dua kali" });
    expect(ditangguhkan).toMatchObject({ ok: true });
    browser.reset();
    browser.store((await server.logIn("rina@contoh.id")).session.cookies);

    const { teks } = await halaman();

    expect(teks).toContain("Layanan – Bunga Tabur (Reguler) TPU Kober · 5 Oktober 2026 Rp 150.001");
  });

  it("turns away an Akun that is not a Mitra Jasa, and a visitor who has not signed in", async () => {
    await signInAsAdminPlatform(server);
    await expect(PencairanPage()).rejects.toThrow("redirect /staf");

    browser.reset();
    await expect(PencairanPage()).rejects.toThrow("redirect /masuk");
  });
});


import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_POLICIES } from "@/domain/lokasi";
import { browser } from "../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform } from "../../../../../tests/support/server-sign-in";
import { simpanKebijakan, simpanProfil, simpanRekening, unggahPerjanjian } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../tests/support/next-request"));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
  vi.restoreAllMocks();
});

function form(values: Record<string, string | Blob>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

async function newLokasiMitra() {
  const admin = await signInAsAdminPlatform(server);
  const created = await server.runtime().lokasi.createLokasiMitra(admin, {
    name: "Makam Wakaf Al-Ikhlas",
    pengelolaName: "Yayasan Al-Ikhlas",
    address: "Jl. Raya Pondok Rangon No. 1",
    city: "Kota Jakarta Timur",
  });
  if (!created.ok) throw new Error(created.reason);
  return { admin, lokasiId: created.lokasiMitra.id };
}

const idle = { status: "idle" } as const;

describe("Lokasi Mitra Server Actions", () => {
  it("Simpan kebijakan: a request that switches Pemesanan Terencana on is refused with why, and nothing changes", async () => {
    const { admin, lokasiId } = await newLokasiMitra();
    const policies = Object.fromEntries(Object.entries(DEFAULT_POLICIES).map(([name, value]) => [name, String(value)]));

    const state = await simpanKebijakan(
      idle,
      form({ lokasiId, ...policies, pemesananTerencanaAktif: "ya", tumpangMinYears: "3", tumpangMaxLayers: "2" }),
    );

    expect(state).toEqual({ status: "gagal", message: expect.stringContaining("Tersedia setelah Denah dan Cek Denah") });
    expect(await server.runtime().lokasi.lokasiMitra(admin, lokasiId)).toMatchObject({
      lokasiMitra: { flags: { pemesananTerencanaAktif: false } },
    });
  });

  it("Unggah perjanjian: when the FileStore fails to store the scan, the message says so plainly and names no ticket", async () => {
    const { lokasiId } = await newLokasiMitra();
    vi.spyOn(server.runtime().adapters.files, "put").mockRejectedValue(new Error("FileStore (S3) not configured"));

    const state = await unggahPerjanjian(
      idle,
      form({
        lokasiId,
        scan: new File(["%PDF-1.7\n%%EOF\n"], "perjanjian.pdf", { type: "application/pdf" }),
        signedOn: "2026-09-20",
      }),
    );

    expect(state).toEqual({
      status: "gagal",
      message: expect.stringContaining("Penyimpanan berkas sedang bermasalah"),
    });
    if (state.status !== "idle") expect(state.message).not.toMatch(/tiket|S3/i);
  });

  it("Simpan rekening: Admin Platform saves the bank account; that Lokasi's Admin Lokasi is refused", async () => {
    const { admin, lokasiId } = await newLokasiMitra();
    const typed = { lokasiId, bankName: "BSI", accountNumber: "7123 4567 89", accountHolder: "Yayasan Al-Ikhlas", reason: "" };

    expect(await simpanRekening(idle, form(typed))).toEqual({ status: "berhasil", message: "Rekening tersimpan." });
    await signInAsAdminLokasi(server, admin, lokasiId);
    expect(await simpanRekening(idle, form({ ...typed, accountNumber: "9999999999" }))).toEqual({
      status: "gagal",
      message: "Anda tidak berwenang melakukan ini.",
    });

    expect(await server.runtime().lokasi.lokasiMitra(admin, lokasiId)).toMatchObject({
      lokasiMitra: { bankAccount: { bankName: "BSI", accountNumber: "7123456789", accountHolder: "Yayasan Al-Ikhlas" } },
    });
  });

  it("Simpan profil: Admin Platform records the pengelola's phone and email; a malformed email is refused with nothing changed", async () => {
    const { admin, lokasiId } = await newLokasiMitra();
    const typed = {
      lokasiId,
      name: "Makam Wakaf Al-Ikhlas",
      pengelolaName: "Yayasan Al-Ikhlas",
      address: "Jl. Raya Pondok Rangon No. 1",
      city: "Kota Jakarta Timur",
      pengelolaTelepon: "0812 3456 7890",
      pengelolaEmail: "rahmat@example.com",
    };

    expect(await simpanProfil(idle, form(typed))).toEqual({ status: "berhasil", message: "Profil tersimpan." });
    expect((await simpanProfil(idle, form({ ...typed, pengelolaEmail: "bukan-email", pengelolaTelepon: "" }))).status).toBe("gagal");

    expect(await server.runtime().lokasi.lokasiMitra(admin, lokasiId)).toMatchObject({
      lokasiMitra: { pengelolaTelepon: "+6281234567890", pengelolaEmail: "rahmat@example.com" },
    });
  });
});

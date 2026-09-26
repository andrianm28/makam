import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_JAM_OPERASIONAL } from "@/domain/lokasi";
import { browser } from "../../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform } from "../../../../../../tests/support/server-sign-in";
import { pilihKontakSiaga, simpanJamOperasional } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../../tests/support/next-request"));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

async function lokasiWithAdminLokasi() {
  const admin = await signInAsAdminPlatform(server);
  const created = await server.runtime().lokasi.createLokasiMitra(admin, {
    name: "Makam Wakaf Al-Ikhlas",
    pengelolaName: "Yayasan Al-Ikhlas",
    address: "Jl. Raya Pondok Rangon No. 1",
    city: "Kota Jakarta Timur",
  });
  if (!created.ok) throw new Error(created.reason);
  const lokasiId = created.lokasiMitra.id;
  const adminLokasi = await signInAsAdminLokasi(server, admin, lokasiId);
  return { admin, adminLokasi, lokasiId };
}

const idle = { status: "idle" } as const;

/** The Jam Operasional form as typed: Monday–Friday 08:00–16:00, Saturday 08:00–12:00, Sunday closed. */
function typedHours(lokasiId: string, closures = "") {
  const fields: Record<string, string> = { lokasiId, closures };
  for (const weekday of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
    Object.assign(fields, { [`${weekday}Open`]: "ya", [`${weekday}Opens`]: "08:00", [`${weekday}Closes`]: "16:00" });
  }
  Object.assign(fields, { saturdayOpen: "ya", saturdayOpens: "08:00", saturdayCloses: "12:00", sundayOpens: "", sundayCloses: "" });
  return fields;
}

describe("Jam Operasional Server Actions", () => {
  it("Simpan Jam Operasional: the Admin Lokasi saves weekly hours and dated closures typed one per line", async () => {
    const { adminLokasi, lokasiId } = await lokasiWithAdminLokasi();

    const state = await simpanJamOperasional(idle, form(typedHours(lokasiId, "2026-12-25 Natal\n\n2026-10-10\n")));

    expect(state).toEqual({ status: "berhasil", message: "Jam Operasional tersimpan." });
    expect(await server.runtime().lokasi.jamOperasional(adminLokasi, lokasiId)).toMatchObject({
      jamOperasional: {
        weekly: { monday: { opens: "08:00", closes: "16:00" }, saturday: { opens: "08:00", closes: "12:00" }, sunday: null },
        closures: [
          { date: "2026-10-10", note: "" },
          { date: "2026-12-25", note: "Natal" },
        ],
      },
    });
  });

  it("Simpan Jam Operasional: a closure line without a date, or a close before the opening, is refused with why, and nothing changes", async () => {
    const { adminLokasi, lokasiId } = await lokasiWithAdminLokasi();

    expect(await simpanJamOperasional(idle, form(typedHours(lokasiId, "Natal 25 Desember")))).toEqual({
      status: "gagal",
      message: expect.stringContaining("satu tanggal per baris"),
    });
    expect(await simpanJamOperasional(idle, form({ ...typedHours(lokasiId), mondayOpens: "17:00" }))).toEqual({
      status: "gagal",
      message: expect.stringContaining("jam buka harus sebelum jam tutup"),
    });
    expect(await server.runtime().lokasi.jamOperasional(adminLokasi, lokasiId)).toEqual({
      ok: true,
      jamOperasional: DEFAULT_JAM_OPERASIONAL,
    });
  });

  it("Pilih Kontak Siaga: the Admin Lokasi picks one of its Lokasi's Admin Lokasi; anyone else is refused with why", async () => {
    const { admin, adminLokasi, lokasiId } = await lokasiWithAdminLokasi();

    expect(await pilihKontakSiaga(idle, form({ lokasiId, accountId: adminLokasi.accountId }))).toEqual({
      status: "berhasil",
      message: "Kontak Siaga tersimpan.",
    });
    expect(await pilihKontakSiaga(idle, form({ lokasiId, accountId: admin.accountId }))).toEqual({
      status: "gagal",
      message: "Kontak Siaga harus salah satu Admin Lokasi di Lokasi ini.",
    });
    expect(await server.runtime().lokasi.kontakSiagaOf(lokasiId)).toMatchObject({ accountId: adminLokasi.accountId });
  });
});

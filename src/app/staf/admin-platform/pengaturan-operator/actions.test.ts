import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { simpanPengaturanOperator } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => import("../../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

/** The first Admin Platform, signed in in this browser. */
async function signInAsAdminPlatform() {
  const { identity } = server.runtime();
  const seeded = await identity.seedFirstAdminPlatform({ email: "admin@makam.co.id", phoneNumber: "081111111111" });
  if (!seeded.ok) throw new Error(`seed refused: ${seeded.reason}`);
  const login = await server.logIn("admin@makam.co.id");
  browser.store(login.session.cookies);
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe("Simpan Pengaturan Operator (Server Action)", () => {
  it("a refused save says which value to fix and keeps nothing, leaving the form to keep what was typed", async () => {
    await signInAsAdminPlatform();
    const typed = {
      legalName: "PT Jaya Korpora Prima",
      address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
      phone: "(021) 555-0101",
      email: "halo@makam.co.id",
      csWhatsApp: "0811",
      csReplyHours: "dibalas mulai pukul 06:00",
      reason: "Isian awal",
    };

    const state = await simpanPengaturanOperator({ status: "idle" }, form(typed));

    expect(state).toEqual({ status: "gagal", message: expect.stringContaining("Nomor WhatsApp CS") });
    expect(await server.runtime().operatorSettings.current()).toBeNull();
  });

  it("a refused save needs a value, and says which one by the name its field carries", async () => {
    await signInAsAdminPlatform();
    const kosong = {
      legalName: "PT Jaya Korpora Prima",
      address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
      phone: "(021) 555-0101",
      email: "halo@makam.co.id",
      csWhatsApp: "08115550101",
      csReplyHours: "",
      reason: "Isian awal",
    };

    expect(await simpanPengaturanOperator({ status: "idle" }, form(kosong))).toEqual({
      status: "gagal",
      message: "Jam balas CS wajib diisi.",
    });
  });

  it("saves the bank account a large Tagihan is transferred to, and says when only part of it is filled in", async () => {
    await signInAsAdminPlatform();
    const isian = {
      legalName: "PT Jaya Korpora Prima",
      address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
      phone: "(021) 555-0101",
      email: "halo@makam.co.id",
      csWhatsApp: "08115550101",
      csReplyHours: "dibalas mulai pukul 06:00",
      rekeningBank: "Bank Central Asia (BCA)",
      rekeningNomor: "",
      rekeningAtasNama: "PT Jaya Korpora Prima",
      reason: "Rekening transfer",
    };

    expect(await simpanPengaturanOperator({ status: "idle" }, form(isian))).toEqual({
      status: "gagal",
      message: expect.stringContaining("Rekening transfer"),
    });
    expect(await simpanPengaturanOperator({ status: "idle" }, form({ ...isian, rekeningNomor: "1234567890" }))).toMatchObject({
      status: "berhasil",
    });
    expect((await server.runtime().operatorSettings.current())?.rekening).toEqual({
      bank: "Bank Central Asia (BCA)",
      nomor: "1234567890",
      atasNama: "PT Jaya Korpora Prima",
    });
  });
});

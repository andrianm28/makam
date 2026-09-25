import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { authenticatorCode } from "../../../../../tests/support/totp";
import { simpanPengaturanOperator } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../tests/support/next-request"));

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
  const seeded = await identity.seedFirstAdminPlatform({ phoneNumber: "081111111111", email: "admin@makam.co.id" });
  if (!seeded.ok) throw new Error(`seed refused: ${seeded.reason}`);
  const login = await server.logIn("081111111111");
  browser.store(login.session.cookies);
  const actor = async () => (await identity.actorFromCookies(browser.cookieHeader()))!;
  const enrolment = await identity.startTotpEnrolment(await actor());
  if (!enrolment.ok) throw new Error(`enrolment refused: ${enrolment.reason}`);
  const passed = await identity.passTotp(await actor(), authenticatorCode(enrolment.secret, new Date()));
  if (!passed.ok) throw new Error(`TOTP refused: ${passed.reason}`);
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

describe("Simpan Pengaturan Operator (Server Action)", () => {
  it("a refused save hands back what was typed, so the form keeps it for the one fix", async () => {
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

    expect(state).toEqual({ status: "gagal", message: expect.stringContaining("Nomor WhatsApp CS"), typed });
    expect(await server.runtime().operatorSettings.current()).toBeNull();
  });
});

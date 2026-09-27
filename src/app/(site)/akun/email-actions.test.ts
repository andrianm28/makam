import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeEmailSender } from "@/adapters/memory";
import { initialEmailProfileState, initialEmailRequestState } from "@/components/email/state";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { browser } from "../../../../tests/support/next-request";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { kirimKodeVerifikasi, simpanNomorTelepon } from "./email-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));
vi.mock("next/cache", () => ({ refresh: () => {} }));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("Verifikasi email in Akun Saya (Server Action)", () => {
  it("shows gagal kirim when EmailSender refuses, and the Akun's Email Terverifikasi is unchanged", async () => {
    const login = await server.logIn("sari@contoh.id");
    browser.store(login.session.cookies);
    const email = server.runtime().adapters.email as FakeEmailSender;

    email.failNextSend();
    browser.setHeader("x-real-ip", "203.0.113.60");
    const refused = await kirimKodeVerifikasi(initialEmailRequestState, form({ email: "baru@contoh.id" }));

    expect(refused).toEqual({ status: "gagal", message: "Kode belum bisa dikirim lewat email. Silakan coba lagi." });
    expect(await server.runtime().identity.actorFromCookies(browser.cookieHeader())).toMatchObject({ email: "sari@contoh.id" });
  });
});

describe("the phone number in Akun Saya (Server Action)", () => {
  it("saves a +62 number in its canonical form, and refuses a foreign one", async () => {
    const login = await server.logIn("sari@contoh.id");
    browser.store(login.session.cookies);

    expect(await simpanNomorTelepon(initialEmailProfileState, form({ phoneNumber: "0812-3456-7890" }))).toEqual({
      status: "berhasil",
      message: "Nomor telepon disimpan: +6281234567890.",
    });
    expect(await simpanNomorTelepon(initialEmailProfileState, form({ phoneNumber: "+65 9123 4567" }))).toEqual({
      status: "gagal",
      message: "Gunakan nomor telepon Indonesia (+62).",
    });
    expect(await server.runtime().identity.actorFromCookies(browser.cookieHeader())).toMatchObject({
      phoneNumber: "+6281234567890",
    });
  });
});

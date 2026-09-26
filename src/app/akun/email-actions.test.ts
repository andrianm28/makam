import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeEmailSender } from "@/adapters/memory";
import { initialEmailRequestState } from "@/components/email/state";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { browser } from "../../../tests/support/next-request";
import { testServerRuntime } from "../../../tests/support/server-runtime";
import { kirimKodeVerifikasi } from "./email-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../tests/support/next-request"));
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

describe("Verifikasi Email in Akun Saya (Server Action)", () => {
  it("shows gagal kirim when EmailSender refuses, and the Akun's email is unchanged", async () => {
    const login = await server.logIn("081234567890");
    browser.store(login.session.cookies);
    const email = server.runtime().adapters.email as FakeEmailSender;

    email.failNextSend();
    browser.setHeader("x-real-ip", "203.0.113.60");
    const refused = await kirimKodeVerifikasi(initialEmailRequestState, form({ email: "sari@contoh.id" }));

    expect(refused).toEqual({ status: "gagal", message: "Kode belum bisa dikirim lewat email. Silakan coba lagi." });
    const actor = await server.runtime().identity.actorFromCookies(browser.cookieHeader());
    expect(await server.runtime().identity.accountEmail(actor!)).toEqual({ email: null, verified: false });
  });
});

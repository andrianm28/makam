import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import type { FakeEmailSender } from "@/adapters/memory";
import { EmailSendError } from "@/ports/email-sender";
import { initialKodeMasukRequestState } from "@/components/kode-masuk/state";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { lastEmailCodeTo } from "../../../../tests/support/identity";
import { browser } from "../../../../tests/support/next-request";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { kirimKodeMasuk, masukDenganKodeMasuk } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));

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

/** The reply without what differs by construction (the address typed). */
function shapeOf(state: unknown) {
  const rest: Record<string, unknown> = { ...(state as Record<string, unknown>) };
  delete rest.email;
  return rest;
}

/** Runs a Server Action that ends in redirect(); returns where it went. */
async function redirectOf(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    if (isRedirectError(error)) return String((error as { digest: string }).digest);
    throw error;
  }
  throw new Error("no redirect");
}

describe("Masuk with a Kode Masuk (Server Actions)", () => {
  it("the reply is the same for an Akun's Email Terverifikasi and an unknown email", async () => {
    await server.logIn("sari@contoh.id");
    server.clock.advance({ minutes: 1 });

    browser.setHeader("x-real-ip", "203.0.113.10");
    const known = await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: " Sari@Contoh.id " }));
    browser.setHeader("x-real-ip", "203.0.113.11");
    const unknown = await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "siapa@contoh.id" }));

    expect(known).toMatchObject({ status: "terkirim", email: "sari@contoh.id", resendInSeconds: 60 });
    expect(shapeOf(unknown)).toEqual(shapeOf(known));
  });

  it("counts per IP from X-Real-IP (set by nginx): a second request from it within 60 s is refused", async () => {
    browser.setHeader("x-real-ip", "203.0.113.20");
    await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "satu@contoh.id" }));

    expect(await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "dua@contoh.id" }))).toMatchObject({
      status: "gagal",
      message: expect.stringContaining("Kode baru bisa dikirim"),
    });
    browser.setHeader("x-real-ip", "203.0.113.21");
    expect(await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "dua@contoh.id" }))).toMatchObject({
      status: "terkirim",
    });
  });

  it("when the EmailSender refuses, says gagal kirim; a retry at once goes out", async () => {
    const email = server.runtime().adapters.email as FakeEmailSender;
    email.failNextSend();
    browser.setHeader("x-real-ip", "203.0.113.30");

    expect(await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "sari@contoh.id" }))).toEqual({
      status: "gagal",
      message: "Kode belum bisa dikirim lewat email. Silakan coba lagi.",
      email: "sari@contoh.id",
    });
    expect(await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "sari@contoh.id" }))).toMatchObject({
      status: "terkirim",
    });
  });

  it.each([
    ["the relay refuses the recipient", () => new EmailSendError("rejected", { code: "EENVELOPE", responseCode: 550 })],
    ["the relay cannot be reached", () => new EmailSendError("unavailable", { code: "ETIMEDOUT" })],
    ["the sender fails with something that is no EmailSendError", () => new TypeError("boom")],
  ])("when %s, Kirim says gagal kirim, sends once with no automatic retry, and a resend after it goes out", async (_name, makeError) => {
    const email = server.runtime().adapters.email as FakeEmailSender;
    const before = email.sent.length;
    const send = vi.spyOn(email, "send").mockRejectedValueOnce(makeError());
    browser.setHeader("x-real-ip", "203.0.113.60");

    const failed = await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "keluarga@contoh.makam.invalid" }));
    server.clock.advance({ minutes: 5 });

    expect(failed).toMatchObject({ status: "gagal", message: "Kode belum bisa dikirim lewat email. Silakan coba lagi." });
    expect(send).toHaveBeenCalledTimes(1);
    expect(email.sent).toHaveLength(before);
    expect(await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "keluarga@contoh.makam.invalid" }))).toMatchObject({
      status: "terkirim",
    });
    expect(email.sent).toHaveLength(before + 1);
  });

  it("the Kode Masuk to a new email creates the Akun, signs it in and lands on Akun Saya", async () => {
    const email = server.runtime().adapters.email as FakeEmailSender;
    browser.setHeader("x-real-ip", "203.0.113.40");
    await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "sari@contoh.id" }));

    const landing = await redirectOf(() =>
      masukDenganKodeMasuk({ status: "idle" }, form({ email: "sari@contoh.id", code: lastEmailCodeTo(email, "sari@contoh.id") ?? "" })),
    );

    expect(landing).toContain("/akun");
    expect(await server.runtime().identity.actorFromCookies(browser.cookieHeader())).toMatchObject({
      email: "sari@contoh.id",
      roles: ["pemesan"],
    });
  });

  it("a wrong Kode Masuk is refused with the glossary words", async () => {
    browser.setHeader("x-real-ip", "203.0.113.50");
    await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "sari@contoh.id" }));
    const sent = lastEmailCodeTo(server.runtime().adapters.email as FakeEmailSender, "sari@contoh.id");
    const wrong = sent === "000000" ? "111111" : "000000";

    expect(await masukDenganKodeMasuk({ status: "idle" }, form({ email: "sari@contoh.id", code: wrong }))).toEqual({
      status: "gagal",
      message: "Kode salah. Periksa lagi kode di email Anda.",
    });
    expect(await masukDenganKodeMasuk({ status: "idle" }, form({ email: "sari@contoh.id", code: "12" }))).toEqual({
      status: "gagal",
      message: "Masukkan 6 angka Kode Masuk dari email Anda.",
    });
  });
});

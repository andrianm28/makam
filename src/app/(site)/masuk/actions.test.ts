import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import type { FakeEmailSender } from "@/adapters/memory";
import { liveSenderFor, startTestSmtpRelay } from "../../../../tests/support/smtp-relay";
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
  ])("when %s, Kirim says gagal kirim, no Kode Masuk goes out later by itself, and a resend after it goes out", async (_name, makeError) => {
    const email = server.runtime().adapters.email as FakeEmailSender;
    const before = email.sent.length;
    const failing = vi.spyOn(email, "send").mockRejectedValueOnce(makeError());
    browser.setHeader("x-real-ip", "203.0.113.60");
    try {
      const failed = await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "keluarga@contoh.makam.invalid" }));
      expect(failed).toMatchObject({ status: "gagal", message: "Kode belum bisa dikirim lewat email. Silakan coba lagi." });
    } finally {
      failing.mockRestore();
    }

    // No retry on its own: a day later (past any retry window) still nothing has been sent.
    server.clock.advance({ hours: 24 });
    expect(email.sent).toHaveLength(before);
    expect(await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "keluarga@contoh.makam.invalid" }))).toMatchObject({
      status: "terkirim",
    });
    expect(email.sent).toHaveLength(before + 1);
  });

  it("with the live SMTP adapter against a relay that refuses the recipient, Kirim says gagal kirim and nothing reaches the process", async () => {
    const relay = await startTestSmtpRelay();
    const stray: unknown[] = [];
    let send: { mockRestore(): void } | undefined;
    const onStray = (error: unknown) => stray.push(error);
    process.on("uncaughtException", onStray);
    process.on("unhandledRejection", onStray);
    try {
      const live = liveSenderFor(relay);
      const email = server.runtime().adapters.email as FakeEmailSender;
      send = vi.spyOn(email, "send").mockImplementation((message) => live.send(message));
      relay.refuseNextRecipient();
      browser.setHeader("x-real-ip", "203.0.113.70");

      expect(await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "uji98.repro@contoh.id" }))).toMatchObject({
        status: "gagal",
        message: "Kode belum bisa dikirim lewat email. Silakan coba lagi.",
      });
      // The relay's close resolves only once its SMTP session has ended, so nothing is still in flight when we look.
      await relay.close();
      await new Promise((resolve) => setImmediate(resolve));
      expect(stray).toEqual([]);
    } finally {
      process.off("uncaughtException", onStray);
      process.off("unhandledRejection", onStray);
      send?.mockRestore();
      await relay.close(); // a second close is harmless; this one runs when an assertion above failed
    }
  });

  it("with the live SMTP adapter, an address that cannot receive mail gets gagal kirim, not terkirim, though the relay would take it", async () => {
    // The staging relay accepts a message for a `.invalid` address and bounces it later, so Kirim used to say "terkirim".
    const relay = await startTestSmtpRelay();
    let send: { mockRestore(): void } | undefined;
    try {
      const live = liveSenderFor(relay);
      const email = server.runtime().adapters.email as FakeEmailSender;
      send = vi.spyOn(email, "send").mockImplementation((message) => live.send(message));
      browser.setHeader("x-real-ip", "203.0.113.71");
      expect(await kirimKodeMasuk(initialKodeMasukRequestState, form({ email: "keluarga@contoh.makam.invalid" }))).toMatchObject({
        status: "gagal",
        message: "Kode belum bisa dikirim lewat email. Silakan coba lagi.",
      });
      expect(relay.accepted).toEqual([]);
    } finally {
      send?.mockRestore();
      await relay.close();
    }
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

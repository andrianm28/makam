import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import type { FakeEmailSender } from "@/adapters/memory";
import { initialEmailRequestState } from "@/components/email/state";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { lastEmailCodeTo } from "../../../tests/support/identity";
import { browser } from "../../../tests/support/next-request";
import { testServerRuntime } from "../../../tests/support/server-runtime";
import { kirimKodeEmail, masukDenganEmail } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const REPLY = "Jika email ini terdaftar dan terverifikasi, kode sudah kami kirim.";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

/** A Pemesan whose Akun has `address` as its Email Terverifikasi, made through the identity module. */
async function pemesanWithEmailTerverifikasi(phoneNumber: string, address: string) {
  const { identity, adapters } = server.runtime();
  const login = await server.logIn(phoneNumber);
  const actor = await identity.actorFromCookies(login.session.cookies.map((c) => `${c.name}=${c.value}`).join("; "));
  if (!actor) throw new Error("not signed in");
  await identity.requestEmailVerification(actor, { email: address, ip: "192.0.2.250" });
  const code = lastEmailCodeTo(adapters.email as FakeEmailSender, address);
  const confirmed = await identity.confirmEmailVerification(actor, { code: code ?? "" });
  if (!confirmed.ok) throw new Error(confirmed.reason);
  // The next code to this address is past the 60 s resend wait.
  server.clock.advance({ minutes: 1 });
}

/** The reply without what differs by construction (the address typed, the moment it was sent). */
function shapeOf(state: unknown) {
  const rest: Record<string, unknown> = { ...(state as Record<string, unknown>) };
  delete rest.email;
  delete rest.sentAt;
  return rest;
}

describe("Masuk dengan email (Server Actions)", () => {
  it("the email step gives the same reply for an Email Terverifikasi, an unknown email and an email only typed in", async () => {
    await pemesanWithEmailTerverifikasi("081234567890", "sari@contoh.id");
    const email = server.runtime().adapters.email as FakeEmailSender;

    browser.setHeader("x-real-ip", "203.0.113.10");
    const verified = await kirimKodeEmail(initialEmailRequestState, form({ email: " Sari@Contoh.id " }));
    browser.setHeader("x-real-ip", "203.0.113.11");
    const unknown = await kirimKodeEmail(initialEmailRequestState, form({ email: "siapa@contoh.id" }));

    expect(verified).toMatchObject({ status: "terkirim", email: "sari@contoh.id", message: REPLY, resendInSeconds: 60 });
    expect(shapeOf(unknown)).toEqual(shapeOf(verified));
    expect(email.sent.at(-1)).toMatchObject({ to: "sari@contoh.id" });
  });

  it("the email step counts per IP from X-Real-IP (set by nginx): a second request from it within 60 s is refused", async () => {
    browser.setHeader("x-real-ip", "203.0.113.20");
    await kirimKodeEmail(initialEmailRequestState, form({ email: "satu@contoh.id" }));

    expect(await kirimKodeEmail(initialEmailRequestState, form({ email: "dua@contoh.id" }))).toMatchObject({
      status: "gagal",
      message: expect.stringContaining("Kode baru bisa dikirim"),
    });
    browser.setHeader("x-real-ip", "203.0.113.21");
    expect(await kirimKodeEmail(initialEmailRequestState, form({ email: "dua@contoh.id" }))).toMatchObject({
      status: "terkirim",
    });
  });

  it("when EmailSender refuses, the email step still gives the same reply", async () => {
    await pemesanWithEmailTerverifikasi("081234567890", "sari@contoh.id");
    const email = server.runtime().adapters.email as FakeEmailSender;
    browser.setHeader("x-real-ip", "203.0.113.30");
    const normal = await kirimKodeEmail(initialEmailRequestState, form({ email: "lain@contoh.id" }));

    const sends = email.sent.length;
    email.failNextSend();
    browser.setHeader("x-real-ip", "203.0.113.31");
    const refused = await kirimKodeEmail(initialEmailRequestState, form({ email: "sari@contoh.id" }));

    expect(shapeOf(refused)).toEqual(shapeOf(normal));
    expect(email.sent).toHaveLength(sends);
    // The refused send counted against no limit of the email: a retry at once goes out.
    browser.setHeader("x-real-ip", "203.0.113.32");
    await kirimKodeEmail(initialEmailRequestState, form({ email: "sari@contoh.id" }));
    expect(email.sent.at(-1)).toMatchObject({ to: "sari@contoh.id" });
  });

  it("the Kode Masuk from the email signs the Pemesan in and lands on Akun Saya", async () => {
    await pemesanWithEmailTerverifikasi("081234567890", "sari@contoh.id");
    const email = server.runtime().adapters.email as FakeEmailSender;
    browser.setHeader("x-real-ip", "203.0.113.40");
    await kirimKodeEmail(initialEmailRequestState, form({ email: "sari@contoh.id" }));

    let thrown: unknown;
    try {
      await masukDenganEmail({ status: "idle" }, form({ email: "sari@contoh.id", code: lastEmailCodeTo(email, "sari@contoh.id") ?? "" }));
    } catch (error) {
      thrown = error;
    }

    expect(isRedirectError(thrown)).toBe(true);
    expect(String((thrown as { digest: string }).digest)).toContain("/akun");
    expect(await server.runtime().identity.actorFromCookies(browser.cookieHeader())).toMatchObject({
      phoneNumber: "+6281234567890",
    });
  });
});

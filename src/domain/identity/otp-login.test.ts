import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeWhatsAppSender } from "@/adapters/memory";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { createIdentity } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

const AUTH_SECRET = "test-secret-for-identity-tests-0123456789abcdef";

function setup() {
  const clock = new FakeClock(wib("2026-10-01 09:00"));
  const whatsapp = new FakeWhatsAppSender();
  const identity = createIdentity({ db, clock, whatsapp, secret: AUTH_SECRET, baseURL: "http://localhost:3000" });
  return { clock, whatsapp, identity };
}

describe("Pemesan OTP login over WhatsApp", () => {
  it("sends the OTP to the WhatsApp number with Meta's kode_verifikasi authentication template", async () => {
    const { whatsapp, identity } = setup();

    const result = await identity.requestOtp({ phoneNumber: "0812-3456-7890" });

    expect(result).toMatchObject({ ok: true, phoneNumber: "+6281234567890" });
    expect(whatsapp.sent).toHaveLength(1);
    const [message] = whatsapp.sent;
    expect(message).toMatchObject({ to: "+6281234567890", template: "kode_verifikasi", language: "id" });
    expect(message.copyCode).toMatch(/^\d{6}$/);
    expect(message.parameters).toEqual([message.copyCode]);
  });

  it("a correct OTP for a number with no account creates the Pemesan account and logs it in", async () => {
    const { whatsapp, identity } = setup();
    await identity.requestOtp({ phoneNumber: "081234567890" });

    const login = await identity.verifyOtp({ phoneNumber: "081234567890", code: lastCode(whatsapp) });

    expect(login).toMatchObject({
      ok: true,
      accountCreated: true,
      account: { phoneNumber: "+6281234567890" },
    });
    if (!login.ok) throw new Error("login failed");
    const actor = await identity.actorFromCookies(cookieHeader(login.session.cookies));
    expect(actor).toEqual({
      accountId: login.account.id,
      phoneNumber: "+6281234567890",
      roles: ["pemesan"],
    });
  });
});

function lastCode(whatsapp: FakeWhatsAppSender): string {
  const code = whatsapp.sent.at(-1)?.copyCode;
  if (!code) throw new Error("no OTP was sent");
  return code;
}

/** What the browser sends back after storing the session cookies. */
function cookieHeader(cookies: { name: string; value: string }[]): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

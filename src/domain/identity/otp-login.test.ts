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
});

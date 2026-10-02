import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import type { FakePaymentProvider } from "@/adapters/memory";
import type { Rupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import { PENGATURAN_OPERATOR } from "../../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { browser } from "../../../../tests/support/next-request";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { signInAsAdminPlatform } from "../../../../tests/support/server-sign-in";
import { bayarTagihan } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

async function issuedTagihan() {
  const admin = await signInAsAdminPlatform(server);
  const { operatorSettings, billing } = server.runtime();
  await operatorSettings.change(admin, { ...PENGATURAN_OPERATOR, reason: null });
  browser.reset();
  const issued = await billing.issueTagihan({
    moment: { kind: "terencana", holdExpiresAt: wib("2026-10-02 09:00") },
    addressee: { name: "Siti Rahmawati", phoneNumber: "081234567890", accountId: null },
    nomorPemesanan: "MKM-2026-000001",
    placeName: "Makam Wakaf Al-Ikhlas",
    lines: [{ kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: 150_000 as Rupiah, provider: { kind: "operator" } }],
  });
  if (!issued.ok) throw new Error(issued.reason);
  return issued.tagihan;
}

/** Where the Server Action sent the browser (it throws a redirect). */
async function redirectedTo(link: string): Promise<string> {
  const form = new FormData();
  form.set("link", link);
  try {
    await bayarTagihan(form);
  } catch (thrown) {
    if (isRedirectError(thrown)) return String(thrown.digest).split(";")[2];
    throw thrown;
  }
  throw new Error("no redirect");
}

describe("Bayar (Server Action)", () => {
  it("anyone with the Tagihan's link, signed in or not, is sent to the PaymentProvider's payment page", async () => {
    const tagihan = await issuedTagihan();

    const to = await redirectedTo(tagihan.link);

    const payments = server.runtime().adapters.payments as FakePaymentProvider;
    expect(to).toBe(payments.created.at(-1)?.paymentUrl);
  });

  it("when the PaymentProvider fails, the payer is sent back to the Tagihan's page to try again", async () => {
    const tagihan = await issuedTagihan();
    const payments = server.runtime().adapters.payments as FakePaymentProvider;
    payments.failWith = new Error("provider down");
    try {
      expect(await redirectedTo(tagihan.link)).toBe(`/dokumen/${encodeURIComponent(tagihan.link)}?bayar=gagal`);
    } finally {
      payments.failWith = undefined;
    }
  });

  it("a Lunas Tagihan sends the payer to its Bukti Pembayaran instead", async () => {
    const tagihan = await issuedTagihan();
    const paid = await server.runtime().billing.recordPayment(tagihan.id, { method: { kind: "tunai" }, reference: null });
    if (!paid.ok) throw new Error("not paid");

    expect(await redirectedTo(tagihan.link)).toBe(`/dokumen/${paid.bukti.link}`);
  });
});

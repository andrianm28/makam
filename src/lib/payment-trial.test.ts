import { describe, expect, it } from "vitest";
import { fetchPaymentTrial } from "./payment-trial";

const answering = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe("Pembayaran uji coba, as the browser learns it from /api/browser-config", () => {
  it("shows the banner when the running server says payments are a trial", async () => {
    expect(await fetchPaymentTrial(answering({ sentryDsn: "", paymentTrial: true }))).toBe(true);
  });

  it("stays hidden when the server says payments are live", async () => {
    expect(await fetchPaymentTrial(answering({ sentryDsn: "", paymentTrial: false }))).toBe(false);
  });

  it("stays hidden when the answer is missing the field, is not ok, is not JSON, or the request fails", async () => {
    expect(await fetchPaymentTrial(answering({ sentryDsn: "" }))).toBe(false);
    expect(await fetchPaymentTrial(answering({ paymentTrial: true }, false))).toBe(false);
    expect(await fetchPaymentTrial((async () => ({ ok: true, json: async () => { throw new Error("x"); } })) as unknown as typeof fetch)).toBe(false);
    expect(await fetchPaymentTrial((async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe(false);
  });

  it("stays hidden when paymentTrial is not a boolean true, whatever else the body holds", async () => {
    for (const body of [{ paymentTrial: "true" }, { paymentTrial: 1 }, { paymentTrial: null }, [true], "yes", null]) {
      expect(await fetchPaymentTrial(answering(body))).toBe(false);
    }
  });

  it("asks the running server per visit, never a cached answer", async () => {
    let seen: RequestInit | undefined;
    await fetchPaymentTrial((async (_url: string, init?: RequestInit) => { seen = init; return { ok: true, json: async () => ({ paymentTrial: false }) }; }) as unknown as typeof fetch);
    expect(seen?.cache).toBe("no-store");
  });
});

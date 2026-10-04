import { describe, expect, it } from "vitest";
import { barisBanner, BARIS_DATA_CONTOH, BARIS_PEMBAYARAN_UJI_COBA, fetchBrowserTrial, fetchPaymentTrial } from "./payment-trial";

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

describe("Data Contoh, as the browser learns it from /api/browser-config (ticket 109)", () => {
  it("reads contohAktif beside paymentTrial", async () => {
    expect(await fetchBrowserTrial(answering({ paymentTrial: true, contohAktif: true }))).toEqual({ paymentTrial: true, contohAktif: true });
    expect(await fetchBrowserTrial(answering({ paymentTrial: true, contohAktif: false }))).toEqual({ paymentTrial: true, contohAktif: false });
  });

  it("reads a server that does not send contohAktif (one from before ticket 109), or sends null or anything but true, as not active", async () => {
    for (const body of [{ paymentTrial: true }, { paymentTrial: true, contohAktif: null }, { paymentTrial: true, contohAktif: "true" }, { paymentTrial: true, contohAktif: 1 }]) {
      expect(await fetchBrowserTrial(answering(body))).toEqual({ paymentTrial: true, contohAktif: false });
    }
  });

  it("is neither a trial nor Data Contoh on any failure", async () => {
    expect(await fetchBrowserTrial(answering({ paymentTrial: true, contohAktif: true }, false))).toEqual({ paymentTrial: false, contohAktif: false });
    expect(await fetchBrowserTrial((async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toEqual({ paymentTrial: false, contohAktif: false });
    expect(await fetchBrowserTrial(answering({ contohAktif: true }))).toEqual({ paymentTrial: false, contohAktif: false });
  });

  it("puts the Data Contoh line under the trial line only while both are true", () => {
    expect(barisBanner({ paymentTrial: true, contohAktif: true })).toEqual([BARIS_PEMBAYARAN_UJI_COBA, BARIS_DATA_CONTOH]);
    expect(barisBanner({ paymentTrial: true, contohAktif: false })).toEqual([BARIS_PEMBAYARAN_UJI_COBA]);
    // The banner is for a production on the sandbox: Data Contoh alone (staging has its own banner) shows nothing here.
    expect(barisBanner({ paymentTrial: false, contohAktif: true })).toEqual([]);
    expect(barisBanner({ paymentTrial: false, contohAktif: false })).toEqual([]);
  });

  it("words the line as the owner is asked to confirm it", () => {
    expect(BARIS_DATA_CONTOH).toBe("Data bertanda (Contoh) dan harganya adalah contoh; pesanan masa uji coba tidak dilayani sungguhan.");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrialPaymentBanner } from "./trial-payment-banner";
import { TrialPaymentNotice } from "./trial-payment-notice";

describe("the Bayar step's notice that payment is a trial", () => {
  it("says beside the Bayar button that no money moves, while production pays through the sandbox", () => {
    const markup = renderToStaticMarkup(createElement(TrialPaymentNotice, { trial: true }));
    expect(markup).toContain("Pembayaran ini uji coba: tidak ada uang yang berpindah.");
    expect(markup).not.toContain("<button");
  });

  it("shows nothing when production pays live", () => {
    expect(renderToStaticMarkup(createElement(TrialPaymentNotice, { trial: false }))).toBe("");
  });
});

describe("the banner that payments are a trial", () => {
  it("is hidden in the server HTML, so a statically rendered page decides after hydration", () => {
    expect(renderToStaticMarkup(createElement(TrialPaymentBanner))).toBe("");
  });
});

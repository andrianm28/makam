import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HalamanGalat } from "./halaman-galat";

// Reporting to GlitchTip happens in an effect, which a render does not run, and the browser SDK is not loaded here.
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/instrumentation-client", () => ({ startBrowserSentry: vi.fn() }));

/** What the visitor reads when something threw that no nearer error page caught (ticket 98), in place of the framework's English page. */
describe("the error page of Makam.co.id", () => {
  it("tells a visitor whose form was left open across a deploy that the page was updated, and offers only Muat ulang", () => {
    const html = renderToStaticMarkup(
      createElement(HalamanGalat, { error: new UnrecognizedActionError("Server action not found.") }),
    );

    expect(html).toContain("Halaman ini sudah diperbarui");
    expect(html).toContain("Muat ulang");
    expect(html).not.toContain("Beranda");
    expect(html).not.toMatch(/This page couldn/);
  });

  it("gives any other error a generic page with Muat ulang and a Beranda link to the home page", () => {
    const html = renderToStaticMarkup(createElement(HalamanGalat, { error: new Error("De akun tidak terbaca") }));

    expect(html).toContain("Halaman ini tidak bisa dimuat");
    expect(html).toContain("Muat ulang");
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Beranda<\/a>/);
    expect(html).not.toMatch(/This page couldn/);
  });

  it("is generic, never the updated-page notice, for the error of a plain failed request", () => {
    // A Server Action answered with a plain 500 makes the client throw an ordinary Error, not an unrecognized-action one.
    const html = renderToStaticMarkup(createElement(HalamanGalat, { error: new Error("An unexpected response was received from the server.") }));

    expect(html).toContain("Halaman ini tidak bisa dimuat");
    expect(html).not.toContain("sudah diperbarui");
  });
});

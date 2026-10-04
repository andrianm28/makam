import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import GalatGlobal from "./global-error";

// Reporting to GlitchTip happens in an effect, which a render does not run, and the browser SDK is not loaded here.
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/instrumentation-client", () => ({ startBrowserSentry: vi.fn() }));

/** The page that replaces the root layout when the layout itself failed (ticket 98). */
describe("the error page that replaces a failed root layout", () => {
  it("brings its own html and body, in Bahasa Indonesia, with Muat ulang and Beranda", () => {
    const html = renderToStaticMarkup(createElement(GalatGlobal, { error: new Error("De tata letak gagal") }));

    expect(html).toContain('<html lang="id"');
    expect(html).toContain("<body");
    expect(html).toContain("Halaman ini tidak bisa dimuat");
    expect(html).toContain("Muat ulang");
    expect(html).toContain("Beranda");
  });

  it("gives the brand font's variable a system sans-serif value: the layout that declares it is what failed", () => {
    const html = renderToStaticMarkup(createElement(GalatGlobal, { error: new Error("De tata letak gagal") }));

    // Without it `font-sans` points at a variable nobody set, so the declaration is void and the browser's serif shows.
    expect(html).toMatch(/<html[^>]*class="[^"]*\[--font-plus-jakarta:ui-sans-serif,system-ui,sans-serif\]/);
  });
});

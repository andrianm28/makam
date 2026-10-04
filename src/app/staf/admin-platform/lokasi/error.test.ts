import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LokasiMitraListError from "./error";
import LokasiMitraDetailError from "./[lokasiId]/error";

/**
 * The two error pages of Lokasi Mitra (the list and one Lokasi Mitra's detail) keep their own page, with Coba lagi,
 * for a failed read, and hand a stale Server Action on to the root error page (ticket 98): "Coba lagi" re-renders the
 * same old bundle, so only the root page's Muat ulang helps.
 */
describe.each([
  ["the list", LokasiMitraListError, "Daftar Lokasi Mitra gagal dimuat"],
  ["the detail of one Lokasi Mitra", LokasiMitraDetailError, "Lokasi Mitra ini gagal dimuat"],
])("the Lokasi Mitra error page for %s", (_which, Boundary, title) => {
  const retry = () => {};

  it("keeps its own page and offers Coba lagi when the read failed", () => {
    const html = renderToStaticMarkup(createElement(Boundary, { error: new Error("De lokasi tidak terbaca"), retry }));

    expect(html).toContain(title);
    expect(html).toContain("Coba lagi");
  });

  it("hands a form left open across a deploy on to the root error page, as the very same error", () => {
    const stale = new UnrecognizedActionError("Server action not found.");
    let thrown: unknown;
    try {
      renderToStaticMarkup(createElement(Boundary, { error: stale, retry }));
    } catch (caught) {
      thrown = caught;
    }

    expect(thrown).toBe(stale);
  });
});

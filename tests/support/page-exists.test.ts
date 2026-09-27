import { describe, expect, it } from "vitest";
import { pageExists } from "./page-exists";

/**
 * The check both menus rely on: a link is accepted only when the route has a page
 * **of its own**. The regression this file exists for is a `page.tsx` halfway down
 * a path — `/staf/page.tsx` answers for the staff area's own page, not for
 * `/staf/admin-platform/antrean` — which would make every route beneath it look
 * real and let a link to a page nobody wrote through unchecked.
 */
describe("pageExists", () => {
  it("a route nobody wrote has no page, however much of its path does", () => {
    expect(pageExists("/staf/admin-platform/HALUS-PAGINA")).toBe(false);
    expect(pageExists("/staf/x/y/z")).toBe(false);
    expect(pageExists("/staf/admin-platform/tidak-ada")).toBe(false);
    expect(pageExists("/pesan-makam/terencana")).toBe(false);
  });

  it("finds a page at any depth", () => {
    expect(pageExists("/staf")).toBe(true);
    expect(pageExists("/staf/admin-platform")).toBe(true);
    expect(pageExists("/staf/admin-platform/lokasi/[lokasiId]/tarif")).toBe(true);
    expect(pageExists("/dokumen/[link]")).toBe(true);
  });

  it("sees through a route group, which never appears in the URL", () => {
    // The public site's own pages live in (site), and the staff area's are not in one.
    expect(pageExists("/")).toBe(true);
    expect(pageExists("/akun")).toBe(true);
    expect(pageExists("/masuk/email")).toBe(true);
    expect(pageExists("/tentang-kami")).toBe(true);
  });

  it("reads a dynamic segment as the folder name, not as a value", () => {
    expect(pageExists("/lokasi/[lokasiId]")).toBe(true);
    expect(pageExists("/lokasi/abc")).toBe(false);
  });
});

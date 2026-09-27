import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CatatanPembayaran } from "./catatan-pembayaran";

/**
 * The "nothing is paid now" note both screens carry (spec, story 25 and AC 1):
 * what it says about money is true, and the deadline it names is the one the
 * order's own Lokasi Mitra sets.
 */
describe("the note that says nothing is paid yet", () => {
  it("names the Lokasi's own payment window, so two Lokasi say two different things", () => {
    const pendek = renderToStaticMarkup(createElement(CatatanPembayaran, { jumlahJam: 24 }));
    const panjang = renderToStaticMarkup(createElement(CatatanPembayaran, { jumlahJam: 120 }));

    expect(pendek).toContain("jatuh tempo sehari setelah pemakaman");
    expect(panjang).toContain("jatuh tempo lima hari setelah pemakaman");
    expect(pendek).not.toEqual(panjang);
    // No span of its own: the number always comes from the Lokasi's policy.
    expect(pendek).not.toContain("3×24");
    expect(panjang).not.toContain("3×24");
  });

  it("keeps the two promises a family needs: the money comes later, the burial does not wait", () => {
    const html = renderToStaticMarkup(createElement(CatatanPembayaran, { jumlahJam: 72 }));

    expect(html).toContain("Tagihan terbit setelah Lokasi Mitra mengonfirmasi");
    expect(html).toContain("Pemakaman tetap berjalan");
    expect(html).toContain("Dokumen boleh diunggah nanti");
  });

  it("names no span at all when the Lokasi's window cannot be read", () => {
    const html = renderToStaticMarkup(createElement(CatatanPembayaran, { jumlahJam: null }));

    expect(html).toContain("sesuai jangka yang ditetapkan Lokasi Mitra");
    expect(html).not.toMatch(/jatuh tempo \\d/);
  });
});

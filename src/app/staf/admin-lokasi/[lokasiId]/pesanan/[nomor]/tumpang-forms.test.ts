/**
 * The Admin Lokasi's panel for a further burial, rendered (ticket 125): the consent form takes the heirship proof as a file
 * (PDF, JPG or PNG), and an order whose consent carries one says so and links to open it through the signed-link route.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TumpangPanel } from "@/lib/tumpang-panel";

vi.mock("server-only", () => ({}));
vi.mock("./tumpang-actions", () => ({
  catatKonsenTumpangAction: async () => ({ status: "idle" as const }),
  konfirmasiTumpangAction: async () => ({ status: "idle" as const }),
}));

const { TumpangPanelView } = await import("./tumpang-forms");

const LOKASI_ID = "6f2f4c0e-8f58-4c3a-9d55-0d1f6b1c2a10";
const NOMOR = "MKM-2026-000007";

const menungguLokasi: TumpangPanel = {
  konsenLabel: "Pemegang Hak tidak punya email tercatat: catat persetujuan lisan atau bukti ahli waris.",
  bisaCatatKonsen: true,
  bisaKonfirmasi: false,
  bisaTolak: true,
  blokKonfirmasi: "Persetujuan Pemegang Hak belum selesai.",
  peringatan: [],
  pengingatGanti: null,
  buktiAhliWarisAda: false,
};

function render(panel: Partial<TumpangPanel>): string {
  return renderToStaticMarkup(createElement(TumpangPanelView, { lokasiId: LOKASI_ID, nomor: NOMOR, panel: { ...menungguLokasi, ...panel }, pemakamanAwal: "2026-10-02T10:00" }));
}

/** The consent form's file field, as a tag. */
function fieldBukti(html: string): string {
  return /<input[^>]*type="file"[^>]*>/.exec(html)?.[0] ?? "";
}

describe("the consent form of a further burial", () => {
  it("takes the heirship proof as a PDF, JPG or PNG file, named bukti, with its size limit said", () => {
    const html = render({});
    const field = fieldBukti(html);

    expect(field).toContain('name="bukti"');
    expect(field).toContain('accept="application/pdf,image/jpeg,image/png"');
    // It is labelled, and the limit is said beside it.
    expect(field).toContain('id="bukti"');
    expect(html).toContain('for="bukti"');
    expect(html).toContain("Paling besar 10 MB");
  });

  it("lets the Lokasi pick the file only for an heirship proof, where it is required: a verbal consent has none to give", () => {
    const field = fieldBukti(render({}));

    // The form opens on the verbal consent, so the file field waits for the other choice.
    expect(field).toContain("disabled");
    expect(field).not.toContain("required");
  });

  it("is gone once the consent is settled", () => {
    expect(fieldBukti(render({ bisaCatatKonsen: false }))).toBe("");
  });
});

describe("an order whose consent carries an heirship proof", () => {
  it("says a proof is on file and links to open it through the signed-link route, in a new tab, never as a file of the page", () => {
    const html = render({ bisaCatatKonsen: false, konsenLabel: "Disetujui dengan bukti ahli waris: Surat waris", buktiAhliWarisAda: true });

    expect(html).toContain('data-testid="bukti-ahli-waris"');
    expect(html).toContain("terlampir");
    expect(html).toContain(`href="/staf/admin-lokasi/${LOKASI_ID}/pesanan/${NOMOR}/bukti-ahli-waris"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("shows no proof line and no link when none is on file", () => {
    const html = render({ bisaCatatKonsen: false, konsenLabel: "Disetujui lisan, dicatat Admin Lokasi: Lewat telepon" });

    expect(html).not.toContain("bukti-ahli-waris");
    expect(html).not.toContain("terlampir");
  });
});

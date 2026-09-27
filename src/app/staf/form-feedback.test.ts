import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ServerResult, toastTone } from "./form-feedback";

/**
 * The Form pattern's one way of reporting a Server Action's result
 * (docs/design-system.md): the message stays inline under the form, and the
 * same message is toasted.
 */
describe("ServerResult", () => {
  it("shows nothing before the first submission", () => {
    expect(renderToStaticMarkup(createElement(ServerResult, { state: { status: "idle" } }))).toBe("");
  });

  it("keeps a saved record's message inline, as a status", () => {
    const html = renderToStaticMarkup(
      createElement(ServerResult, { state: { status: "berhasil", message: "Pengaturan Operator disimpan." } }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Pengaturan Operator disimpan.");
  });

  it("keeps a refusal inline, as an alert", () => {
    const html = renderToStaticMarkup(
      createElement(ServerResult, { state: { status: "gagal", message: "Tulis alasannya." } }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Tulis alasannya.");
  });
});

/** The same result as a Sonner toast: which tone, and nothing before a submission. */
describe("toastTone", () => {
  it("reads the result as the tone the toast arrives in", () => {
    expect(toastTone({ status: "idle" })).toBeNull();
    expect(toastTone({ status: "berhasil", message: "Hari Libur Nasional ditambahkan." })).toBe("success");
    expect(toastTone({ status: "gagal", message: "Tanggal ini sudah ada di daftar." })).toBe("error");
  });
});

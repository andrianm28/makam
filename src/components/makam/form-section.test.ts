import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldError, FormSection } from "./form-section";

/** The Form pattern's sections (spec, Staff UI and design system; docs/design-system.md). */
describe("FormSection", () => {
  it("renders one titled section with its description and fields", () => {
    const html = renderToStaticMarkup(
      // children as extra createElement args fails React 19's types (required
      // children must be in props), so they go in props here.
      // eslint-disable-next-line react/no-children-prop
      createElement(FormSection, {
        title: "Ubah",
        description: "Perubahan berlaku mulai saat disimpan.",
        children: createElement(
          "label",
          null,
          "Nama resmi Operator",
          createElement("input", { name: "legalName" }),
        ),
      }),
    );

    expect(html).toContain("<section");
    expect(html).toMatch(/<h2[^>]*>Ubah<\/h2>/);
    expect(html).toContain("Perubahan berlaku mulai saat disimpan.");
    expect(html).toContain('name="legalName"');
  });

  it("names the section for assistive tech", () => {
    const html = renderToStaticMarkup(
      // See above: required children must be in props for React 19's types.
      // eslint-disable-next-line react/no-children-prop
      createElement(FormSection, { title: "Ubah", children: createElement("input", { name: "legalName" }) }),
    );

    expect(html).toMatch(/<section[^>]*aria-labelledby="[^"]+"/);
    expect(html).toMatch(/<h2[^>]*id="[^"]+"[^>]*>Ubah<\/h2>/);
  });
});

describe("FieldError", () => {
  it("renders nothing without an error", () => {
    expect(renderToStaticMarkup(createElement(FieldError, { message: undefined }))).toBe("");
  });

  it("renders the message as an alert under the field", () => {
    const html = renderToStaticMarkup(createElement(FieldError, { message: "Email Operator tidak valid." }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Email Operator tidak valid.");
  });
});

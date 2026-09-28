import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CsLink } from "./cs-link";

/** The CS button (ADR 0004: a `wa.me` link a person answers, no WhatsApp API). */
const contact = { whatsApp: "+628112222333", replyHours: "dibalas mulai pukul 06:00" };

describe("the CS link", () => {
  it("opens the CS number from Pengaturan Operator in the WhatsApp app, in a new tab", () => {
    const markup = renderToStaticMarkup(createElement(CsLink, { contact }));
    expect(markup).toContain('href="https://wa.me/628112222333"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain("Tanya CS");
  });

  it("shows the CS's reply hours only where they were asked for", () => {
    expect(renderToStaticMarkup(createElement(CsLink, { contact }))).not.toContain("dibalas mulai pukul 06:00");
    expect(renderToStaticMarkup(createElement(CsLink, { contact, showHours: true }))).toContain(
      "dibalas mulai pukul 06:00",
    );
  });

  it("says what it is, in the caller's own words", () => {
    const markup = renderToStaticMarkup(createElement(CsLink, { contact, label: "Tanya CS soal Perpanjang Makam" }));
    expect(markup).toContain("Tanya CS soal Perpanjang Makam");
  });

  it("renders nothing at all while Pengaturan Operator holds no number", () => {
    // No number, no link: a button that goes nowhere is worse than no button.
    expect(renderToStaticMarkup(createElement(CsLink, { contact: null }))).toBe("");
  });

  it("keeps the label as the icon's name where the bar has no room for it", () => {
    // A phone shows the icon alone; the name is still announced, and still there
    // from sm up, so the link is never an unlabelled icon.
    const markup = renderToStaticMarkup(createElement(CsLink, { contact, hideLabelOnPhone: true }));
    expect(markup).toContain("sr-only sm:not-sr-only");
    expect(markup).toContain("Tanya CS");
  });

  it("lets a call site take over the markup and the classes entirely", () => {
    // A call site with its own icon, wording and layout still goes through
    // CsLink for the href/target/rel and the contact-null check, so its
    // `children` replaces the default markup and its `className` replaces
    // the default look instead of merging onto it.
    const markup = renderToStaticMarkup(
      createElement(
        CsLink,
        { contact, className: "custom-look", "aria-label": "Tanya soal ini" },
        "Butuh bantuan? WhatsApp CS",
      ),
    );
    expect(markup).toContain('class="custom-look"');
    expect(markup).toContain('aria-label="Tanya soal ini"');
    expect(markup).toContain("Butuh bantuan? WhatsApp CS");
    expect(markup).not.toContain("Tanya CS");
  });
});

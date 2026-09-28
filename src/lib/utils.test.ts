import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn, the design system's class merger", () => {
  it("keeps a type-scale size next to a text colour (text-small is a size, not a colour)", () => {
    expect(cn("text-small", "text-muted-foreground")).toBe("text-small text-muted-foreground");
  });

  it("lets a later type-scale size replace an earlier one", () => {
    expect(cn("text-body text-foreground", "text-title-1")).toBe("text-foreground text-title-1");
  });

  it("treats every step of the type scale as a size", () => {
    for (const size of ["display", "title-1", "title-2", "title-3", "body-lg", "body", "small", "caption"]) {
      expect(cn("text-sm", `text-${size}`)).toBe(`text-${size}`);
    }
  });

  it("treats the public site's display sizes as sizes too (hero, public h1, public h2)", () => {
    for (const size of ["hero", "hero-lg", "page-title", "section-title"]) {
      expect(cn("text-sm", `text-${size}`)).toBe(`text-${size}`);
    }
  });
});

import { describe, expect, it } from "vitest";
import { forcedThemeFor } from "./theme-scope";

describe("where dark mode applies", () => {
  it.each(["/staf/admin-platform", "/staf/admin-platform/lokasi/abc", "/staf/admin-lokasi/abc/jam-operasional", "/staf/email"])(
    "the staff area follows the chosen theme: %s",
    (pathname) => {
      expect(forcedThemeFor(pathname)).toBeUndefined();
    },
  );

  it.each(["/", "/masuk", "/masuk/email", "/akun", "/health", "/stafxyz", "/staf/totp"])(
    "public pages, Masuk, Akun Saya and the TOTP step stay light: %s",
    (pathname) => {
      expect(forcedThemeFor(pathname)).toBe("light");
    },
  );
});

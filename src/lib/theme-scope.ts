import { staffPagePath } from "./staff-area-path";

/**
 * Dark mode is for the staff area only (field and night use); the public
 * site, Masuk and Akun Saya are light only
 * (docs/design-system.md). Returns the theme a page is held to, or undefined
 * where the person's own choice (Terang, Gelap, Ikuti perangkat) applies.
 */
export function forcedThemeFor(pathname: string): "light" | undefined {
  const staffPage = staffPagePath(pathname);
  if (!staffPage) return "light";
  return undefined;
}

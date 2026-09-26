import { STAFF_AREA_PATH, staffPagePath } from "./staff-area-path";

/** The TOTP step is part of logging in, so it stays light with Masuk. */
const TOTP_PATH = `${STAFF_AREA_PATH}/totp`;

/**
 * Dark mode is for the staff area only (field and night use); the public
 * site, Masuk, Akun Saya and the TOTP step are light only
 * (docs/design-system.md). Returns the theme a page is held to, or undefined
 * where the person's own choice (Terang, Gelap, Ikuti perangkat) applies.
 */
export function forcedThemeFor(pathname: string): "light" | undefined {
  // PROTOTYPE, throwaway: the Denah editor prototype stands in for a staff page.
  if (pathname === "/pratinjau/denah" || pathname.startsWith("/pratinjau/denah/")) return undefined;
  const staffPage = staffPagePath(pathname);
  if (!staffPage || staffPage === TOTP_PATH || staffPage.startsWith(`${TOTP_PATH}/`)) return "light";
  return undefined;
}

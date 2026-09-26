import type { StaffRole } from "@/domain/identity";

/**
 * The staff area's path: the installed staff app's id, start and scope
 * (`public/staf.webmanifest`), the service worker's scope, and the only place
 * a Peringatan Staf push may open.
 *
 * `public/sw.js` and `public/staf.webmanifest` are static files that cannot
 * import this; each repeats the literal, and `staff-area-path.test.ts` checks
 * they match it (and that the service worker's page check agrees with
 * `staffPagePath`).
 */
export const STAFF_AREA_PATH = "/staf";

/** The URL segment of each role's pages in the staff area (`/staf/<slug>`). */
export const staffRoleSlugs = {
  admin_platform: "admin-platform",
  admin_lokasi: "admin-lokasi",
  petugas_lapangan: "petugas-lapangan",
  mitra_jasa: "mitra-jasa",
} as const satisfies Record<StaffRole, string>;

/** A staff role's home page. */
export function staffRoleHome(role: StaffRole): string {
  return `${STAFF_AREA_PATH}/${staffRoleSlugs[role]}`;
}

/** Any origin works: only same-origin, root-relative paths are kept. */
const BASE = "https://makam.invalid";

/**
 * The staff page a push's `url` names, normalised (path, query, hash), or null
 * when it is not one: only `/staf` itself or a page under `/staf/…` on this
 * site. Never `/stafxyz`, another host (`//host`, `https://…`), a relative
 * path, or a path that leaves the area through `..`.
 */
export function staffPagePath(url: string): string | null {
  if (!url.startsWith("/")) return null;
  if (!URL.canParse(url, BASE)) return null;
  const parsed = new URL(url, BASE);
  if (parsed.origin !== BASE) return null;
  const inArea = parsed.pathname === STAFF_AREA_PATH || parsed.pathname.startsWith(`${STAFF_AREA_PATH}/`);
  return inArea ? `${parsed.pathname}${parsed.search}${parsed.hash}` : null;
}

import { NextResponse, type NextRequest } from "next/server";
import { fiturUntukRute, permukaanRute, rilisTerbuka } from "@/lib/rilis";

/**
 * The release gate for routes (ADR 0006), before anything renders or any Server
 * Action runs (an action posts to the URL of the page that holds it): a closed
 * feature's staff page answers 404, and its public or Akun Saya page shows
 * "Segera hadir" at the same URL.
 */
/**
 * The path as the router will see it: percent-decoded (to a fixed point, so a
 * double-encoded segment cannot hide), lower-cased, duplicate and trailing slashes
 * removed. A path that cannot be decoded is taken as it is.
 */
export function normalisasiPath(raw: string): string {
  let path = raw;
  for (let round = 0; round < 3; round += 1) {
    try {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    } catch {
      break;
    }
  }
  const segmen = path.toLowerCase().split("/").filter(Boolean);
  return `/${segmen.join("/")}`;
}

export function proxy(request: NextRequest) {
  const pathname = normalisasiPath(request.nextUrl.pathname);
  const { search } = request.nextUrl;
  const fitur = fiturUntukRute(pathname, search);
  if (!fitur || rilisTerbuka(fitur)) return NextResponse.next();
  if (permukaanRute(pathname) === "staf") return new NextResponse(null, { status: 404 });
  return NextResponse.rewrite(new URL("/segera-hadir", request.url));
}

export const config = {
  // Pages and the Server Actions posted to them. Only real static assets (the build's and public/'s) and the API are skipped: a dynamic segment with a dot must still be checked.
  matcher: ["/((?!api/|_next/|favicon\\.ico$|robots\\.txt$|sw\\.js$|staf\\.webmanifest$|content/|brand/|icons/).*)"],
};

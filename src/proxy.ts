import { NextResponse, type NextRequest } from "next/server";
import { fiturUntukRute, permukaanRute, rilisTerbuka } from "@/lib/rilis";

/**
 * The release gate for routes (ADR 0006), before anything renders or any Server
 * Action runs (an action posts to the URL of the page that holds it): a closed
 * feature's staff page answers 404, and its public or Akun Saya page shows
 * "Segera hadir" at the same URL.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const fitur = fiturUntukRute(pathname, search);
  if (!fitur || rilisTerbuka(fitur)) return NextResponse.next();
  if (permukaanRute(pathname) === "staf") return new NextResponse(null, { status: 404 });
  return NextResponse.rewrite(new URL("/segera-hadir", request.url));
}

export const config = {
  // Pages and the Server Actions posted to them; not the build's assets or the API's route handlers.
  matcher: ["/((?!api/|_next/|favicon.ico|content/|brand/|.*\\.[a-z0-9]+$).*)"],
};

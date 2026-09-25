import "server-only";
import { cookies, headers } from "next/headers";
import type { Actor, SessionCookie } from "@/domain/identity";
import { serverRuntime } from "./runtime";

/** Step 1 of every signed-in Server Action and page: who is calling, from the session cookie. */
export async function currentActor(): Promise<Actor | null> {
  const cookieHeader = (await headers()).get("cookie");
  return serverRuntime().identity.actorFromCookies(cookieHeader);
}

/** The request's Cookie header, for identity calls that act on the caller's own session (TOTP). */
export async function currentCookieHeader(): Promise<string | null> {
  return (await headers()).get("cookie");
}

/** Stores the session cookies the identity module issued (Server Actions only). */
export async function setSessionCookies(sessionCookies: SessionCookie[]): Promise<void> {
  const store = await cookies();
  for (const cookie of sessionCookies) {
    store.set(cookie.name, cookie.value, {
      maxAge: cookie.maxAge,
      expires: cookie.expires,
      path: cookie.path ?? "/",
      domain: cookie.domain,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    });
  }
}

/** Keluar: ends the caller's session and clears its cookies (Server Actions only). */
export async function endCurrentSession(): Promise<void> {
  const cookieHeader = (await headers()).get("cookie");
  const { clearCookies } = await serverRuntime().identity.endSession(cookieHeader);
  const store = await cookies();
  for (const name of clearCookies) store.delete(name);
}

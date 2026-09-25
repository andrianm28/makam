import { getSessionCookie, parseSetCookieHeader } from "better-auth/cookies";
import { constantTimeEqual, makeSignature } from "better-auth/crypto";
import type { Clock } from "@/ports/clock";
import { COOKIE_PREFIX, type MakamAuth } from "./better-auth";
import type { Actor } from "./authorize";

/** A cookie the web layer must set on the response, as Better Auth wrote it. */
export interface SessionCookie {
  name: string;
  value: string;
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
}

/** Turns Better Auth's Set-Cookie headers into cookies the web layer can set. */
export function sessionCookiesFrom(headers: Headers): SessionCookie[] {
  const cookies: SessionCookie[] = [];
  for (const header of headers.getSetCookie()) {
    for (const [name, attributes] of parseSetCookieHeader(header)) {
      const sameSite = attributes.samesite?.toLowerCase();
      cookies.push({
        name,
        value: attributes.value,
        maxAge: attributes["max-age"],
        expires: attributes.expires,
        path: attributes.path,
        domain: attributes.domain,
        httpOnly: attributes.httponly,
        secure: attributes.secure,
        sameSite: sameSite === "lax" || sameSite === "strict" || sameSite === "none" ? sameSite : undefined,
      });
    }
  }
  return cookies;
}

/**
 * The signed-in actor for a request's Cookie header, or null.
 *
 * Reads the session itself instead of `auth.api.getSession`, so expiry is
 * checked against the Clock, never the system time.
 */
export async function actorFromCookies(
  deps: { auth: MakamAuth; clock: Clock; secret: string },
  cookieHeader: string | null | undefined,
): Promise<Actor | null> {
  const token = await verifiedSessionToken(deps.secret, cookieHeader);
  if (!token) return null;

  const context = await deps.auth.$context;
  const found = await context.internalAdapter.findSession(token);
  if (!found) return null;
  if (found.session.expiresAt.getTime() <= deps.clock.now().getTime()) return null;

  const phoneNumber = (found.user as { phoneNumber?: string | null }).phoneNumber;
  if (!phoneNumber) return null;
  return { accountId: found.user.id, phoneNumber, roles: ["pemesan"] };
}

/** The session token from a signed `makam.session_token` cookie, if the signature holds. */
async function verifiedSessionToken(secret: string, cookieHeader: string | null | undefined) {
  if (!cookieHeader) return null;
  const signed = getSessionCookie(new Headers({ cookie: cookieHeader }), { cookiePrefix: COOKIE_PREFIX });
  if (!signed) return null;
  const value = safeDecode(signed);
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const token = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const expected = await makeSignature(token, secret);
  return constantTimeEqual(signature, expected) ? token : null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

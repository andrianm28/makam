import { getSessionCookie, parseSetCookieHeader } from "better-auth/cookies";
import { constantTimeEqual, makeSignature } from "better-auth/crypto";
import { and, eq, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";
import { COOKIE_PREFIX, type MakamAuth } from "./better-auth";
import type { Actor, Role } from "./authorize";
import { identitySession, identityUser } from "./schema";
import { rolesOf } from "./staff";
import { totpStatus } from "./totp";

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

/** The stored session (with its user) behind a session token, or null. */
export async function findSession(auth: MakamAuth, token: string) {
  const context = await auth.$context;
  return context.internalAdapter.findSession(token);
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
  deps: { db: Database; clock: Clock; secret: string },
  cookieHeader: string | null | undefined,
): Promise<Actor | null> {
  const session = await activeSession(deps, cookieHeader);
  if (!session) return null;
  const totp = await totpStatus(deps.db, session);
  return {
    accountId: session.accountId,
    phoneNumber: session.phoneNumber,
    roles: session.roles,
    totp,
    sessionId: session.id,
  };
}

/** A signed-in session, as the identity module reads it. */
export interface ActiveSession {
  id: string;
  token: string;
  accountId: string;
  phoneNumber: string;
  roles: Role[];
  createdAt: Date;
  expiresAt: Date;
  totpPassedAt: Date | null;
}

/**
 * The live session behind a Cookie header: signature valid, not expired on the
 * Clock, and its account able to log in. Null otherwise.
 */
export async function activeSession(
  deps: { db: Database; clock: Clock; secret: string },
  cookieHeader: string | null | undefined,
): Promise<ActiveSession | null> {
  const token = await verifiedSessionToken(deps.secret, cookieHeader);
  if (!token) return null;
  return liveSession(deps, eq(identitySession.token, token));
}

/**
 * The signed-in actor's own session, still live on the Clock: for writes on
 * the session itself (TOTP) after `guarded()` resolved the actor. Null when it
 * has ended since.
 */
export async function actorSession(deps: { db: Database; clock: Clock }, actor: Actor): Promise<ActiveSession | null> {
  return liveSession(deps, and(eq(identitySession.id, actor.sessionId), eq(identitySession.userId, actor.accountId)));
}

async function liveSession(deps: { db: Database; clock: Clock }, where: SQL | undefined): Promise<ActiveSession | null> {
  const [row] = await deps.db
    .select({
      id: identitySession.id,
      token: identitySession.token,
      accountId: identitySession.userId,
      createdAt: identitySession.createdAt,
      expiresAt: identitySession.expiresAt,
      totpPassedAt: identitySession.totpPassedAt,
      phoneNumber: identityUser.phoneNumber,
    })
    .from(identitySession)
    .innerJoin(identityUser, eq(identityUser.id, identitySession.userId))
    .where(where);
  if (!row?.phoneNumber) return null;
  if (row.expiresAt.getTime() <= deps.clock.now().getTime()) return null;

  const roles = await rolesOf(deps.db, row.accountId);
  return { ...row, phoneNumber: row.phoneNumber, roles };
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

/**
 * Keluar: ends the session behind the Cookie header (if any) and names the
 * cookies the web layer must clear.
 */
export async function endSession(
  deps: { auth: MakamAuth; secret: string },
  cookieHeader: string | null | undefined,
): Promise<{ clearCookies: string[] }> {
  const context = await deps.auth.$context;
  const token = await verifiedSessionToken(deps.secret, cookieHeader);
  if (token) await context.internalAdapter.deleteSession(token);
  return { clearCookies: [context.authCookies.sessionToken.name] };
}

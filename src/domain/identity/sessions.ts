import { getSessionCookie } from "better-auth/cookies";
import { constantTimeEqual, makeSignature } from "better-auth/crypto";
import { and, eq, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";
import { COOKIE_PREFIX, type MakamAuth } from "./better-auth";
import type { Actor, Role } from "./authorize";
import { identitySession, identityUser } from "./schema";
import { adminLokasiIdsOf, rolesOf } from "./staff";
import { totpStatus } from "./totp";

/** A cookie the web layer must set on the response: Better Auth's signed session cookie. */
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
    email: session.email,
    phoneNumber: session.phoneNumber,
    roles: session.roles,
    lokasiIds: session.roles.includes("admin_lokasi") ? await adminLokasiIdsOf(deps.db, session.accountId) : [],
    totp,
    sessionId: session.id,
  };
}

/** A signed-in session, as the identity module reads it. */
export interface ActiveSession {
  id: string;
  token: string;
  accountId: string;
  /** The Akun's Email Terverifikasi. */
  email: string;
  phoneNumber: string | null;
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
      email: identityUser.contactEmail,
      emailVerifiedAt: identityUser.emailVerifiedAt,
      phoneNumber: identityUser.phoneNumber,
    })
    .from(identitySession)
    .innerJoin(identityUser, eq(identityUser.id, identitySession.userId))
    .where(where);
  // An Akun without an Email Terverifikasi (from before ADR 0004) cannot log in until a Pemulihan Akun.
  if (!row?.email || !row.emailVerifiedAt) return null;
  if (row.expiresAt.getTime() <= deps.clock.now().getTime()) return null;

  const roles = await rolesOf(deps.db, row.accountId);
  return {
    id: row.id,
    token: row.token,
    accountId: row.accountId,
    email: row.email,
    phoneNumber: row.phoneNumber,
    roles,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    totpPassedAt: row.totpPassedAt,
  };
}

/**
 * Starts a session for the Akun, lasting `lengthMs` from the Clock: Better
 * Auth's internal adapter stores it, and the cookie is signed as Better Auth
 * signs its own session cookie (so `endSession` and `actorFromCookies` read it).
 */
export async function startSession(
  deps: { auth: MakamAuth; db: Database; secret: string },
  accountId: string,
  lengthMs: number,
): Promise<{ token: string; expiresAt: Date; cookies: SessionCookie[] }> {
  const context = await deps.auth.$context;
  const created = await context.internalAdapter.createSession(accountId);
  if (!created) throw new Error("Better Auth stored no session");
  const expiresAt = new Date(created.createdAt.getTime() + lengthMs);
  await deps.db.update(identitySession).set({ expiresAt }).where(eq(identitySession.token, created.token));
  const { name, attributes } = context.authCookies.sessionToken;
  const cookie: SessionCookie = {
    name,
    value: `${created.token}.${await makeSignature(created.token, deps.secret)}`,
    maxAge: lengthMs / 1000,
    path: attributes.path,
    domain: attributes.domain,
    httpOnly: attributes.httpOnly,
    secure: attributes.secure,
    sameSite: sameSiteOf(attributes.sameSite),
  };
  return { token: created.token, expiresAt, cookies: [cookie] };
}

function sameSiteOf(value: unknown): SessionCookie["sameSite"] {
  const lower = typeof value === "string" ? value.toLowerCase() : undefined;
  return lower === "lax" || lower === "strict" || lower === "none" ? lower : undefined;
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

import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber } from "better-auth/plugins";
import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";
import {
  identityAuthAccount,
  identitySession,
  identityUser,
  identityVerification,
} from "./schema";

/** A Pemesan session lasts 90 days (spec, Identity & Access > Sessions). */
export const PEMESAN_SESSION_MS = 90 * 86_400_000;
/** An Akun Staf without Admin Platform: 30 days (every staff login counts as a trusted device in v1). */
export const STAFF_SESSION_MS = 30 * 86_400_000;
/** Any Akun holding Admin Platform, whatever else it holds: 12 hours. */
export const ADMIN_PLATFORM_SESSION_MS = 12 * 3_600_000;

/** How long a new session of an Akun with these roles lasts: the strictest rule of the roles held. */
export function sessionLengthMs(roles: readonly string[]): number {
  if (roles.includes("admin_platform")) return ADMIN_PLATFORM_SESSION_MS;
  if (roles.some((role) => role !== "pemesan")) return STAFF_SESSION_MS;
  return PEMESAN_SESSION_MS;
}

/** Cookie names start with this, e.g. `makam.session_token`. */
export const COOKIE_PREFIX = "makam";

export interface BetterAuthDeps {
  db: Database;
  clock: Clock;
  secret: string;
  baseURL: string;
  /**
   * True once for a login proof the identity module issued for this number
   * after it checked a Kode Masuk itself (./login.ts); false for anything else.
   */
  consumeLoginProof(phoneNumber: string, proof: string): boolean;
}

/**
 * Better Auth as the identity module's account and session engine.
 *
 * Better Auth reads the system time internally and cannot take our Clock, so:
 * - every timestamp it writes (createdAt/updatedAt on user, session, account
 *   and verification, on create and on update, and session expiresAt) is
 *   replaced from the Clock in the database hooks below;
 * - session refresh is off (it would move expiresAt by the system time);
 * - sessions are never read through `auth.api.getSession` (which compares
 *   expiresAt with the system time): the module reads them itself and checks
 *   expiry against the Clock (see ./sessions.ts).
 *
 * Kode Masuk (WhatsApp and email) are generated, sent, rate-limited and
 * checked by the module (./otp.ts) against the Clock. Only then does the module
 * hand Better Auth's phone-number plugin a one-time login proof for the Akun's
 * number, which the plugin turns into a user (created on a first WhatsApp
 * login) and a session. Better Auth's own
 * rate limiter is off: it counts in memory by system time, and Server Actions
 * call `auth.api` directly, which it never sees. Its HTTP handler is not mounted.
 */
export function createBetterAuth(deps: BetterAuthDeps) {
  const stampCreated = <T extends object>(row: T) => {
    const createdAt = deps.clock.now();
    return { ...row, createdAt, updatedAt: createdAt };
  };
  const stampUpdated = <T extends object>(row: T) => ({ ...row, updatedAt: deps.clock.now() });

  return betterAuth({
    appName: "Makam.co.id",
    baseURL: deps.baseURL,
    secret: deps.secret,
    database: drizzleAdapter(deps.db, {
      provider: "pg",
      schema: {
        user: identityUser,
        session: identitySession,
        account: identityAuthAccount,
        verification: identityVerification,
      },
    }),
    session: {
      expiresIn: PEMESAN_SESSION_MS / 1000,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      useSecureCookies: deps.baseURL.startsWith("https:"),
    },
    databaseHooks: {
      user: {
        create: { before: async (user) => ({ data: stampCreated(user) }) },
        update: { before: async (user) => ({ data: stampUpdated(user) }) },
      },
      session: {
        create: {
          before: async (session) => {
            const stamped = stampCreated(session);
            return {
              data: { ...stamped, expiresAt: new Date(stamped.createdAt.getTime() + PEMESAN_SESSION_MS) },
            };
          },
        },
        update: { before: async (session) => ({ data: stampUpdated(session) }) },
      },
      account: {
        create: { before: async (account) => ({ data: stampCreated(account) }) },
        update: { before: async (account) => ({ data: stampUpdated(account) }) },
      },
      verification: {
        create: { before: async (verification) => ({ data: stampCreated(verification) }) },
        update: { before: async (verification) => ({ data: stampUpdated(verification) }) },
      },
    },
    plugins: [
      phoneNumber({
        sendOTP: () => {
          throw new Error("Login OTPs are sent by the identity module (requestOtp), not by Better Auth.");
        },
        verifyOTP: async ({ phoneNumber: number, code }) => deps.consumeLoginProof(number, code),
        signUpOnVerification: {
          getTempEmail: (number) => `${number.replace(/^\+/, "")}@wa.makam.invalid`,
          getTempName: () => "",
        },
      }),
    ],
  });
}

export type MakamAuth = ReturnType<typeof createBetterAuth>;

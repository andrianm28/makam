"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  identityMessage,
  type IdentityRefusal,
  type KodeMasukRequestState,
  type KodeMasukVerifyState,
} from "@/components/kode-masuk/state";
import type { Role } from "@/domain/identity";
import { clientIp } from "@/server/client-ip";
import { codeInput, emailInput } from "@/server/code-inputs";
import { serverRuntime } from "@/server/runtime";
import { setSessionCookies } from "@/server/session";

/*
 * Masuk is how a caller becomes authenticated, so these actions skip the
 * guard's authenticate and role steps (the one exception, noted in AGENTS.md):
 * they validate with Zod and call the identity module, which enforces every
 * Kode Masuk rule.
 */

const requestSchema = z.object({ email: emailInput });
const verifySchema = z.object({ email: emailInput, code: codeInput });

/** Sends (or re-sends) the Kode Masuk to the email typed; the same reply for every email. */
export async function kirimKodeMasuk(_previous: KodeMasukRequestState, formData: FormData): Promise<KodeMasukRequestState> {
  const typed = formData.get("email");
  const parsed = requestSchema.safeParse({ email: typed });
  if (!parsed.success) return { status: "gagal", message: identityMessage("email_tidak_valid") };

  const { identity, adapters } = serverRuntime();
  const result = await identity.requestKodeMasuk({ email: parsed.data.email, ip: await clientIp() });
  const now = adapters.clock.now();
  if (!result.ok) return { status: "gagal", message: refusalMessage(result, now), email: parsed.data.email };
  return {
    status: "terkirim",
    email: result.email,
    resendInSeconds: Math.max(0, Math.ceil((result.resendAt.getTime() - now.getTime()) / 1000)),
    sentAt: result.sentAt.toISOString(),
  };
}

/**
 * Checks the Kode Masuk; on success stores the session and lands on Akun
 * Saya, or the staff area for staff.
 */
export async function masukDenganKodeMasuk(_previous: KodeMasukVerifyState, formData: FormData): Promise<KodeMasukVerifyState> {
  const parsed = verifySchema.safeParse({ email: formData.get("email"), code: formData.get("code") });
  if (!parsed.success) return { status: "gagal", message: "Masukkan 6 angka Kode Masuk dari email Anda." };

  const { identity, adapters } = serverRuntime();
  const result = await identity.verifyKodeMasuk(parsed.data);
  if (!result.ok) return { status: "gagal", message: refusalMessage(result, adapters.clock.now()) };
  await setSessionCookies(result.session.cookies);
  redirect(landingFor(result.roles));
}

/** Staff go to the staff area (which holds an Admin Platform at the TOTP step first); a Pemesan to Akun Saya. */
function landingFor(roles: Role[]): string {
  return roles.some((role) => role !== "pemesan") ? "/staf" : "/akun";
}

/** The message for an identity refusal, with its wait time when it has one. */
function refusalMessage(refusal: { reason: IdentityRefusal; retryAt?: Date }, now: Date): string {
  return identityMessage(refusal.reason, refusal.retryAt, now);
}

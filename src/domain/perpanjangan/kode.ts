/**
 * The code to the email recorded on a Hak Pakai (ADR 0004; spec, Perpanjangan >
 * Paths). It is the identity module's own Kode Masuk, sent by it directly and
 * never through the message log; this module only decides *which address* it
 * goes to, so the recorded email is never handed to a page or a Server Action,
 * which would let anyone with a Hak Pakai id read the holder's address.
 */
import { normaliseEmail } from "@/domain/identity";
import type { RequestKodeMasukResult, VerifyKodeMasukResult } from "@/domain/identity";
import { samarkanEmail } from "./aturan";
import type { PerpanjanganDeps } from "./deps";

export type KirimKodeResult =
  | { ok: true; emailDisamarkan: string; sentAt: Date; expiresAt: Date; resendAt: Date }
  /** The Hak Pakai has no recorded email (or is unknown): the manual paths apply, and no code is sent. */
  | { ok: false; reason: "tanpa_email" }
  | Exclude<RequestKodeMasukResult, { ok: true }>;

/** The recorded email of a Hak Pakai, normalised; null when none is recorded or the Hak Pakai is unknown. */
async function emailTercatat(deps: PerpanjanganDeps, hakPakaiId: string): Promise<string | null> {
  const hak = await deps.inventory.hakPakaiUntukPerpanjangan(hakPakaiId);
  return hak?.pemegangHak?.email ? normaliseEmail(hak.pemegangHak.email) : null;
}

/** Sends a Kode Masuk to the email recorded on the Hak Pakai. */
export async function kirimKode(deps: PerpanjanganDeps, input: { hakPakaiId: string; ip: string }): Promise<KirimKodeResult> {
  const email = await emailTercatat(deps, input.hakPakaiId);
  if (!email) return { ok: false, reason: "tanpa_email" };
  const terkirim = await deps.identity.requestKodeMasuk({ email, ip: input.ip });
  if (!terkirim.ok) return terkirim;
  return { ok: true, emailDisamarkan: samarkanEmail(email), sentAt: terkirim.sentAt, expiresAt: terkirim.expiresAt, resendAt: terkirim.resendAt };
}

export type VerifikasiKodeResult = VerifyKodeMasukResult | { ok: false; reason: "tanpa_email" };

/**
 * Checks the code against the recorded email. A correct code is the login
 * itself (identity finds or creates the Akun of that email and starts its
 * session), exactly as Kirim's code step in the booking wizards is.
 */
export async function verifikasiKode(deps: PerpanjanganDeps, input: { hakPakaiId: string; code: string }): Promise<VerifikasiKodeResult> {
  const email = await emailTercatat(deps, input.hakPakaiId);
  if (!email) return { ok: false, reason: "tanpa_email" };
  return deps.identity.verifyKodeMasuk({ email, code: input.code });
}

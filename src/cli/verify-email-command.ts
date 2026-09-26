import { parseArgs } from "node:util";
import { z } from "zod";
import { createAdapters } from "@/composition/adapters";
import { composeIdentity } from "@/composition/identity";
import { createDatabase } from "@/db/client";
import type { MarkEmailVerifiedByOpsResult } from "@/domain/identity";
import { readRuntimeEnv } from "@/lib/env";
import { cliFailure } from "./cli-failure";

const USAGE = 'Pakai: verify-email <email Admin Platform> --alasan "<alasan>"';
const argsSchema = z.object({
  positionals: z.tuple([z.string().trim().min(1).max(254)]),
  values: z.object({ alasan: z.string().max(500) }),
});

type Refusal = Extract<MarkEmailVerifiedByOpsResult, { ok: false }>["reason"];
const refusals: Record<Refusal, string> = {
  alasan_wajib: 'Ditolak: alasan wajib diisi (--alasan "...").',
  bukan_admin_platform:
    "Ditolak: tidak ada Admin Platform dengan email ini yang belum terverifikasi (sudah Email Terverifikasi, atau bukan Admin Platform). Tidak ada yang diubah.",
  email_sudah_dipakai: "Ditolak: email ini sudah menjadi Email Terverifikasi Akun lain. Tidak ada yang ditandai.",
  email_tidak_valid: "Ditolak: email tidak valid.",
};

/**
 * `npm run verify-email -- <email> --alasan "<reason>"` / `node dist/verify-email.mjs <email> --alasan "<reason>"`:
 * the break-glass path for an Admin Platform from before ADR 0004 whose email
 * on record was never verified. It cannot log in (the Akun is keyed by its
 * Email Terverifikasi), and a Pemulihan Akun needs another Admin Platform, so
 * ops marks that email as its Email Terverifikasi from the server (runbook,
 * "An Admin Platform without an Email Terverifikasi"). Exit 0 marked, 1
 * refused or failed, 2 usage.
 */
export async function verifyEmailCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; output: string }> {
  let email: string;
  let reason: string;
  try {
    const parsed = argsSchema.safeParse(
      parseArgs({ args: argv, options: { alasan: { type: "string" } }, allowPositionals: true, strict: true }),
    );
    if (!parsed.success) return { exitCode: 2, output: USAGE };
    [email] = parsed.data.positionals;
    reason = parsed.data.values.alasan;
  } catch {
    return { exitCode: 2, output: USAGE };
  }

  try {
    const env = readRuntimeEnv(source);
    const database = createDatabase(env.DATABASE_URL, { max: 1, applicationName: "makam-verify-email" });
    try {
      const adapters = createAdapters({ appEnv: env.APP_ENV, smtp: env.smtp, vapid: env.vapid });
      const { identity } = composeIdentity({ env, db: database.db, adapters });
      const result = await identity.markEmailVerifiedByOps({ email, reason });
      if (!result.ok) return { exitCode: 1, output: refusals[result.reason] };
      return {
        exitCode: 0,
        output: `Email ${result.account.email} kini Email Terverifikasi Admin Platform itu. Masuk lewat /masuk dengan Kode Masuk ke email itu, lalu daftarkan TOTP.`,
      };
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

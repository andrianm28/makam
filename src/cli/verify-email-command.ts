import { parseArgs } from "node:util";
import { z } from "zod";
import { createAdapters } from "@/composition/adapters";
import { composeIdentity } from "@/composition/identity";
import { createDatabase } from "@/db/client";
import type { MarkEmailVerifiedByOpsResult } from "@/domain/identity";
import { readRuntimeEnv } from "@/lib/env";
import { phoneNumberRefusals } from "@/server/phone-number-messages";
import { cliFailure } from "./cli-failure";

const USAGE = 'Pakai: verify-email <nomor WhatsApp +62> --alasan "<alasan>"';
const argsSchema = z.object({
  positionals: z.tuple([z.string().trim().min(1).max(32)]),
  values: z.object({ alasan: z.string().max(500) }),
});

type Refusal = Extract<MarkEmailVerifiedByOpsResult, { ok: false }>["reason"];
const refusals: Record<Refusal, string> = {
  alasan_wajib: 'Ditolak: alasan wajib diisi (--alasan "...").',
  bukan_admin_platform: "Ditolak: nomor ini bukan Admin Platform.",
  email_sudah_dipakai: "Ditolak: email ini sudah menjadi Email Terverifikasi Akun lain. Tidak ada yang ditandai.",
  sudah_terverifikasi: "Ditolak: email Admin Platform ini sudah Email Terverifikasi. Tidak ada yang diubah.",
  nomor_tidak_valid: `Ditolak: ${phoneNumberRefusals.nomor_tidak_valid}`,
  nomor_bukan_indonesia: `Ditolak: ${phoneNumberRefusals.nomor_bukan_indonesia}`,
};

/**
 * `npm run verify-email -- <phone> --alasan "<reason>"` / `node dist/verify-email.mjs <phone> --alasan "<reason>"`:
 * ops marks an existing Admin Platform's email on record as its Email
 * Terverifikasi, so it can log in by email before the live WhatsApp adapter
 * (runbook, "Bootstrap: an Admin Platform's Email Terverifikasi"). Exit 0
 * marked, 1 refused or failed, 2 usage.
 */
export async function verifyEmailCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; output: string }> {
  let phoneNumber: string;
  let reason: string;
  try {
    const parsed = argsSchema.safeParse(
      parseArgs({ args: argv, options: { alasan: { type: "string" } }, allowPositionals: true, strict: true }),
    );
    if (!parsed.success) return { exitCode: 2, output: USAGE };
    [phoneNumber] = parsed.data.positionals;
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
      const result = await identity.markEmailVerifiedByOps({ phoneNumber, reason });
      if (!result.ok) return { exitCode: 1, output: refusals[result.reason] };
      return {
        exitCode: 0,
        output: `Email ${result.email} milik Admin Platform ${result.account.phoneNumber} kini Email Terverifikasi. Masuk lewat /masuk dengan email, lalu daftarkan TOTP.`,
      };
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

import { parseArgs } from "node:util";
import { createAdapters } from "@/composition/adapters";
import { composeIdentity } from "@/composition/identity";
import { createDatabase } from "@/db/client";
import type { ResetTotpResult } from "@/domain/identity";
import { readRuntimeEnv } from "@/lib/env";
import { cliFailure } from "./cli-failure";

const USAGE = 'Pakai: reset-totp <email Admin Platform> --alasan "<alasan>"';

type Refusal = Extract<ResetTotpResult, { ok: false }>["reason"];
const refusals: Record<Refusal, string> = {
  alasan_wajib: 'Ditolak: alasan wajib diisi (--alasan "...").',
  bukan_admin_platform: "Ditolak: email ini bukan Email Terverifikasi seorang Admin Platform.",
  totp_belum_terdaftar: "Ditolak: Admin Platform ini belum mendaftarkan authenticator; tidak ada yang direset.",
  email_tidak_valid: "Ditolak: email tidak valid.",
};

/**
 * `npm run reset-totp -- <email> --alasan "<reason>"` / `node dist/reset-totp.mjs <email> --alasan "<reason>"`:
 * ops resets an Admin Platform who lost their authenticator (runbook, "Resetting
 * an Admin Platform's TOTP"). Exit 0 reset, 1 refused or failed, 2 usage.
 */
export async function resetTotpCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; output: string }> {
  let email: string;
  let reason: string;
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: { alasan: { type: "string" } },
      allowPositionals: true,
      strict: true,
    });
    if (positionals.length !== 1 || values.alasan === undefined) return { exitCode: 2, output: USAGE };
    [email] = positionals;
    reason = values.alasan;
  } catch {
    return { exitCode: 2, output: USAGE };
  }

  try {
    const env = readRuntimeEnv(source);
    const database = createDatabase(env.DATABASE_URL, { max: 1, applicationName: "makam-reset-totp" });
    try {
      const adapters = createAdapters({ appEnv: env.APP_ENV, smtp: env.smtp, vapid: env.vapid });
      const { identity } = composeIdentity({ env, db: database.db, adapters });
      const result = await identity.resetTotp({ email, reason });
      if (!result.ok) return { exitCode: 1, output: refusals[result.reason] };
      return {
        exitCode: 0,
        output: `TOTP Admin Platform ${result.account.email} direset dan semua sesinya diakhiri. Saat masuk lagi ia mendaftarkan aplikasi authenticator baru.`,
      };
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

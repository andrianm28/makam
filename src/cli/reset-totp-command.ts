import { parseArgs } from "node:util";
import { createAdapters } from "@/composition/adapters";
import { composeIdentity } from "@/composition/identity";
import { createDatabase } from "@/db/client";
import type { ResetTotpResult } from "@/domain/identity";
import { readRuntimeEnv } from "@/lib/env";
import { phoneNumberRefusals } from "@/server/phone-number-messages";
import { cliFailure } from "./cli-failure";

const USAGE = 'Pakai: reset-totp <nomor WhatsApp +62> --alasan "<alasan>"';

type Refusal = Extract<ResetTotpResult, { ok: false }>["reason"];
const refusals: Record<Refusal, string> = {
  alasan_wajib: 'Ditolak: alasan wajib diisi (--alasan "...").',
  bukan_admin_platform: "Ditolak: nomor ini bukan Admin Platform.",
  totp_belum_terdaftar: "Ditolak: Admin Platform ini belum mendaftarkan authenticator; tidak ada yang direset.",
  nomor_tidak_valid: `Ditolak: ${phoneNumberRefusals.nomor_tidak_valid}`,
  nomor_bukan_indonesia: `Ditolak: ${phoneNumberRefusals.nomor_bukan_indonesia}`,
};

/**
 * `npm run reset-totp -- <phone> --alasan "<reason>"` / `node dist/reset-totp.mjs <phone> --alasan "<reason>"`:
 * ops resets an Admin Platform who lost their authenticator (runbook, "Resetting
 * an Admin Platform's TOTP"). Exit 0 reset, 1 refused or failed, 2 usage.
 */
export async function resetTotpCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; output: string }> {
  let phoneNumber: string;
  let reason: string;
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: { alasan: { type: "string" } },
      allowPositionals: true,
      strict: true,
    });
    if (positionals.length !== 1 || values.alasan === undefined) return { exitCode: 2, output: USAGE };
    [phoneNumber] = positionals;
    reason = values.alasan;
  } catch {
    return { exitCode: 2, output: USAGE };
  }

  try {
    const env = readRuntimeEnv(source);
    const database = createDatabase(env.DATABASE_URL, { max: 1, applicationName: "makam-reset-totp" });
    try {
      const adapters = createAdapters({ appEnv: env.APP_ENV });
      const { identity } = composeIdentity({ env, db: database.db, adapters });
      const result = await identity.resetTotp({ phoneNumber, reason });
      if (!result.ok) return { exitCode: 1, output: refusals[result.reason] };
      return {
        exitCode: 0,
        output: `TOTP Admin Platform ${result.account.phoneNumber} direset dan semua sesinya diakhiri. Saat masuk lagi ia mendaftarkan aplikasi authenticator baru.`,
      };
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

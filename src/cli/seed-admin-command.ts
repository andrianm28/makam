import { z } from "zod";
import { createAdapters } from "@/composition/adapters";
import { composeIdentity } from "@/composition/identity";
import { createDatabase } from "@/db/client";
import type { SeedResult } from "@/domain/identity";
import { readRuntimeEnv } from "@/lib/env";
import { phoneNumberRefusals } from "@/server/phone-number-messages";
import { cliFailure } from "./cli-failure";

const USAGE = "Pakai: seed:admin <nomor WhatsApp +62> <email>";
const argsSchema = z.tuple([z.string().trim().min(1).max(32), z.string().trim().min(1).max(254)]);

type Refusal = Extract<SeedResult, { ok: false }>["reason"];
const refusals: Record<Refusal, string> = {
  admin_platform_sudah_ada: "Ditolak: sudah ada Admin Platform. Admin Platform berikutnya diundang lewat Undangan Staf.",
  email_tidak_valid: "Ditolak: email tidak valid.",
  nomor_tidak_valid: `Ditolak: ${phoneNumberRefusals.nomor_tidak_valid}`,
  nomor_bukan_indonesia: `Ditolak: ${phoneNumberRefusals.nomor_bukan_indonesia}`,
};

/**
 * `npm run seed:admin <phone> <email>` / `node dist/seed-admin.mjs <phone> <email>`:
 * the only seed (spec, Pengaturan Operator). Creates the first Admin Platform
 * and nothing else; refused once an Admin Platform exists. Exit 0 created,
 * 1 refused or failed, 2 usage.
 */
export async function seedAdminCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; output: string }> {
  const args = argsSchema.safeParse(argv);
  if (!args.success) return { exitCode: 2, output: USAGE };
  const [phoneNumber, email] = args.data;

  try {
    const env = readRuntimeEnv(source);
    const database = createDatabase(env.DATABASE_URL, { max: 1, applicationName: "makam-seed-admin" });
    try {
      const adapters = createAdapters({ appEnv: env.APP_ENV });
      const { identity } = composeIdentity({ env, db: database.db, adapters });
      const result = await identity.seedFirstAdminPlatform({ phoneNumber, email });
      if (!result.ok) return { exitCode: 1, output: refusals[result.reason] };
      return {
        exitCode: 0,
        output: `Admin Platform pertama dibuat: ${result.account.phoneNumber} (${email.toLowerCase()}). Masuk lewat /masuk, lalu daftarkan TOTP.`,
      };
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

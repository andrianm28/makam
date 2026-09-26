import { parseArgs } from "node:util";
import { z } from "zod";
import { createAdapters } from "@/composition/adapters";
import { composeIdentity } from "@/composition/identity";
import { createDatabase } from "@/db/client";
import type { SeedResult } from "@/domain/identity";
import { readRuntimeEnv } from "@/lib/env";
import { phoneNumberRefusals } from "@/server/phone-number-messages";
import { cliFailure } from "./cli-failure";

const USAGE = "Pakai: seed:admin --email <email> --phone <nomor telepon +62>";
const argsSchema = z.object({
  positionals: z.tuple([]),
  values: z.object({
    email: z.string().trim().min(1).max(254),
    phone: z.string().trim().min(1).max(32),
  }),
});

type Refusal = Extract<SeedResult, { ok: false }>["reason"];
const refusals: Record<Refusal, string> = {
  admin_platform_sudah_ada: "Ditolak: sudah ada Admin Platform. Admin Platform berikutnya diundang lewat Undangan Staf.",
  email_tidak_valid: "Ditolak: email tidak valid.",
  nomor_tidak_valid: `Ditolak: ${phoneNumberRefusals.nomor_tidak_valid}`,
  nomor_bukan_indonesia: `Ditolak: ${phoneNumberRefusals.nomor_bukan_indonesia}`,
};

/**
 * `npm run seed:admin -- --email <email> --phone <phone>` / `node dist/seed-admin.mjs ...`:
 * the only seed (spec, Pengaturan Operator). Creates the first Admin Platform,
 * keyed by its email as its Email Terverifikasi (ADR 0004), with the phone
 * number as contact, and nothing else; refused once an Admin Platform exists.
 * Exit 0 created, 1 refused or failed, 2 usage.
 */
export async function seedAdminCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; output: string }> {
  let email: string;
  let phoneNumber: string;
  try {
    const args = argsSchema.safeParse(
      parseArgs({
        args: argv,
        options: { email: { type: "string" }, phone: { type: "string" } },
        allowPositionals: true,
        strict: true,
      }),
    );
    if (!args.success) return { exitCode: 2, output: USAGE };
    ({ email, phone: phoneNumber } = args.data.values);
  } catch {
    return { exitCode: 2, output: USAGE };
  }

  try {
    const env = readRuntimeEnv(source);
    const database = createDatabase(env.DATABASE_URL, { max: 1, applicationName: "makam-seed-admin" });
    try {
      const adapters = createAdapters({ appEnv: env.APP_ENV, smtp: env.smtp, vapid: env.vapid });
      const { identity } = composeIdentity({ env, db: database.db, adapters });
      const result = await identity.seedFirstAdminPlatform({ email, phoneNumber });
      if (!result.ok) return { exitCode: 1, output: refusals[result.reason] };
      return {
        exitCode: 0,
        output: `Admin Platform pertama dibuat: ${result.account.email} (Email Terverifikasi; telepon ${result.account.phoneNumber}). Masuk lewat /masuk dengan Kode Masuk ke email itu, lalu daftarkan TOTP.`,
      };
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

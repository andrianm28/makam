import { z } from "zod";
import { createAdapters } from "@/composition/adapters";
import { createDatabase } from "@/db/client";
import { createAuditLog } from "@/domain/audit";
import { createIdentity, type SeedResult } from "@/domain/identity";
import { readRuntimeEnv } from "@/lib/env";

const USAGE = "Pakai: seed:admin <nomor WhatsApp +62> <email>";
const argsSchema = z.tuple([z.string().trim().min(1).max(32), z.string().trim().min(1).max(254)]);

type Refusal = Extract<SeedResult, { ok: false }>["reason"];
const refusals: Record<Refusal, string> = {
  admin_platform_sudah_ada: "Ditolak: sudah ada Admin Platform. Admin Platform berikutnya diundang lewat Undangan Staf.",
  email_tidak_valid: "Ditolak: email tidak valid.",
  nomor_tidak_valid: "Ditolak: nomor WhatsApp tidak valid.",
  nomor_bukan_indonesia: "Ditolak: gunakan nomor WhatsApp Indonesia (+62).",
};

/**
 * `npm run seed:admin <phone> <email>` / `node dist/seed-admin.mjs <phone> <email>`:
 * the only seed (spec, Pengaturan Operator). Creates the first Admin Platform
 * and nothing else; refused once an Admin Platform exists.
 */
export async function seedAdminCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; output: string }> {
  const args = argsSchema.safeParse(argv);
  if (!args.success) return { exitCode: 2, output: USAGE };
  const [phoneNumber, email] = args.data;

  const env = readRuntimeEnv(source);
  const database = createDatabase(env.DATABASE_URL, { max: 1, applicationName: "makam-seed-admin" });
  try {
    const adapters = createAdapters({ appEnv: env.APP_ENV });
    const audit = createAuditLog({ db: database.db, clock: adapters.clock });
    const identity = createIdentity({
      db: database.db,
      clock: adapters.clock,
      whatsapp: adapters.whatsapp,
      files: adapters.files,
      audit,
      secret: env.AUTH_SECRET,
      totpEncryptionKey: env.TOTP_ENCRYPTION_KEY,
      baseURL: env.APP_BASE_URL,
    });
    const result = await identity.seedFirstAdminPlatform({ phoneNumber, email });
    if (!result.ok) return { exitCode: 1, output: refusals[result.reason] };
    return {
      exitCode: 0,
      output: `Admin Platform pertama dibuat: ${result.account.phoneNumber} (${email.toLowerCase()}). Masuk lewat /masuk, lalu daftarkan TOTP.`,
    };
  } finally {
    await database.close();
  }
}

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdapters } from "@/composition/adapters";
import { composeBilling } from "@/composition/billing";
import { composeIdentity } from "@/composition/identity";
import { createDatabase } from "@/db/client";
import type { Actor } from "@/domain/identity";
import { createOperatorSettings } from "@/domain/operator-settings";
import { appEnvironments, readRuntimeEnv, usesInMemoryFakes } from "@/lib/env";
import { documentPagePath } from "@/lib/document-links";
import type { Rupiah } from "@/lib/rupiah";
import { cliFailure } from "./cli-failure";

const USAGE = "Pakai: seed-tagihan";

/** The example Pengaturan Operator a fresh local stack gets (never on staging or production). */
const CONTOH_PENGATURAN_OPERATOR = {
  legalName: "PT Jaya Korpora Prima",
  address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
  phone: "(021) 555-0101",
  email: "halo@makam.co.id",
  csWhatsApp: "0811-2222-3333",
  csReplyHours: "dibalas mulai pukul 06:00",
  reason: "Contoh untuk stack lokal (seed-tagihan)",
};

/**
 * `node dist/seed-tagihan.mjs` inside a development or test stack: issues an
 * example Tagihan (Belum Dibayar, Rp 150.000) and prints its page, so the
 * payment path can be walked (and end-to-end tested) before the order flows
 * that issue real Tagihan exist. On a stack without Pengaturan Operator it
 * first enters example values, as the stack's first Admin Platform (seeded
 * by seed:admin). Refused on staging and production. Exit 0 issued, 1
 * refused or failed, 2 usage.
 */
export async function seedTagihanCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; output: string }> {
  if (argv.length > 0) return { exitCode: 2, output: USAGE };
  const appEnv = z.enum(appEnvironments).default("development").safeParse(source.APP_ENV);
  if (!appEnv.success || !usesInMemoryFakes(appEnv.data)) {
    return { exitCode: 1, output: "Ditolak: seed-tagihan hanya untuk development dan test." };
  }

  try {
    const env = readRuntimeEnv(source);
    const database = createDatabase(env.DATABASE_URL, { max: 1, applicationName: "makam-seed-tagihan" });
    try {
      const adapters = createAdapters({ appEnv: env.APP_ENV, vapid: env.vapid });
      const { audit, identity } = composeIdentity({ env, db: database.db, adapters });
      const operatorSettings = createOperatorSettings({ db: database.db, clock: adapters.clock, audit });
      const billing = composeBilling({ env, db: database.db, adapters, operatorSettings, reportError: () => {} });

      if (!(await operatorSettings.current())) {
        const admin = (await identity.staffAccounts()).find(
          (account) => account.roles.includes("admin_platform") && !account.deactivated,
        );
        if (!admin) return { exitCode: 1, output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu." };
        // Local stacks only: acts as that Admin Platform past TOTP, as a developer with the stack's shell could anyway.
        const asAdmin: Actor = {
          accountId: admin.accountId,
          email: admin.email ?? "",
          phoneNumber: admin.phoneNumber,
          roles: ["admin_platform"],
          lokasiIds: [],
          totp: "lolos",
          sessionId: `seed-tagihan-${randomUUID()}`,
        };
        const entered = await operatorSettings.change(asAdmin, CONTOH_PENGATURAN_OPERATOR);
        if (!entered.ok) return { exitCode: 1, output: `Ditolak: Pengaturan Operator contoh tidak tersimpan (${entered.reason}).` };
      }

      const issued = await billing.issueTagihan({
        moment: { kind: "pengurusan_berkas" },
        addressee: { name: "Contoh Pemesan", phoneNumber: "081200000000", accountId: null },
        nomorPemesanan: null,
        placeName: null,
        lines: [
          {
            kind: "biaya_layanan_platform",
            label: "Biaya Layanan Platform (contoh)",
            amount: 150_000 as Rupiah,
            provider: { kind: "operator" },
          },
        ],
      });
      if (!issued.ok) return { exitCode: 1, output: `Ditolak: Tagihan contoh tidak terbit (${issued.reason}).` };
      return {
        exitCode: 0,
        output: `Tagihan contoh ${issued.tagihan.nomorTagihan} terbit: ${documentPagePath(issued.tagihan.link)}`,
      };
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

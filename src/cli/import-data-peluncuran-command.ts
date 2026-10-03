/**
 * The import of the launch reference data the owner fills in the template under
 * `docs/ops/data-peluncuran/` (ticket 06): the DKI TPU, the Biaya Pengurusan, the
 * DKI Layanan prices with the Mitra Jasa rate, and the Nazhir list.
 *
 * It writes only through the owning modules' public functions, acting as the
 * stack's first Admin Platform past TOTP (an ops command on a stack whose shell the
 * operator already holds, as `import:katalog-lama` does). A dry run unless `--tulis`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { composeIdentity } from "@/composition/identity";
import { createAdapters } from "@/composition/adapters";
import { createDatabase } from "@/db/client";
import type { Actor } from "@/domain/identity";
import { createLokasi, type Lokasi } from "@/domain/lokasi";
import { appEnvironments, readRuntimeEnv } from "@/lib/env";
import { wibDateOf } from "@/lib/time/jakarta";
import type { Clock } from "@/ports/clock";
import { alasanBaris, barisTpuSchema, type BarisTpu } from "./data-peluncuran/baris";
import { bacaCsv } from "./data-peluncuran/csv";
import { cliFailure } from "./cli-failure";

const USAGE = "Pakai: import:data-peluncuran --sumber <folder> [--tulis] [--izinkan-staging] [--izinkan-production]";

/** What one kind of row came to: counted, and every refusal with its line and reason. */
interface Ringkasan {
  dibaca: number;
  dibuat: number;
  diubah: number;
  sama: number;
  ditolak: string[];
}

const kosong = (): Ringkasan => ({ dibaca: 0, dibuat: 0, diubah: 0, sama: 0, ditolak: [] });

function bacaBerkas(folder: string, nama: string): ReturnType<typeof bacaCsv> | null {
  const path = join(folder, nama);
  return existsSync(path) ? bacaCsv(readFileSync(path, "utf8")) : null;
}

async function olahTpu(folder: string, lokasi: Lokasi, aktor: Actor, tulis: boolean): Promise<Ringkasan> {
  const hasil = kosong();
  const csv = bacaBerkas(folder, "tpu-dki.csv");
  if (!csv) return hasil;
  const ada = new Map((await lokasi.tpuDkiList(aktor)).map((tpu) => [tpu.name, tpu]));
  for (const baris of csv.baris) {
    hasil.dibaca += 1;
    const parsed = barisTpuSchema.safeParse(baris.nilai);
    if (!parsed.success) {
      hasil.ditolak.push(`tpu-dki.csv baris ${baris.nomor}: ${alasanBaris(parsed.error)}`);
      continue;
    }
    const tpu: BarisTpu = parsed.data;
    if (ada.has(tpu.name)) continue;
    if (tulis) {
      const dibuat = await lokasi.createTpuDki(aktor, tpu);
      if (!dibuat.ok) {
        hasil.ditolak.push(`tpu-dki.csv baris ${baris.nomor}: ${dibuat.reason}`);
        continue;
      }
    }
    hasil.dibuat += 1;
  }
  return hasil;
}

/**
 * `npm run import:data-peluncuran -- --sumber <folder> [--tulis]`. Exit 0 done,
 * 1 refused or failed, 2 usage.
 */
export async function importDataPeluncuranCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
  options: { clock?: Clock } = {},
): Promise<{ exitCode: number; output: string }> {
  let sumber: string;
  let tulis: boolean;
  try {
    const args = parseArgs({
      args: argv,
      options: {
        sumber: { type: "string" },
        tulis: { type: "boolean" },
        "izinkan-staging": { type: "boolean" },
        "izinkan-production": { type: "boolean" },
      },
      allowPositionals: false,
      strict: true,
    });
    if (!args.values.sumber) return { exitCode: 2, output: USAGE };
    sumber = args.values.sumber;
    tulis = args.values.tulis === true;
  } catch {
    return { exitCode: 2, output: USAGE };
  }
  const appEnv = z.enum(appEnvironments).default("development").safeParse(source.APP_ENV);
  if (!appEnv.success) return { exitCode: 1, output: `Ditolak: APP_ENV tidak dikenal (${String(source.APP_ENV)}).` };

  try {
    const env = readRuntimeEnv(source);
    const database = createDatabase(env.DATABASE_URL, { max: 1, applicationName: "makam-import-data-peluncuran" });
    try {
      const adapters = createAdapters({
        appEnv: env.APP_ENV,
        smtp: env.smtp,
        vapid: env.vapid,
        devFilesRoot: env.DEV_FILES_ROOT,
        overrides: options.clock ? { clock: options.clock } : undefined,
      });
      const { audit, identity } = composeIdentity({ env, db: database.db, adapters });
      const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
      const admin = (await identity.staffAccounts()).find(
        (account) => account.roles.includes("admin_platform") && !account.deactivated,
      );
      if (!admin) return { exitCode: 1, output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu." };
      const aktor: Actor = {
        accountId: admin.accountId,
        email: admin.email ?? "",
        phoneNumber: admin.phoneNumber,
        roles: ["admin_platform"],
        lokasiIds: [],
        totp: "lolos",
        sessionId: `import-data-peluncuran-${wibDateOf(adapters.clock.now())}`,
      };
      const tpu = await olahTpu(sumber, lokasi, aktor, tulis);
      return {
        exitCode: 0,
        output: [
          tulis ? "[import-data-peluncuran] Ditulis." : "[import-data-peluncuran] Mode dry-run: tidak ada yang ditulis.",
          `TPU DKI: ${tpu.dibaca} baris dibaca, ${tpu.dibuat} ${tulis ? "dibuat" : "akan dibuat"}, ${tpu.diubah} diubah, ${tpu.sama} sama, ${tpu.ditolak.length} ditolak.`,
        ].join("\n"),
      };
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

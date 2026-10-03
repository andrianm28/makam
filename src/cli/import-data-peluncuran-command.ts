/**
 * The import of the launch reference data the owner fills in the template under
 * `docs/ops/data-peluncuran/` (ticket 06): the DKI TPU, the Biaya Pengurusan, the
 * DKI Layanan prices with the Mitra Jasa rate, and the Nazhir list.
 *
 * It writes only through the owning modules' public functions, acting as the
 * stack's first Admin Platform past TOTP (an ops command on a stack whose shell the
 * operator already holds, as `import:katalog-lama` does). A dry run unless `--tulis`.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { composeIdentity } from "@/composition/identity";
import { createAdapters } from "@/composition/adapters";
import { createDatabase } from "@/db/client";
import type { Actor } from "@/domain/identity";
import { createKatalogLayanan, type Layanan } from "@/domain/layanan";
import { createLokasi, type Lokasi, type TpuDki } from "@/domain/lokasi";
import { createNazhirList, type Wakaf } from "@/domain/wakaf";
import { createTariffs, type Tariffs } from "@/domain/tariffs";
import { appEnvironments, readRuntimeEnv } from "@/lib/env";
import { wib, wibDateOf } from "@/lib/time/jakarta";
import type { Clock } from "@/ports/clock";
import { alasanBaris, barisBiayaSchema, barisLayananSchema, barisNazhirSchema, barisTpuSchema, type BarisTpu } from "./data-peluncuran/baris";
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

function samaDenganTpu(lama: TpuDki, baru: BarisTpu): boolean {
  return (
    lama.address === baru.address &&
    lama.city === baru.city &&
    lama.dataSource === baru.dataSource &&
    lama.menerimaMakamBaru === baru.menerimaMakamBaru &&
    lama.pin?.lat === baru.pin?.lat &&
    lama.pin?.lng === baru.pin?.lng
  );
}

async function olahTpu(folder: string, lokasi: Lokasi, aktor: Actor, tulis: boolean): Promise<Ringkasan> {
  const hasil = kosong();
  const csv = bacaBerkas(folder, "tpu-dki.csv");
  if (!csv) return hasil;
  const ada = new Map((await lokasi.tpuDkiList(aktor)).map((tpu) => [tpu.name, tpu]));
  const terlihat = new Map<string, number>();
  for (const baris of csv.baris) {
    hasil.dibaca += 1;
    const parsed = barisTpuSchema.safeParse(baris.nilai);
    if (!parsed.success) {
      hasil.ditolak.push(`tpu-dki.csv baris ${baris.nomor}: ${alasanBaris(parsed.error)}`);
      continue;
    }
    const tpu: BarisTpu = parsed.data;
    const pertama = terlihat.get(tpu.name);
    if (pertama !== undefined) {
      hasil.ditolak.push(`tpu-dki.csv baris ${baris.nomor}: nama "${tpu.name}" sudah muncul di baris ${pertama}`);
      continue;
    }
    terlihat.set(tpu.name, baris.nomor);
    const lama = ada.get(tpu.name);
    if (lama) {
      if (samaDenganTpu(lama, tpu)) {
        hasil.sama += 1;
        continue;
      }
      if (tulis) {
        const { menerimaMakamBaru, ...profil } = tpu;
        const profilBerubah = lama.address !== tpu.address || lama.city !== tpu.city || lama.dataSource !== tpu.dataSource || lama.pin?.lat !== tpu.pin?.lat || lama.pin?.lng !== tpu.pin?.lng;
        const diubah = profilBerubah ? await lokasi.updateTpuDki(aktor, lama.id, profil) : { ok: true as const };
        const bendera = diubah.ok && lama.menerimaMakamBaru !== menerimaMakamBaru ? await lokasi.updateTpuDkiFlag(aktor, lama.id, { menerimaMakamBaru }) : diubah;
        if (!bendera.ok) {
          hasil.ditolak.push(`tpu-dki.csv baris ${baris.nomor}: ${bendera.reason}`);
          continue;
        }
      }
      hasil.diubah += 1;
      continue;
    }
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

const ALASAN_IMPOR = "Impor data peluncuran (ticket 06)";

/** The moment a version entered for `berlakuMulai` is in force: now, or the start of a later date. */
function saatBerlaku(berlakuMulai: string | null, sekarang: Date): Date {
  const hariIni = wibDateOf(sekarang);
  return berlakuMulai !== null && berlakuMulai > hariIni ? wib(`${berlakuMulai} 00:00`) : sekarang;
}

async function olahBiaya(folder: string, tariffs: Tariffs, aktor: Actor, sekarang: Date, tulis: boolean): Promise<Ringkasan> {
  const hasil = kosong();
  const csv = bacaBerkas(folder, "biaya-pengurusan.csv");
  if (!csv) return hasil;
  const terlihat = new Set<string>();
  for (const baris of csv.baris) {
    hasil.dibaca += 1;
    const parsed = barisBiayaSchema.safeParse(baris.nilai);
    if (!parsed.success) {
      hasil.ditolak.push(`biaya-pengurusan.csv baris ${baris.nomor}: ${alasanBaris(parsed.error)}`);
      continue;
    }
    const biaya = parsed.data;
    if (terlihat.has(biaya.jenis)) {
      hasil.ditolak.push(`biaya-pengurusan.csv baris ${baris.nomor}: jenis "${biaya.jenis}" sudah muncul di baris sebelumnya`);
      continue;
    }
    terlihat.add(biaya.jenis);
    const berlaku = await tariffs.globalTariff(biaya.kunci, saatBerlaku(biaya.berlakuMulai, sekarang));
    if (berlaku?.amount === biaya.jumlah) {
      hasil.sama += 1;
      continue;
    }
    if (tulis) {
      const dicatat = await tariffs.setGlobalTariff(aktor, {
        key: biaya.kunci,
        amount: biaya.jumlah,
        effectiveOn: biaya.berlakuMulai ?? wibDateOf(sekarang),
        reason: ALASAN_IMPOR,
      });
      if (!dicatat.ok) {
        hasil.ditolak.push(`biaya-pengurusan.csv baris ${baris.nomor}: ${dicatat.reason}`);
        continue;
      }
    }
    if (berlaku) hasil.diubah += 1;
    else hasil.dibuat += 1;
  }
  return hasil;
}

/** The name a Layanan or variant is matched on: case and surrounding spaces are the spreadsheet's, not the catalog's. */
const kunciNama = (nama: string) => nama.trim().toLowerCase();

async function olahLayanan(
  folder: string,
  katalogLayanan: Pick<Layanan, "katalog">,
  tariffs: Tariffs,
  aktor: Actor,
  sekarang: Date,
  tulis: boolean,
): Promise<Ringkasan> {
  const hasil = kosong();
  const csv = bacaBerkas(folder, "layanan-dki.csv");
  if (!csv) return hasil;
  const varianId = new Map<string, string>();
  for (const layanan of await katalogLayanan.katalog()) {
    for (const varian of layanan.varian) varianId.set(`${kunciNama(layanan.name)}|${kunciNama(varian.name)}`, varian.id);
  }
  const terlihat = new Map<string, number>();
  for (const baris of csv.baris) {
    hasil.dibaca += 1;
    const parsed = barisLayananSchema.safeParse(baris.nilai);
    if (!parsed.success) {
      hasil.ditolak.push(`layanan-dki.csv baris ${baris.nomor}: ${alasanBaris(parsed.error)}`);
      continue;
    }
    const row = parsed.data;
    const kunci = `${kunciNama(row.layanan)}|${kunciNama(row.varian)}`;
    const id = varianId.get(kunci);
    if (!id) {
      hasil.ditolak.push(`layanan-dki.csv baris ${baris.nomor}: varian "${row.varian}" dari Layanan "${row.layanan}" tidak ada di katalog Layanan`);
      continue;
    }
    const pertama = terlihat.get(kunci);
    if (pertama !== undefined) {
      hasil.ditolak.push(`layanan-dki.csv baris ${baris.nomor}: varian "${row.varian}" dari "${row.layanan}" sudah muncul di baris ${pertama}`);
      continue;
    }
    terlihat.set(kunci, baris.nomor);
    const saat = saatBerlaku(row.berlakuMulai, sekarang);
    const dki = await tariffs.hargaLayananDki(id, saat);
    const mitra = await tariffs.mitraJasaRate(aktor, id, saat);
    const dkiSama = dki?.amount === row.hargaDki;
    const mitraSama = mitra?.amount === row.tarifMitraJasa;
    if (dkiSama && mitraSama) {
      hasil.sama += 1;
      continue;
    }
    if (tulis) {
      const berlaku = row.berlakuMulai ?? wibDateOf(sekarang);
      const dicatat = dkiSama ? { ok: true as const } : await tariffs.setHargaLayananDki(aktor, id, { amount: row.hargaDki, effectiveOn: berlaku, reason: ALASAN_IMPOR });
      const dicatatMitra = !dicatat.ok || mitraSama ? dicatat : await tariffs.setTarifMitraJasa(aktor, id, { amount: row.tarifMitraJasa, effectiveOn: berlaku, reason: ALASAN_IMPOR });
      if (!dicatatMitra.ok) {
        hasil.ditolak.push(`layanan-dki.csv baris ${baris.nomor}: ${dicatatMitra.reason}`);
        continue;
      }
    }
    if (dki || mitra) hasil.diubah += 1;
    else hasil.dibuat += 1;
  }
  return hasil;
}

async function olahNazhir(
  folder: string,
  wakaf: Pick<Wakaf, "daftarNazhir" | "tambahNazhir" | "ubahNazhir">,
  aktor: Actor,
  tulis: boolean,
): Promise<Ringkasan> {
  const hasil = kosong();
  const csv = bacaBerkas(folder, "nazhir.csv");
  if (!csv) return hasil;
  const kunci = (nama: string, kabKota: string) => `${kunciNama(nama)}|${kunciNama(kabKota)}`;
  const ada = new Map((await wakaf.daftarNazhir(aktor)).map((nazhir) => [kunci(nazhir.nama, nazhir.kabKota), nazhir]));
  const terlihat = new Map<string, number>();
  for (const baris of csv.baris) {
    hasil.dibaca += 1;
    const parsed = barisNazhirSchema.safeParse(baris.nilai);
    if (!parsed.success) {
      hasil.ditolak.push(`nazhir.csv baris ${baris.nomor}: ${alasanBaris(parsed.error)}`);
      continue;
    }
    const nazhir = parsed.data;
    const kunciBaris = kunci(nazhir.nama, nazhir.kab_kota);
    const pertama = terlihat.get(kunciBaris);
    if (pertama !== undefined) {
      hasil.ditolak.push(`nazhir.csv baris ${baris.nomor}: "${nazhir.nama}" di ${nazhir.kab_kota} sudah muncul di baris ${pertama}`);
      continue;
    }
    terlihat.set(kunciBaris, baris.nomor);
    const input = { nama: nazhir.nama, jenis: nazhir.jenis, kabKota: nazhir.kab_kota, kontak: nazhir.kontak, nomorBwi: nazhir.nomor_bwi };
    const lama = ada.get(kunciBaris);
    if (lama && lama.jenis === input.jenis && lama.kontak === input.kontak && lama.nomorBwi === input.nomorBwi) {
      hasil.sama += 1;
      continue;
    }
    if (tulis) {
      const dicatat = lama ? await wakaf.ubahNazhir(aktor, { ...input, nazhirId: lama.id }) : await wakaf.tambahNazhir(aktor, input);
      if (!dicatat.ok) {
        hasil.ditolak.push(`nazhir.csv baris ${baris.nomor}: ${dicatat.reason}`);
        continue;
      }
    }
    if (lama) hasil.diubah += 1;
    else hasil.dibuat += 1;
  }
  return hasil;
}

/** The report a run ends with: one line of counts per kind, then every refusal. Exit 1 when any row was refused. */
function laporan(tulis: boolean, bagian: { judul: string; ringkasan: Ringkasan }[]): { exitCode: number; output: string } {
  const ditolak = bagian.flatMap((satu) => satu.ringkasan.ditolak);
  const baris = [
    tulis ? "[import-data-peluncuran] Ditulis." : "[import-data-peluncuran] Mode dry-run: tidak ada yang ditulis.",
    ...bagian.map(({ judul, ringkasan: r }) =>
      `${judul}: ${r.dibaca} baris dibaca, ${r.dibuat} ${tulis ? "dibuat" : "akan dibuat"}, ${r.diubah} ${tulis ? "diubah" : "akan diubah"}, ${r.sama} sama, ${r.ditolak.length} ditolak.`,
    ),
  ];
  if (ditolak.length > 0) baris.push(`Ditolak (${ditolak.length}):`, ...ditolak.map((alasan) => `  - ${alasan}`));
  if (!tulis) baris.push("Gunakan --tulis untuk menulisnya.");
  return { exitCode: ditolak.length > 0 ? 1 : 0, output: baris.join("\n") };
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
  let izinkanStaging: boolean;
  let izinkanProduction: boolean;
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
    izinkanStaging = args.values["izinkan-staging"] === true;
    izinkanProduction = args.values["izinkan-production"] === true;
  } catch {
    return { exitCode: 2, output: USAGE };
  }
  if (!existsSync(sumber) || !statSync(sumber).isDirectory()) return { exitCode: 2, output: `${USAGE}\n--sumber harus folder yang berisi berkas CSV template.` };
  const berkasTemplate = ["tpu-dki.csv", "biaya-pengurusan.csv", "layanan-dki.csv", "nazhir.csv"];
  if (!berkasTemplate.some((nama) => existsSync(join(sumber, nama)))) {
    return { exitCode: 1, output: `Ditolak: tidak ada satu pun berkas template di ${sumber}: ${berkasTemplate.join(", ")}.` };
  }
  const appEnv = z.enum(appEnvironments).default("development").safeParse(source.APP_ENV);
  if (!appEnv.success) return { exitCode: 1, output: `Ditolak: APP_ENV tidak dikenal (${String(source.APP_ENV)}).` };

  // Each stack beyond development and test is named: staging by its allowance, production by its own flag
  // (never implied by the staging one).
  if (appEnv.data === "production" && !izinkanProduction) {
    return { exitCode: 1, output: "Ditolak: di production perlu --izinkan-production (ditolak secara bawaan)." };
  }
  if (appEnv.data === "staging" && !izinkanStaging) {
    return { exitCode: 1, output: "Ditolak: di staging perlu --izinkan-staging (ditolak secara bawaan)." };
  }

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
      const tariffs = createTariffs({ db: database.db, clock: adapters.clock, audit, lokasi });
      const tpu = await olahTpu(sumber, lokasi, aktor, tulis);
      const biaya = await olahBiaya(sumber, tariffs, aktor, adapters.clock.now(), tulis);
      const layanan = await olahLayanan(sumber, createKatalogLayanan({ db: database.db }), tariffs, aktor, adapters.clock.now(), tulis);
      const nazhir = await olahNazhir(sumber, createNazhirList({ db: database.db, clock: adapters.clock, audit }), aktor, tulis);
      return laporan(tulis, [
        { judul: "TPU DKI", ringkasan: tpu },
        { judul: "Biaya Pengurusan", ringkasan: biaya },
        { judul: "Layanan DKI", ringkasan: layanan },
        { judul: "Nazhir", ringkasan: nazhir },
      ]);
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

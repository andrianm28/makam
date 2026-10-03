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
import { createDatabase, type Database } from "@/db/client";
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

/** The name a row is matched on, folded as the owning modules fold it (lower case, single spaces): case and spacing are the spreadsheet's, not the data's. */
const kunciNama = (nama: string) => nama.trim().toLowerCase().replace(/\s+/g, " ");

/** Whether the TPU's own profile (not its new-plot flag) differs from the row. */
function profilBerbeda(lama: TpuDki, baru: BarisTpu): boolean {
  return (
    lama.address !== baru.address ||
    lama.city !== baru.city ||
    lama.dataSource !== baru.dataSource ||
    lama.pin?.lat !== baru.pin?.lat ||
    lama.pin?.lng !== baru.pin?.lng
  );
}

function samaDenganTpu(lama: TpuDki, baru: BarisTpu): boolean {
  return !profilBerbeda(lama, baru) && lama.menerimaMakamBaru === baru.menerimaMakamBaru;
}

async function olahTpu(folder: string, lokasi: Lokasi, aktor: Actor): Promise<Ringkasan> {
  const hasil = kosong();
  const csv = bacaBerkas(folder, "tpu-dki.csv");
  if (!csv) return hasil;
  const ada = new Map((await lokasi.tpuDkiList(aktor)).map((tpu) => [kunciNama(tpu.name), tpu]));
  const terlihat = new Map<string, number>();
  for (const baris of csv.baris) {
    hasil.dibaca += 1;
    const parsed = barisTpuSchema.safeParse(baris.nilai);
    if (!parsed.success) {
      hasil.ditolak.push(`tpu-dki.csv baris ${baris.nomor}: ${alasanBaris(parsed.error)}`);
      continue;
    }
    const tpu: BarisTpu = parsed.data;
    const pertama = terlihat.get(kunciNama(tpu.name));
    if (pertama !== undefined) {
      hasil.ditolak.push(`tpu-dki.csv baris ${baris.nomor}: nama "${tpu.name}" sudah muncul di baris ${pertama}`);
      continue;
    }
    terlihat.set(kunciNama(tpu.name), baris.nomor);
    const lama = ada.get(kunciNama(tpu.name));
    if (lama) {
      if (samaDenganTpu(lama, tpu)) {
        hasil.sama += 1;
        continue;
      }
      // The stored name stays as it was entered: only the match is folded, a renaming is a screen's job.
      const { menerimaMakamBaru, ...profil } = { ...tpu, name: lama.name };
      const diubah = profilBerbeda(lama, tpu) ? await lokasi.updateTpuDki(aktor, lama.id, profil) : { ok: true as const };
      const bendera = diubah.ok && lama.menerimaMakamBaru !== menerimaMakamBaru ? await lokasi.updateTpuDkiFlag(aktor, lama.id, { menerimaMakamBaru }) : diubah;
      if (!bendera.ok) {
        hasil.ditolak.push(`tpu-dki.csv baris ${baris.nomor}: ${alasanModul(bendera.reason)}`);
        continue;
      }
      hasil.diubah += 1;
      continue;
    }
    const dibuat = await lokasi.createTpuDki(aktor, tpu);
    if (!dibuat.ok) {
      hasil.ditolak.push(`tpu-dki.csv baris ${baris.nomor}: ${alasanModul(dibuat.reason)}`);
      continue;
    }
    hasil.dibuat += 1;
  }
  return hasil;
}

/** The owner's words for a refusal code a module returns; an unknown code is shown as it is. */
function alasanModul(reason: string, berlakuMulai?: string | null): string {
  switch (reason) {
    case "tanggal_berlaku_lampau":
      return `berlaku_mulai ${berlakuMulai ?? "hari ini"} sudah lewat: tanggal berlaku tidak boleh lampau`;
    case "nama_sudah_ada":
      return "nama sudah dipakai";
    case "tarif_tidak_valid":
      return "jumlah tidak diterima Tariffs (bilangan bulat rupiah, 0 sampai Rp 100.000.000.000)";
    case "tpu_tidak_valid":
    case "input_tidak_valid":
    case "layanan_tidak_valid":
      return "isi baris tidak diterima modul pemiliknya";
    case "tidak_ditemukan":
    case "nazhir_tidak_ditemukan":
      return "data yang dituju tidak ditemukan";
    default:
      return `ditolak modul (${reason})`;
  }
}

/** The reason every write carries; on staging and production it names the flag the run was allowed by, so the Audit Log shows where a price came from. */
function alasanImpor(appEnv: string, izin: { staging: boolean; production: boolean }): string {
  if (appEnv === "production" && izin.production) return "Impor data peluncuran (ticket 06, production, --izinkan-production)";
  if (appEnv === "staging" && izin.staging) return "Impor data peluncuran (ticket 06, staging, --izinkan-staging)";
  return "Impor data peluncuran (ticket 06)";
}

/** The moment a version entered for `berlakuMulai` is in force: now, or the start of a later date. */
function saatBerlaku(berlakuMulai: string | null, sekarang: Date): Date {
  const hariIni = wibDateOf(sekarang);
  return berlakuMulai !== null && berlakuMulai > hariIni ? wib(`${berlakuMulai} 00:00`) : sekarang;
}

async function olahBiaya(folder: string, tariffs: Tariffs, aktor: Actor, sekarang: Date, alasan: string): Promise<Ringkasan> {
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
    const dicatat = await tariffs.setGlobalTariff(aktor, {
      key: biaya.kunci,
      amount: biaya.jumlah,
      effectiveOn: biaya.berlakuMulai ?? wibDateOf(sekarang),
      reason: alasan,
    });
    if (!dicatat.ok) {
      hasil.ditolak.push(`biaya-pengurusan.csv baris ${baris.nomor}: ${alasanModul(dicatat.reason, biaya.berlakuMulai)}`);
      continue;
    }
    if (berlaku) hasil.diubah += 1;
    else hasil.dibuat += 1;
  }
  return hasil;
}

async function olahLayanan(
  folder: string,
  katalogLayanan: Pick<Layanan, "katalog">,
  tariffs: Tariffs,
  aktor: Actor,
  sekarang: Date,
  alasan: string,
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
    const berlaku = row.berlakuMulai ?? wibDateOf(sekarang);
    const dicatat = dkiSama ? { ok: true as const } : await tariffs.setHargaLayananDki(aktor, id, { amount: row.hargaDki, effectiveOn: berlaku, reason: alasan });
    const dicatatMitra = !dicatat.ok || mitraSama ? dicatat : await tariffs.setTarifMitraJasa(aktor, id, { amount: row.tarifMitraJasa, effectiveOn: berlaku, reason: alasan });
    if (!dicatatMitra.ok) {
      hasil.ditolak.push(`layanan-dki.csv baris ${baris.nomor}: ${alasanModul(dicatatMitra.reason, row.berlakuMulai)}`);
      continue;
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
    const dicatat = lama ? await wakaf.ubahNazhir(aktor, { ...input, nazhirId: lama.id }) : await wakaf.tambahNazhir(aktor, input);
    if (!dicatat.ok) {
      hasil.ditolak.push(`nazhir.csv baris ${baris.nomor}: ${alasanModul(dicatat.reason)}`);
      continue;
    }
    if (lama) hasil.diubah += 1;
    else hasil.dibuat += 1;
  }
  return hasil;
}

/** What a run found, kind by kind; or the reason it could not start. */
type Hasil = { judul: string; ringkasan: Ringkasan }[] | string;

class UjiCobaSelesai extends Error {}

/** Composes the modules on `db` (the connection, or the dry run's transaction) and imports every kind in dependency order. */
async function jalankan(input: { db: Database; env: ReturnType<typeof readRuntimeEnv>; adapters: ReturnType<typeof createAdapters>; sumber: string; alasan: string }): Promise<Hasil> {
  const { db, env, adapters, sumber, alasan } = input;
  const { audit, identity } = composeIdentity({ env, db, adapters });
  const lokasi = createLokasi({ db, clock: adapters.clock, files: adapters.files, audit, identity });
  const admin = (await identity.staffAccounts()).find(
    (account) => account.roles.includes("admin_platform") && !account.deactivated,
  );
  if (!admin) return "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu.";
  const aktor: Actor = {
    accountId: admin.accountId,
    email: admin.email ?? "",
    phoneNumber: admin.phoneNumber,
    roles: ["admin_platform"],
    lokasiIds: [],
    totp: "lolos",
    sessionId: `import-data-peluncuran-${wibDateOf(adapters.clock.now())}`,
  };
  const tariffs = createTariffs({ db, clock: adapters.clock, audit, lokasi });
  const tpu = await olahTpu(sumber, lokasi, aktor);
  const biaya = await olahBiaya(sumber, tariffs, aktor, adapters.clock.now(), alasan);
  const layanan = await olahLayanan(sumber, createKatalogLayanan({ db }), tariffs, aktor, adapters.clock.now(), alasan);
  const nazhir = await olahNazhir(sumber, createNazhirList({ db, clock: adapters.clock, audit }), aktor);
  return [
    { judul: "TPU DKI", ringkasan: tpu },
    { judul: "Biaya Pengurusan", ringkasan: biaya },
    { judul: "Layanan DKI", ringkasan: layanan },
    { judul: "Nazhir", ringkasan: nazhir },
  ];
}

/** The report a run ends with: one line of counts per kind, then every refusal. Exit 1 when any row was refused. */
function laporan(tulis: boolean, hasil: Hasil): { exitCode: number; output: string } {
  if (typeof hasil === "string") return { exitCode: 1, output: hasil };
  const bagian = hasil;
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
      const kerja = (db: Database) => jalankan({ db, env, adapters, sumber, alasan: alasanImpor(env.APP_ENV, { staging: izinkanStaging, production: izinkanProduction }) });
      if (tulis) return laporan(true, await kerja(database.db));
      // A dry run is the real run inside a transaction that is rolled back: every refusal a write would
      // make (a past date, a name already taken) shows, and nothing stays.
      let hasil: Hasil | null = null;
      try {
        await database.db.transaction(async (tx) => {
          hasil = await kerja(tx);
          throw new UjiCobaSelesai();
        });
      } catch (error) {
        if (!(error instanceof UjiCobaSelesai)) throw error;
      }
      return laporan(false, hasil!);
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

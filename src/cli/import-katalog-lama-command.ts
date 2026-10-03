/**
 * The import of the old Laravel app's cemetery catalog into the v1 beta (ticket
 * 86, ADR 0002's beta UAT amendment: the beta's katalog comes from the old app,
 * never its people).
 *
 * What it reads: one catalog export file the owner produced with the runbook's
 * one read-only query (src/cli/katalog-lama/ekspor.ts is the contract, held to
 * that query by a test). What it writes: Lokasi Mitra, their profiles, their
 * Jenis Makam and their tariffs, through the Lokasi and Tariffs modules only,
 * every one of them marked as example data so nothing it creates can be listed
 * (the Lokasi module refuses to publish a marked one), plus the source's own
 * code beside each of them in the Katalog Lama ledger, which is what makes a
 * second run over the same export create nothing twice.
 *
 * What it never reads: a user, an Akun, an order, a Tagihan, a payment, a
 * document, an address of a person, a phone number, an email. A personal column
 * anywhere in the export refuses the whole import by name, before any value is
 * read. The old app's own database is never opened at all: a
 * KATALOG_LAMA_DATABASE_URL in the environment is refused, not used.
 *
 * A dry run unless `--tulis` is given. Development and test always; staging —
 * the environment the beta for UAT runs on — only with the named allowance
 * `--izinkan-staging`, which is refused by default and named in the reason of
 * every write it makes. Production only under `--izinkan-produksi`, named the same way.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { composeIdentity } from "@/composition/identity";
import { createAdapters } from "@/composition/adapters";
import { createDatabase } from "@/db/client";
import { createKatalogLama, IMPOR_KATALOG_LAMA, type KatalogLama } from "@/domain/katalog-lama";
import type { Actor } from "@/domain/identity";
import { createLokasi, type Lokasi } from "@/domain/lokasi";
import { createTariffs, type Tariffs } from "@/domain/tariffs";
import { appEnvironments, readRuntimeEnv, usesInMemoryFakes } from "@/lib/env";
import { formatRupiah } from "@/lib/rupiah";
import { wibDateOf } from "@/lib/time/jakarta";
import { QRIS_PAYMENT_CAP } from "@/domain/billing";
import type { Clock } from "@/ports/clock";
import { cliFailure } from "./cli-failure";
import { bacaEkspor, KATALOG_LAMA_FORMAT } from "./katalog-lama/ekspor";
import { susunRencana, type Rencana, type RencanaLokasi } from "./katalog-lama/peta";

const USAGE = "Pakai: import:katalog-lama --sumber <berkas.json> [--tulis] [--izinkan-staging | --izinkan-produksi]";

/**
 * The reason every write an import makes carries. On staging it names the
 * allowance, so the Audit Log of every row says the row was created on the
 * beta's own environment under an explicit `--izinkan-staging`, and by whom.
 */
function alasanImport(appEnv: string): string {
  if (appEnv === "staging") return `${IMPOR_KATALOG_LAMA} (staging, --izinkan-staging)`;
  if (appEnv === "production") return `${IMPOR_KATALOG_LAMA} (production, --izinkan-produksi)`;
  return IMPOR_KATALOG_LAMA;
}

/** What one run did, as the report counts it. */
interface Hasil {
  /** Lokasi Mitra created. */
  lokasiDitulis: number;
  /** Jenis Makam created. */
  jenisDitulis: number;
  /** Rows the beta already has under the same old code, left alone. */
  dilewati: { lokasi: number; jenisMakam: number };
  /** Old codes an interrupted import claimed and never bound. */
  tertinggal: string[];
  /** Rows refused while writing, as `kode [untuk]: alasan`. */
  ditolak: string[];
}

/** The modules the import writes through, all on one database. */
interface Modul {
  lokasi: Lokasi;
  tariffs: Tariffs;
  katalog: KatalogLama;
  aktor: Actor;
  hariIni: string;
}

/**
 * `npm run import:katalog-lama -- --sumber <berkas.json> [--tulis] [--izinkan-staging]`:
 * imports a cemetery catalog export into a development or test stack, or into
 * staging under the named allowance (or production under its own). A dry run unless
 * `--tulis`. Exit 0 done, 1 refused or failed, 2 usage.
 */
export async function importKatalogLamaCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
  options: { clock?: Clock } = {},
): Promise<{ exitCode: number; output: string }> {
  let sumber: string;
  let tulis: boolean;
  let izinkanStaging: boolean;
  let izinkanProduksi: boolean;
  try {
    const args = parseArgs({
      args: argv,
      options: { sumber: { type: "string" }, tulis: { type: "boolean" }, "izinkan-staging": { type: "boolean" }, "izinkan-produksi": { type: "boolean" } },
      allowPositionals: false,
      strict: true,
    });
    if (!args.values.sumber) return { exitCode: 2, output: USAGE };
    sumber = args.values.sumber;
    tulis = args.values.tulis === true;
    izinkanStaging = args.values["izinkan-staging"] === true;
    izinkanProduksi = args.values["izinkan-produksi"] === true;
  } catch {
    return { exitCode: 2, output: USAGE };
  }

  const appEnv = z.enum(appEnvironments).default("development").safeParse(source.APP_ENV);
  if (!appEnv.success) {
    return { exitCode: 1, output: `Ditolak: APP_ENV tidak dikenal (${String(source.APP_ENV)}).` };
  }
  // The beta for UAT runs on staging, so the import has to be able to run there: the
  // allowance is named, refused by default, and every write it makes says so in the
  // Audit Log. Production has its own allowance, `--izinkan-produksi` (owner decision
  // 2026-10-03: the example catalog goes to production as data contoh); the staging one
  // never opens it.
  if (appEnv.data === "production" && !izinkanProduksi) {
    return { exitCode: 1, output: "Ditolak: di production perlu allowance --izinkan-produksi (ditolak secara bawaan)." };
  }
  if (appEnv.data === "staging" && !izinkanStaging) {
    return { exitCode: 1, output: "Ditolak: di staging perlu allowance --izinkan-staging (ditolak secara bawaan)." };
  }
  if (!usesInMemoryFakes(appEnv.data) && !(appEnv.data === "production" ? izinkanProduksi : izinkanStaging)) {
    return { exitCode: 1, output: "Ditolak: import-katalog-lama hanya untuk development, test, atau staging dengan allowance." };
  }
  if (source.KATALOG_LAMA_DATABASE_URL) {
    return {
      exitCode: 1,
      output:
        "Ditolak: KATALOG_LAMA_DATABASE_URL diabaikan. Alat ini tidak pernah membuka basis data aplikasi lama: katalognya dibaca dari berkas ekspor, jadi tidak ada kredensial yang perlu disimpan.",
    };
  }

  let teks: string;
  try {
    teks = readFileSync(sumber, "utf8");
  } catch {
    return { exitCode: 2, output: USAGE };
  }
  let dokumen: unknown;
  try {
    dokumen = JSON.parse(teks);
  } catch {
    return { exitCode: 1, output: "Ditolak: berkas ekspor ini bukan JSON, jadi tidak ada yang dibaca." };
  }
  const bacaan = bacaEkspor(dokumen);
  if (!bacaan.ok) {
    if (bacaan.reason === "nilai_pii_dilarang") {
      return {
        exitCode: 1,
        output: [
          `Ditolak (nilai_pii_dilarang): ada data pribadi di dalam teks bebas (${[...new Set(bacaan.nilai.map((satu) => satu.alasan))].join(", ")}),`,
          `jadi impor berhenti sebelum satu nilai pun ditulis: ${bacaan.nilai.map((satu) => satu.kolom).join(", ")}.`,
          "Isi kolom katalog dengan teksnya sendiri, tanpa nomor telepon, email, atau dokumen yang ditempel.",
        ].join(" "),
      };
    }
    if (bacaan.reason === "kolom_pii_dilarang") {
      return {
        exitCode: 1,
        output: [
          `Ditolak (kolom_pii_dilarang): ada kolom pribadi dalam ekspor (${[...new Set(bacaan.kolom.map((satu) => satu.alasan))].join(", ")}),`,
          `jadi impor berhenti sebelum satu nilai pun dibaca: ${bacaan.kolom.map((satu) => satu.kolom).join(", ")}.`,
          "Ekspor hanya katalog: nama, alamat, kota, titik, fasilitas dan harga.",
        ].join(" "),
      };
    }
    return { exitCode: 1, output: `Ditolak (bukan_ekspor_katalog): berkas ini bukan ekspor katalog yang dipahami: ${bacaan.detail}.` };
  }

  try {
    const env = readRuntimeEnv(source);
    const database = createDatabase(env.DATABASE_URL, { max: 1, applicationName: "makam-import-katalog-lama" });
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
      const now = adapters.clock.now();

      // An ops command, on a stack whose shell the operator already holds: the import acts as the
      // stack's first Admin Platform, past TOTP. Every write it makes is audited under that Akun.
      const admin = (await identity.staffAccounts()).find(
        (account) => account.roles.includes("admin_platform") && !account.deactivated,
      );
      if (!admin) return { exitCode: 1, output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu." };

      const modul: Modul = {
        lokasi,
        tariffs: createTariffs({ db: database.db, clock: adapters.clock, audit, lokasi }),
        katalog: createKatalogLama({ db: database.db, clock: adapters.clock, audit }),
        aktor: {
          accountId: admin.accountId,
          email: admin.email ?? "",
          phoneNumber: admin.phoneNumber,
          roles: ["admin_platform"],
          lokasiIds: [],
          totp: "lolos",
          sessionId: `import-katalog-lama-${wibDateOf(now)}`,
        },
        hariIni: wibDateOf(now),
      };
      const rencana = susunRencana(bacaan.ekspor, modul.hariIni);
      const hasil = tulis ? await tulisRencana(rencana, modul, alasanImport(env.APP_ENV)) : hasilKosong();
      const sudahImpor = tulis ? null : await modul.katalog.diimpor();

      return {
        exitCode: 0,
        output: laporan({
          sumber,
          dieksporPada: bacaan.ekspor.dieksporPada,
          rencana,
          hasil,
          tulis,
          sudahImpor: sudahImpor && {
            lokasi: sudahImpor.lokasi.filter((impor) => impor.sudahTerikat).length,
            jenisMakam: sudahImpor.jenisMakam.filter((impor) => impor.sudahTerikat).length,
          },
        }),
      };
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

function hasilKosong(): Hasil {
  return { lokasiDitulis: 0, jenisDitulis: 0, dilewati: { lokasi: 0, jenisMakam: 0 }, tertinggal: [], ditolak: [] };
}

/** Creates every row of the plan the beta does not have yet, and counts what became of each. */
async function tulisRencana(rencana: Rencana, modul: Modul, alasan: string): Promise<Hasil> {
  const hasil = hasilKosong();
  for (const baris of rencana.lokasi) {
    const klaim = await modul.katalog.claimLokasi(modul.aktor, { kode: baris.kode });
    if (!klaim.ok) {
      if (klaim.reason === "sudah_diklaim" && klaim.milik.sudahTerikat) {
        hasil.dilewati.lokasi += 1;
        hasil.dilewati.jenisMakam += baris.jenisMakam.length;
      } else if (klaim.reason === "sudah_diklaim") {
        hasil.tertinggal.push(baris.kode);
      } else {
        hasil.ditolak.push(`${baris.kode} [lokasi]: ${klaim.reason}`);
      }
      continue;
    }

    const { name, pengelolaName, address, city } = baris.profil;
    const dibuat = await modul.lokasi.createLokasiMitra(modul.aktor, { name, pengelolaName, address, city });
    if (!dibuat.ok) {
      hasil.ditolak.push(`${baris.kode} [lokasi]: ${dibuat.reason}`);
      continue;
    }
    const lokasiId = dibuat.lokasiMitra.id;
    const profil = await modul.lokasi.updateProfile(modul.aktor, lokasiId, baris.profil);
    if (!profil.ok) {
      hasil.ditolak.push(`${baris.kode} [lokasi]: ${profil.reason}`);
      continue;
    }
    await modul.katalog.catatLokasi(modul.aktor, { kode: baris.kode, lokasiId, reason: alasan });
    hasil.lokasiDitulis += 1;

    // Every imported row is marked as example data, because the import verifies
    // nothing: no Kunjungan Verifikasi, no agreement, nothing a publish gate could
    // read. So the Lokasi module refuses to publish or list any of them, and the
    // owner clears the mark by hand (with its own reason) once a row is real. The
    // source's own example marker, when it has one, is named in the reason.
    const ditandai = await modul.lokasi.tandaiDataContoh(modul.aktor, lokasiId, {
      dataContoh: true,
      reason: baris.dataContoh
        ? `${alasan}: sumber menandai baris ini sebagai data contoh`
        : `${alasan}: belum diverifikasi Kunjungan Verifikasi`,
    });
    if (!ditandai.ok) {
      hasil.ditolak.push(`${baris.kode} [data_contoh]: ${ditandai.reason}`);
    }

    if (baris.biayaPemakaman) {
      const biaya = await modul.tariffs.setBiayaPemakaman(modul.aktor, lokasiId, {
        ...baris.biayaPemakaman,
        effectiveOn: modul.hariIni,
        reason: alasan,
      });
      if (!biaya.ok) hasil.ditolak.push(`${baris.kode} [biaya_pemakaman]: ${biaya.reason}`);
    }
    await tulisJenisMakam(baris, lokasiId, modul, hasil, alasan);
  }
  return hasil;
}

/** Creates one Lokasi Mitra's Jenis Makam, each with its first tariff version. */
async function tulisJenisMakam(baris: RencanaLokasi, lokasiId: string, modul: Modul, hasil: Hasil, alasan: string): Promise<void> {
  for (const jenis of baris.jenisMakam) {
    const klaim = await modul.katalog.claimJenisMakam(modul.aktor, { kode: jenis.kode, lokasiKode: baris.kode });
    if (!klaim.ok) {
      if (klaim.reason === "sudah_diklaim" && klaim.milik.sudahTerikat) hasil.dilewati.jenisMakam += 1;
      else if (klaim.reason === "sudah_diklaim") hasil.tertinggal.push(jenis.kode);
      else hasil.ditolak.push(`${jenis.kode} [jenis_makam]: ${klaim.reason}`);
      continue;
    }
    const dibuat = await modul.tariffs.createJenisMakam(modul.aktor, lokasiId, {
      name: jenis.nama,
      description: jenis.deskripsi,
      tariff: {
        hargaHakPakai: jenis.hargaHakPakai,
        tenure: jenis.masaHak,
        hargaPerpanjangan: jenis.hargaPerpanjangan,
        effectiveOn: jenis.effectiveOn,
      },
      reason: alasan,
    });
    if (!dibuat.ok) {
      hasil.ditolak.push(`${jenis.kode} [jenis_makam]: ${dibuat.reason}`);
      continue;
    }
    await modul.katalog.catatJenisMakam(modul.aktor, {
      kode: jenis.kode,
      jenisMakamId: dibuat.jenisMakam.id,
      reason: alasan,
    });
    hasil.jenisDitulis += 1;
  }
}

/** The report a run ends with: the counts, the refusals, and the questions only the owner can answer. */
function laporan(input: {
  sumber: string;
  dieksporPada: string | null;
  rencana: Rencana;
  hasil: Hasil;
  tulis: boolean;
  sudahImpor: { lokasi: number; jenisMakam: number } | null;
}): string {
  const { rencana, hasil } = input;
  const ditolak = [
    ...rencana.ditolak.map((baris) => `${baris.kode} [${baris.untuk}]: ${baris.alasan} (${baris.detail})`),
    ...hasil.ditolak,
  ];
  const diLuarCap = rencana.jenisMakam.filter((jenis) => jenis.diLuarCap);
  const baris = [
    input.tulis
      ? `[import-katalog-lama] Ditulis: ${hasil.lokasiDitulis} Lokasi Mitra dan ${hasil.jenisDitulis} Jenis Makam.`
      : "[import-katalog-lama] Mode dry-run: tidak ada yang ditulis.",
    `Sumber: ${input.sumber} (format ${KATALOG_LAMA_FORMAT}${input.dieksporPada ? `, diekspor ${input.dieksporPada}` : ""})`,
    `Lokasi: ${rencana.ringkasan.lokasiDibaca} dibaca, ${rencana.ringkasan.lokasiDiimpor} akan diimpor, ${ditolak.length} ditolak.`,
    `Jenis Makam: ${rencana.ringkasan.jenisMakamDibaca} dibaca, ${rencana.ringkasan.jenisMakamDiimpor} akan diimpor.`,
    `Di luar cap QRIS ${formatRupiah(QRIS_PAYMENT_CAP)}, tetap diimpor tapi tidak ditampilkan (${diLuarCap.length}):`,
    ...diLuarCap.map((jenis) => `  - ${jenis.kode}: ${formatRupiah(jenis.allIn)}`),
  ];
  if (rencana.dataContoh.length > 0) {
    baris.push(
      `Data contoh di aplikasi lama (${rencana.dataContoh.length} Lokasi): ${rencana.dataContoh.map((satu) => `${satu.kode} (${satu.penanda})`).join(", ")}.`,
      "Katalog ini bukan data makam sungguhan: jangan dibaca sebagai nama dan alamat makam yang nyata.",
    );
  }
  if (input.sudahImpor) {
    baris.push(`Sudah ada di stack ini: ${input.sudahImpor.lokasi} Lokasi, ${input.sudahImpor.jenisMakam} Jenis Makam.`);
  }
  if (hasil.dilewati.lokasi > 0 || hasil.dilewati.jenisMakam > 0) {
    baris.push(
      `Sudah ada, dilewati (${hasil.dilewati.lokasi} Lokasi, ${hasil.dilewati.jenisMakam} Jenis Makam): impor ini idempoten pada kode katalog lama.`,
    );
  }
  for (const kode of hasil.tertinggal) {
    baris.push(
      `${kode} tertinggal diklaim tanpa Lokasi Mitra: impor sebelumnya terpotong. Periksa tabel katalog_lama_lokasi sebelum mengulangi.`,
    );
  }
  baris.push(
    `Ditolak (${ditolak.length}):`,
    ...ditolak.map((entry) => `  - ${entry}`),
    `Pertanyaan untuk owner (${rencana.pertanyaan.length}):`,
    ...rencana.pertanyaan.map((pertanyaan) => `  - [${pertanyaan.tentang}] ${pertanyaan.kode}: ${pertanyaan.detail}`),
    "Semua Lokasi Mitra hasil impor tetap Belum Tayang: menerbitkannya butuh Kunjungan Verifikasi, perjanjian, Jam Operasional dan tarif diperiksa.",
  );
  if (!input.tulis) baris.push("Gunakan --tulis untuk menulisnya ke v1.");
  return baris.join("\n");
}

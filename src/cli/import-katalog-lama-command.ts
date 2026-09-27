/**
 * The import of the old Laravel app's cemetery catalog into the v1 beta (ticket
 * 86, ADR 0002's beta UAT amendment: the beta's katalog comes from the old app,
 * never its people).
 *
 * What it reads: one catalog export file the old app's owner produced
 * (src/cli/katalog-lama/ekspor.ts is the contract, the runbook has the
 * read-only query). What it writes: Lokasi Mitra, their profiles, their Jenis
 * Makam and their tariffs, through the Lokasi and Tariffs modules only, plus
 * the old code beside each of them in the Katalog Lama ledger, which is what
 * makes a second run over the same export create nothing twice.
 *
 * What it never reads: a user, an Akun, an order, a Tagihan, a payment, a
 * document, an address of a person, a phone number, an email. A personal column
 * anywhere in the export refuses the whole import by name, before any value is
 * read. The old app's own database is never opened at all: a
 * KATALOG_LAMA_DATABASE_URL in the environment is refused, not used.
 *
 * Development and test only (never staging, never production), and a dry run
 * unless `--tulis` is given.
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

const USAGE = "Pakai: import:katalog-lama --sumber <berkas.json> [--tulis]";

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
 * `npm run import:katalog-lama -- --sumber <berkas.json> [--tulis]`: imports the
 * old app's cemetery catalog into a development or test stack, refused on
 * staging and production. A dry run unless `--tulis`. Exit 0 done, 1 refused or
 * failed, 2 usage.
 */
export async function importKatalogLamaCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
  options: { clock?: Clock } = {},
): Promise<{ exitCode: number; output: string }> {
  let sumber: string;
  let tulis: boolean;
  try {
    const args = parseArgs({
      args: argv,
      options: { sumber: { type: "string" }, tulis: { type: "boolean" } },
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
  if (!appEnv.success || !usesInMemoryFakes(appEnv.data)) {
    return { exitCode: 1, output: "Ditolak: import-katalog-lama hanya untuk development dan test." };
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
        overrides: options.clock ? { clock: options.clock } : undefined,
      });
      const { audit, identity } = composeIdentity({ env, db: database.db, adapters });
      const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
      const now = adapters.clock.now();

      // Development and test only: the import acts as the stack's first Admin Platform, past TOTP, as a
      // developer with the stack's shell could anyway. Every write it makes is audited under that Akun.
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
      const hasil = tulis ? await tulisRencana(rencana, modul) : hasilKosong();
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
async function tulisRencana(rencana: Rencana, modul: Modul): Promise<Hasil> {
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

    const dibuat = await modul.lokasi.createLokasiMitra(modul.aktor, baris.lokasi);
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
    await modul.katalog.catatLokasi(modul.aktor, { kode: baris.kode, lokasiId, reason: IMPOR_KATALOG_LAMA });
    hasil.lokasiDitulis += 1;

    if (baris.biayaPemakaman) {
      const biaya = await modul.tariffs.setBiayaPemakaman(modul.aktor, lokasiId, {
        ...baris.biayaPemakaman,
        effectiveOn: modul.hariIni,
        reason: IMPOR_KATALOG_LAMA,
      });
      if (!biaya.ok) hasil.ditolak.push(`${baris.kode} [biaya_pemakaman]: ${biaya.reason}`);
    }
    await tulisJenisMakam(baris, lokasiId, modul, hasil);
  }
  return hasil;
}

/** Creates one Lokasi Mitra's Jenis Makam, each with its first tariff version. */
async function tulisJenisMakam(baris: RencanaLokasi, lokasiId: string, modul: Modul, hasil: Hasil): Promise<void> {
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
      reason: IMPOR_KATALOG_LAMA,
    });
    if (!dibuat.ok) {
      hasil.ditolak.push(`${jenis.kode} [jenis_makam]: ${dibuat.reason}`);
      continue;
    }
    await modul.katalog.catatJenisMakam(modul.aktor, {
      kode: jenis.kode,
      jenisMakamId: dibuat.jenisMakam.id,
      reason: IMPOR_KATALOG_LAMA,
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

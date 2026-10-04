/**
 * `npm run data-contoh -- <tanam --set rilis1 | cabut | status> [--tulis] [--izinkan-staging]
 * [--izinkan-production]`, in the image `node dist/data-contoh.mjs ...` (ticket 109).
 *
 * The beta on the SumoPod sandbox shows MANY clearly marked example records,
 * prices included, and one command removes them before real operation: `tanam`
 * plants a set, `cabut` retires everything the registry holds, `status` lists
 * what is active. The registry is the Data Contoh module's (`src/domain/data-contoh`);
 * what a set contains is built by `seed-contoh-publik`'s own machinery (five
 * Lokasi Mitra through the real publish gate, their Denah and staff), marked
 * "(Contoh)" and example-priced (`data-contoh/rilis1.ts`).
 *
 * Like the other ops CLIs it acts as the stack's first Admin Platform (past
 * TOTP, on a stack whose shell the operator already holds; run `seed:admin`
 * first), writes only through the owning modules' public functions, and every
 * write carries a reason naming this command and the environment. A dry run
 * (no `--tulis`) reads only and writes nothing. Development and test always;
 * staging only with `--izinkan-staging`; production only with
 * `--izinkan-production`, each refused without its flag, and `tanam` on
 * production only while payments are a trial (the SumoPod sandbox): example
 * records are never planted next to real operation. Never writes Pengaturan
 * Operator on production. Exit 0 done, 1 refused, failed or left active, 2 usage.
 */
import { parseArgs } from "node:util";
import { z } from "zod";
import { createDatabase } from "@/db/client";
import {
  AWALAN_ALASAN_TANAM,
  createDataContoh,
  himpunanDataContoh,
  type CabutResult,
  type DataContoh,
  type EntriDataContoh,
  type HargaContohBerlaku,
  type RencanaCabut,
  type RencanaTanam,
} from "@/domain/data-contoh";
import type { Actor } from "@/domain/identity";
import { createPenawaranLayanan } from "@/domain/layanan";
import { pesananBerjalanDiLokasi } from "@/domain/pemesanan";
import { appEnvironments, paymentsAreTrial, readRuntimeEnv } from "@/lib/env";
import { wibDateOf } from "@/lib/time/jakarta";
import type { Clock } from "@/ports/clock";
import { cliFailure } from "./cli-failure";
import {
  BIAYA_LAYANAN_PLATFORM_DATA_CONTOH,
  HARGA_LAYANAN_DATA_CONTOH,
  LOKASI_RILIS1,
  PETUGAS_DATA_CONTOH,
  slug,
} from "./data-contoh/rilis1";
import { adminPlatform, isiPengaturanOperatorBilaKosong, type Modul } from "./dev-seed-support";
import { seedOneLokasi, susunModul, undangPetugas, type ContohLokasiSpec } from "./seed-contoh-publik-command";

const USAGE =
  "Pakai: data-contoh tanam --set rilis1 | data-contoh cabut | data-contoh status [--tulis] [--izinkan-staging] [--izinkan-production]";

type Hasil = { exitCode: number; output: string };

const rupiah = (jumlah: number) => `Rp ${jumlah.toLocaleString("id-ID")}`;

interface Perintah {
  sub: "tanam" | "cabut" | "status";
  himpunan: (typeof himpunanDataContoh)[number] | null;
  tulis: boolean;
  appEnv: (typeof appEnvironments)[number];
  /** The reason every write of this run carries. */
  alasan: string;
}

/** What the arguments and `APP_ENV` allow: the command to run, or the refusal to print. */
function bacaPerintah(argv: string[], source: Record<string, string | undefined>): { perintah: Perintah } | { tolak: Hasil } {
  let args;
  try {
    args = parseArgs({
      args: argv,
      options: {
        set: { type: "string" },
        tulis: { type: "boolean" },
        "izinkan-staging": { type: "boolean" },
        "izinkan-production": { type: "boolean" },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch {
    return { tolak: { exitCode: 2, output: USAGE } };
  }
  const sub = z.enum(["tanam", "cabut", "status"]).safeParse(args.positionals.length === 1 ? args.positionals[0] : undefined);
  if (!sub.success) return { tolak: { exitCode: 2, output: USAGE } };
  let himpunan: Perintah["himpunan"] = null;
  if (sub.data === "tanam") {
    const set = z.enum(himpunanDataContoh).safeParse(args.values.set);
    if (!set.success) return { tolak: { exitCode: 2, output: `${USAGE}\n--set wajib untuk tanam: ${himpunanDataContoh.join(", ")}.` } };
    himpunan = set.data;
  } else if (args.values.set !== undefined) {
    return { tolak: { exitCode: 2, output: `${USAGE}\n--set hanya untuk tanam.` } };
  }

  const appEnv = z.enum(appEnvironments).default("development").safeParse(source.APP_ENV);
  if (!appEnv.success) return { tolak: { exitCode: 1, output: `Ditolak: APP_ENV tidak dikenal (${String(source.APP_ENV)}).` } };
  // Each stack beyond development and test is named by its own flag, never implied by the other's.
  const izinkanStaging = args.values["izinkan-staging"] === true;
  const izinkanProduction = args.values["izinkan-production"] === true;
  if (appEnv.data === "production" && !izinkanProduction) {
    return { tolak: { exitCode: 1, output: "Ditolak: di production perlu --izinkan-production (ditolak secara bawaan)." } };
  }
  if (appEnv.data === "staging" && !izinkanStaging) {
    return { tolak: { exitCode: 1, output: "Ditolak: di staging perlu --izinkan-staging (ditolak secara bawaan)." } };
  }
  // Example records are never planted next to real operation: production only while it pays through the sandbox.
  if (sub.data === "tanam" && appEnv.data === "production" && !paymentsAreTrial(source)) {
    return {
      tolak: {
        exitCode: 1,
        output: "Ditolak: production tidak membayar lewat sandbox SumoPod (SUMOPOD_BASE_URL bukan host sandbox): Data Contoh tidak ditanam di samping operasi nyata.",
      },
    };
  }
  // A tanam's reason starts with the module's mark: it is how the Audit Log tells a price this command entered from an Operator's.
  const nama = sub.data === "tanam" ? AWALAN_ALASAN_TANAM : `data-contoh ${sub.data}`;
  const alasan =
    appEnv.data === "production" ? `${nama} (production, --izinkan-production)` : appEnv.data === "staging" ? `${nama} (staging, --izinkan-staging)` : nama;
  return { perintah: { sub: sub.data, himpunan, tulis: args.values.tulis === true, appEnv: appEnv.data, alasan } };
}

/** Everything the three subcommands drive, composed on one connection. */
interface Konteks {
  modul: Modul;
  dataContoh: DataContoh;
  penawaran: ReturnType<typeof createPenawaranLayanan>;
  operatorSettings: Parameters<typeof isiPengaturanOperatorBilaKosong>[0];
  lokasi: ContohLokasiSpec[];
}

function entriPerJenis(aktif: EntriDataContoh[]): string[] {
  const perJenis = new Map<string, EntriDataContoh[]>();
  for (const entri of aktif) perJenis.set(entri.jenis, [...(perJenis.get(entri.jenis) ?? []), entri]);
  return [...perJenis].flatMap(([jenis, daftar]) => [`  ${jenis}: ${daftar.length}`, ...daftar.map((entri) => `    - ${entri.kode}${entri.lengkap ? "" : " (belum selesai)"}`)]);
}

/** The contoh prices in force that the registry does not hold: what a `tanam` killed between entering a price and recording it leaves. */
function laporanTakTercatat(harga: HargaContohBerlaku[]): string[] {
  if (harga.length === 0) return [];
  return [
    `${harga.length} harga contoh masih berlaku tetapi tidak tercatat di registri (sisa tanam yang terputus sebelum sempat mencatatnya):`,
    ...harga.map((satu) => `  - ${satu.key} ${rupiah(satu.amount)}`),
  ];
}

async function status(ctx: Konteks): Promise<Hasil> {
  const { aktif, dicabut, takTercatat } = await ctx.dataContoh.status();
  if (aktif.length === 0 && takTercatat.length === 0) return { exitCode: 0, output: `Tidak ada Data Contoh yang aktif (${dicabut} entri sudah dicabut).` };
  return {
    exitCode: 0,
    output: [`Data Contoh aktif: ${aktif.length} entri (${dicabut} sudah dicabut).`, ...entriPerJenis(aktif), ...laporanTakTercatat(takTercatat)].join("\n"),
  };
}

/** The Rilis 1 set's fixtures, in the order they depend on each other: the platform fee, the Petugas Lapangan, then each Lokasi Mitra. */
function rencanaRilis1(ctx: Konteks, admin: Actor, hariIni: string, alasan: string): RencanaTanam[] {
  const { modul } = ctx;
  const gagal = (reason: string) => ({ ok: false as const, reason });
  return [
    {
      kode: "rilis1/tarif/biaya-layanan-platform",
      jenis: "tarif_global",
      // Naming the key lets `tanam` record a contoh fee a killed run entered and never recorded, before this build would enter a second.
      kunciTarif: "biaya_layanan_platform",
      async buat({ catatInduk }) {
        // The platform fee is the Operator's own, shared by every Lokasi Mitra: a contoh version is entered only when none is set at all.
        if (await modul.tariffs.globalTariff("biaya_layanan_platform", modul.adapters.clock.now())) return { ok: true };
        const dibuat = await modul.tariffs.setGlobalTariff(admin, {
          key: "biaya_layanan_platform",
          amount: BIAYA_LAYANAN_PLATFORM_DATA_CONTOH,
          effectiveOn: hariIni,
          reason: alasan,
        });
        if (!dibuat.ok) return gagal(`biaya layanan platform contoh: ${dibuat.reason}`);
        await catatInduk(`biaya_layanan_platform:${dibuat.version.seq}`);
        return { ok: true };
      },
    },
    {
      kode: "rilis1/akun/petugas-lapangan",
      jenis: "akun_staf",
      async buat({ catatInduk }) {
        const petugas = await undangPetugas(modul, admin, alasan, PETUGAS_DATA_CONTOH);
        if (!petugas.ok) return gagal(`Petugas Lapangan contoh: ${petugas.reason}`);
        await catatInduk(petugas.value.accountId);
        return { ok: true };
      },
    },
    ...ctx.lokasi.map(
      (spec): RencanaTanam => ({
        kode: `rilis1/lokasi/${slug(spec.name)}`,
        jenis: "lokasi_mitra",
        async buat({ catatInduk, catatAnak }) {
          const petugas = await undangPetugas(modul, admin, alasan, PETUGAS_DATA_CONTOH);
          if (!petugas.ok) return gagal(`Petugas Lapangan contoh: ${petugas.reason}`);
          const dibuat = await seedOneLokasi(modul, admin, petugas.value, hariIni, spec, alasan, {
            lewatiBiayaPlatform: true,
            alasanLokasi: alasan,
            lokasiDibuat: catatInduk,
            adminLokasiSiap: (akun) => catatAnak({ kode: `rilis1/akun/${slug(spec.name)}`, jenis: "akun_staf", entitasId: akun.accountId }),
            jenisMakamDibuat: (jm, id) => catatAnak({ kode: `rilis1/jenis-makam/${slug(spec.name)}/${slug(jm.name)}`, jenis: "jenis_makam", entitasId: id }),
          });
          return dibuat.ok ? { ok: true } : gagal(dibuat.reason);
        },
      }),
    ),
  ];
}

/**
 * Switches every Layanan variant of the catalog on at each Lokasi Mitra of the set, with that Lokasi's example price.
 * A variant a Lokasi already prices is never touched (offering it again would enter a new version over a real price),
 * and each switch-on is recorded under its Lokasi, so a catalog that arrives after the first `tanam` is covered by the next.
 */
async function nyalakanLayanan(ctx: Konteks, admin: Actor, hariIni: string, alasan: string): Promise<{ ok: true; baru: number; katalogKosong: boolean } | { ok: false; reason: string }> {
  const { modul, dataContoh, penawaran } = ctx;
  const katalog = await penawaran.katalog();
  const varian = katalog.flatMap((layanan) => layanan.varian.map((satu) => ({ id: satu.id, jenis: layanan.jenis, nama: `${layanan.name} / ${satu.name}` })));
  const lokasi = (await dataContoh.status()).aktif.filter((entri) => entri.jenis === "lokasi_mitra" && entri.himpunan === "rilis1" && entri.lengkap);
  let baru = 0;
  for (const tempat of lokasi) {
    const sudah = await modul.tariffs.hargaLayananLokasiSemua(tempat.entitasId, modul.adapters.clock.now());
    for (const satu of varian) {
      if (sudah.has(satu.id)) continue;
      const dinyalakan = await penawaran.tawarkanLayanan(admin, tempat.entitasId, satu.id, { amount: HARGA_LAYANAN_DATA_CONTOH[satu.jenis], effectiveOn: hariIni, reason: alasan });
      if (!dinyalakan.ok) return { ok: false, reason: `Layanan ${satu.nama} di ${tempat.kode}: ${dinyalakan.reason}` };
      const dicatat = await dataContoh.catat(admin, {
        kode: `rilis1/layanan/${tempat.kode.replace("rilis1/lokasi/", "")}/${satu.id}`,
        himpunan: "rilis1",
        jenis: "penawaran_layanan",
        entitasId: `${tempat.entitasId}:${satu.id}`,
        indukKode: tempat.kode,
        reason: alasan,
      });
      if (!dicatat.ok) return { ok: false, reason: `Layanan ${satu.nama} di ${tempat.kode} tidak tercatat (${dicatat.reason})` };
      baru += 1;
    }
  }
  return { ok: true, baru, katalogKosong: varian.length === 0 };
}

/** What a dry run of `tanam` finds, from reads only. */
async function ujiTanam(ctx: Konteks): Promise<Hasil> {
  const { modul, dataContoh } = ctx;
  const { aktif, takTercatat } = await dataContoh.status();
  const ada = (kode: string) => aktif.find((entri) => entri.kode === kode);
  const akanDitanam = ctx.lokasi.filter((spec) => !ada(`rilis1/lokasi/${slug(spec.name)}`)?.lengkap);
  const platformAda = await modul.tariffs.globalTariff("biaya_layanan_platform", modul.adapters.clock.now());
  const platformTakTercatat = takTercatat.some((harga) => harga.key === "biaya_layanan_platform");
  const katalog = await ctx.penawaran.katalog();
  const jumlahVarian = katalog.reduce((jumlah, layanan) => jumlah + layanan.varian.length, 0);
  return {
    exitCode: 0,
    output: [
      "[data-contoh] Mode dry-run: tidak ada yang ditulis.",
      `Lokasi Mitra (Contoh): ${akanDitanam.length} akan ditanam, ${ctx.lokasi.length - akanDitanam.length} sudah ada${akanDitanam.length > 0 ? `: ${akanDitanam.map((spec) => spec.name).join(", ")}` : ""}.`,
      platformAda
        ? platformTakTercatat
          ? `Biaya Layanan Platform: contoh ${rupiah(platformAda.amount)} sisa tanam yang terputus akan dicatat di registri (tidak ada versi baru).`
          : `Biaya Layanan Platform: sudah ada (${rupiah(platformAda.amount)}), tidak ditulis.`
        : `Biaya Layanan Platform: contoh ${rupiah(BIAYA_LAYANAN_PLATFORM_DATA_CONTOH)} akan dicatat.`,
      `Layanan: ${jumlahVarian} varian di katalog akan dinyalakan di setiap Lokasi (Contoh) yang belum menghargainya${jumlahVarian === 0 ? " (katalog Layanan kosong: tidak ada yang dinyalakan)" : ""}.`,
      "Gunakan --tulis untuk menanamnya.",
    ].join("\n"),
  };
}

async function tanam(ctx: Konteks, perintah: Perintah): Promise<Hasil> {
  if (!perintah.tulis) return ujiTanam(ctx);
  const { modul, dataContoh } = ctx;
  const admin = await adminPlatform(modul.identity);
  if (!admin) return { exitCode: 1, output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu." };
  const hariIni = wibDateOf(modul.adapters.clock.now());

  // The Operator's own to fill in on production: the example values are entered on no stack that is production.
  if (perintah.appEnv !== "production") {
    const operator = await isiPengaturanOperatorBilaKosong(ctx.operatorSettings, admin, perintah.alasan);
    if (!operator.ok) return { exitCode: 1, output: `Ditolak: Pengaturan Operator contoh tidak tersimpan (${operator.reason}).` };
  }
  const tertanam = await dataContoh.tanam(admin, { himpunan: "rilis1", reason: perintah.alasan, rencana: rencanaRilis1(ctx, admin, hariIni, perintah.alasan) });
  if (!tertanam.ok) {
    return { exitCode: 1, output: "alasan" in tertanam ? `Ditolak: ${tertanam.kode} gagal ditanam (${tertanam.alasan}); yang sudah dibuatnya dicabut kembali.` : `Ditolak: ${tertanam.reason}.` };
  }
  const layanan = await nyalakanLayanan(ctx, admin, hariIni, perintah.alasan);
  if (!layanan.ok) return { exitCode: 1, output: `Ditolak: ${layanan.reason}.` };
  const baris = [
    tertanam.dibuat.length === 0 && layanan.baru === 0
      ? "Data Contoh rilis1 sudah ditanam; data-contoh tidak mengubah apa pun."
      : `Data Contoh rilis1 ditanam: ${tertanam.dibuat.length} bagian baru (${tertanam.sudahAda.length} sudah ada), ${layanan.baru} Layanan dinyalakan di Lokasi (Contoh).`,
  ];
  if (layanan.katalogKosong) baris.push("Katalog Layanan kosong: tidak ada Layanan yang dinyalakan. Isi katalog (import:data-peluncuran) lalu jalankan tanam lagi.");
  return { exitCode: 0, output: baris.join("\n") };
}

function laporanRencanaCabut(rencana: RencanaCabut): string[] {
  const baris =
    rencana.aktif.length > 0
      ? [`${rencana.aktif.length} entri aktif akan dicabut:`, ...entriPerJenis(rencana.aktif)]
      : [rencana.diblokir.length === 0 ? "Tidak ada Data Contoh yang aktif." : "Registri tidak memegang entri aktif."];
  if (rencana.diblokir.length > 0) baris.push(...laporanDiblokir(rencana.diblokir));
  baris.push(...laporanPesanan(rencana.pesananTerbuka));
  return baris;
}

function laporanDiblokir(diblokir: RencanaCabut["diblokir"]): string[] {
  return [
    `Ditolak: ${diblokir.length} harga contoh masih berlaku, belum digantikan versi asli (tidak ada yang dicabut):`,
    ...diblokir.map((harga) => `  - ${harga.kode ?? "(tidak tercatat di registri: sisa tanam yang terputus)"}: ${harga.key} ${rupiah(harga.amount)}`),
    "Masukkan harga asli lewat layar Tarif (berlaku mulai hari ini, atau mulai tanggal yang sama bila harga contoh itu berjangka), lalu jalankan cabut lagi.",
  ];
}

function laporanPesanan(pesanan: RencanaCabut["pesananTerbuka"]): string[] {
  if (pesanan.length === 0) return [];
  return [
    `${pesanan.length} pesanan masih berjalan di Lokasi (Contoh); tinjau dan batalkan lewat Antrean:`,
    ...pesanan.map((satu) => `  - ${satu.nomor} (${satu.kind}, ${satu.status}) di ${satu.lokasiKode}`),
  ];
}

async function cabut(ctx: Konteks, perintah: Perintah): Promise<Hasil> {
  const { modul, dataContoh } = ctx;
  if (!perintah.tulis) {
    const rencana = await dataContoh.rencanaCabut();
    return {
      exitCode: rencana.diblokir.length > 0 ? 1 : 0,
      output: ["[data-contoh] Mode dry-run: tidak ada yang ditulis.", ...laporanRencanaCabut(rencana), "Gunakan --tulis untuk mencabutnya."].join("\n"),
    };
  }
  const admin = await adminPlatform(modul.identity);
  if (!admin) return { exitCode: 1, output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu." };
  const hasil: CabutResult = await dataContoh.cabut(admin, { reason: perintah.alasan });
  if (hasil.ok) {
    const jumlah = Object.entries(hasil.dicabut).map(([jenis, banyak]) => `${jenis}: ${banyak}`);
    return {
      exitCode: 0,
      output: [jumlah.length === 0 ? "Tidak ada Data Contoh yang aktif; tidak ada yang dicabut." : `Data Contoh dicabut (${jumlah.join(", ")}). Tidak ada yang aktif lagi.`, ...laporanPesanan(hasil.pesananTerbuka)].join("\n"),
    };
  }
  if (hasil.reason === "harga_contoh_masih_berlaku") return { exitCode: 1, output: [...laporanDiblokir(hasil.diblokir), ...laporanPesanan(hasil.pesananTerbuka)].join("\n") };
  if (hasil.reason === "masih_aktif") {
    return {
      exitCode: 1,
      output: [
        `Ditolak: ${hasil.sisa.length} entri masih aktif setelah dicabut:`,
        ...hasil.gagal.map((satu) => `  - ${satu.kode}: ${satu.alasan}`),
        ...laporanPesanan(hasil.pesananTerbuka),
      ].join("\n"),
    };
  }
  return { exitCode: 1, output: `Ditolak: ${hasil.reason}.` };
}

/**
 * `data-contoh tanam --set rilis1 | cabut | status`. `options.clock` is only a test's, so a version
 * entered "today" is in force at the instant it reads back; `options.lokasi` is only a test's reduced set.
 */
export async function dataContohCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
  options: { clock?: Clock; lokasi?: ContohLokasiSpec[] } = {},
): Promise<Hasil> {
  const dibaca = bacaPerintah(argv, source);
  if ("tolak" in dibaca) return dibaca.tolak;
  const { perintah } = dibaca;

  try {
    const env = readRuntimeEnv(source);
    const database = createDatabase(env.DATABASE_URL, { max: 2, applicationName: "makam-data-contoh" });
    try {
      // Every Entri Audit this run writes carries its reason (the command and the environment), whichever module writes it.
      const { modul, operatorSettings, audit } = susunModul(env, database, options.clock, perintah.alasan);
      const ctx: Konteks = {
        modul,
        operatorSettings,
        penawaran: createPenawaranLayanan({ db: database.db, clock: modul.adapters.clock, audit, tariffs: modul.tariffs }),
        dataContoh: createDataContoh({
          db: database.db,
          clock: modul.adapters.clock,
          audit,
          lokasi: modul.lokasi,
          identity: modul.identity,
          tariffs: modul.tariffs,
          pemesanan: { pesananBerjalanDiLokasi: (lokasiId) => pesananBerjalanDiLokasi({ db: database.db }, lokasiId) },
        }),
        lokasi: options.lokasi ?? LOKASI_RILIS1,
      };
      if (perintah.sub === "status") return await status(ctx);
      if (perintah.sub === "cabut") return await cabut(ctx, perintah);
      return await tanam(ctx, perintah);
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

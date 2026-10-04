/**
 * `npm run data-contoh -- <tanam --set rilis1|rilis3 | cabut | status> [--tulis] [--izinkan-staging]
 * [--izinkan-production]`, in the image `node dist/data-contoh.mjs ...` (tickets 109 and 111).
 *
 * The beta on the SumoPod sandbox shows MANY clearly marked example records,
 * prices included, and one command removes them before real operation: `tanam`
 * plants a set, `cabut` retires everything the registry holds, `status` lists
 * what is active. The registry is the Data Contoh module's (`src/domain/data-contoh`);
 * what a set contains is built by `seed-contoh-publik`'s own machinery (five
 * Lokasi Mitra through the real publish gate, their Denah and staff), marked
 * "(Contoh)" and example-priced (`data-contoh/rilis1.ts`). `--set rilis3` (ticket 111) adds what level 3 needs
 * beside it (`data-contoh/rilis3.ts`): the DKI price and Mitra Jasa rate of every Layanan variant with their
 * "boleh di TPU DKI" marks, three Mitra Jasa (Contoh), two Nazhir (Contoh), the Rilis 2 rules on two Lokasi (Contoh),
 * and the Retribusi Pemda of an IPTM at Rp 0 as a REAL value (the owner's decision), which no registry row names.
 * It builds on the launch data (the Layanan catalog and the DKI TPU, `import:data-peluncuran`) and on `--set rilis1`.
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
  type PekerjaanBerjalanMitraJasa,
  type RencanaCabut,
  type RencanaTanam,
  type VarianTakDitawarkan,
} from "@/domain/data-contoh";
import type { Actor } from "@/domain/identity";
import { createMitraJasaDaftar, createPenawaranLayanan, type JenisLayanan } from "@/domain/layanan";
import { DEFAULT_POLICIES } from "@/domain/lokasi";
import { pesananBerjalanDiLokasi } from "@/domain/pemesanan";
import { createNazhirList } from "@/domain/wakaf";
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
  tandaContoh,
} from "./data-contoh/rilis1";
import {
  ATURAN_RILIS2_DATA_CONTOH,
  cakupanMitraJasa,
  HARGA_DKI_DATA_CONTOH,
  MITRA_JASA_DATA_CONTOH,
  NAZHIR_DATA_CONTOH,
  RETRIBUSI_PEMDA_IPTM_ASLI,
  TARIF_MITRA_JASA_DATA_CONTOH,
  type AturanRilis2,
} from "./data-contoh/rilis3";
import { adminPlatform, isiPengaturanOperatorBilaKosong, type Modul } from "./dev-seed-support";
import { seedOneLokasi, susunModul, undangPetugas, type ContohLokasiSpec } from "./seed-contoh-publik-command";

const USAGE =
  "Pakai: data-contoh tanam --set rilis1|rilis3 | data-contoh cabut | data-contoh status [--tulis] [--izinkan-staging] [--izinkan-production]";

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
  mitraJasa: ReturnType<typeof createMitraJasaDaftar>;
  nazhir: ReturnType<typeof createNazhirList>;
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

/** What a dry run of `tanam --set rilis1` finds, from reads only. */
async function ujiTanamRilis1(ctx: Konteks): Promise<Hasil> {
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

async function tanamRilis1(ctx: Konteks, perintah: Perintah): Promise<Hasil> {
  if (!perintah.tulis) return ujiTanamRilis1(ctx);
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

/* The Rilis 3 set (ticket 111) */

/** One Layanan variant of the catalog, with the kind of its Layanan and the segment its fixtures' codes carry. */
interface VarianKatalog {
  id: string;
  jenis: JenisLayanan;
  /** `<Layanan> / <varian>`, as the reports name it. */
  nama: string;
  kode: string;
}

/** What `tanam --set rilis3` builds on, read from the stack. */
interface PrasyaratRilis3 {
  varian: VarianKatalog[];
  /** The DKI TPU, by name. */
  tpuDkiIds: string[];
  /** The Rilis 2 rules and the Lokasi (Contoh) of the Rilis 1 set each goes on. */
  aturan: { aturan: AturanRilis2; lokasiId: string; kode: string }[];
}

const kodeLokasiAturan = (aturan: AturanRilis2) => `rilis1/lokasi/${slug(tandaContoh(aturan.lokasi))}`;
const kodeAturan = (aturan: AturanRilis2) => `rilis3/aturan/${slug(tandaContoh(aturan.lokasi))}`;

/** Every variant of the catalog, in catalog order. */
async function varianKatalog(ctx: Konteks): Promise<VarianKatalog[]> {
  const katalog = await ctx.penawaran.katalog();
  return katalog.flatMap((layanan) =>
    layanan.varian.map((satu) => ({ id: satu.id, jenis: layanan.jenis, nama: `${layanan.name} / ${satu.name}`, kode: `${slug(layanan.name)}/${slug(satu.name)}` })),
  );
}

/**
 * The launch data and the Rilis 1 Lokasi (Contoh) the set builds on, or what is missing. Nothing is planted without all of
 * them: a set with no variant or no TPU would plant half of what level 3 needs and look done.
 */
async function bacaPrasyaratRilis3(ctx: Konteks, admin: Actor): Promise<{ ok: true; prasyarat: PrasyaratRilis3 } | { ok: false; output: string }> {
  const varian = await varianKatalog(ctx);
  const tpu = (await ctx.modul.lokasi.tpuDkiList(admin)).sort((a, b) => a.name.localeCompare(b.name));
  const { aktif } = await ctx.dataContoh.status();
  const aturan = ATURAN_RILIS2_DATA_CONTOH.map((satu) => ({
    aturan: satu,
    kode: kodeAturan(satu),
    lokasi: aktif.find((entri) => entri.jenis === "lokasi_mitra" && entri.kode === kodeLokasiAturan(satu) && entri.lengkap),
  }));
  const kurang: string[] = [];
  if (varian.length === 0) kurang.push("katalog Layanan kosong: jalankan import:data-peluncuran dulu.");
  if (tpu.length === 0) kurang.push("belum ada TPU DKI: jalankan import:data-peluncuran dulu.");
  const belumAda = aturan.filter((satu) => !satu.lokasi);
  if (belumAda.length > 0) kurang.push(`Lokasi (Contoh) belum ditanam (${belumAda.map((satu) => tandaContoh(satu.aturan.lokasi)).join(", ")}): jalankan tanam --set rilis1 dulu.`);
  if (kurang.length > 0) {
    return { ok: false, output: ["Ditolak: tanam --set rilis3 bertumpu pada data peluncuran dan set Rilis 1, dan yang berikut belum ada; tidak ada yang ditanam:", ...kurang.map((baris) => `  - ${baris}`)].join("\n") };
  }
  return { ok: true, prasyarat: { varian, tpuDkiIds: tpu.map((satu) => satu.id), aturan: aturan.map((satu) => ({ aturan: satu.aturan, kode: satu.kode, lokasiId: satu.lokasi!.entitasId })) } };
}

/** Whether a Lokasi's four Rilis 2 rules already are the set's, or are still what a new Lokasi starts with (nobody has set them). */
const aturanSudahItu = (policies: typeof DEFAULT_POLICIES, saleTransfersAllowed: boolean, aturan: AturanRilis2) =>
  policies.masaTenggangMonths === aturan.masaTenggangMonths &&
  policies.maxPerpanjanganTerms === aturan.maxPerpanjanganTerms &&
  policies.gantiPemegangHakFee === aturan.gantiPemegangHakFee &&
  saleTransfersAllowed === aturan.saleTransfersAllowed;
const aturanMasihBawaan = (policies: typeof DEFAULT_POLICIES, saleTransfersAllowed: boolean) =>
  policies.masaTenggangMonths === DEFAULT_POLICIES.masaTenggangMonths &&
  policies.maxPerpanjanganTerms === DEFAULT_POLICIES.maxPerpanjanganTerms &&
  policies.gantiPemegangHakFee === DEFAULT_POLICIES.gantiPemegangHakFee &&
  !saleTransfersAllowed;

/**
 * The Rilis 3 set's fixtures, in the order they depend on each other: every variant's DKI price, then its Mitra Jasa rate,
 * then its "boleh di TPU DKI" mark (only where this set priced it), the Mitra Jasa (Contoh), the Nazhir (Contoh), and the
 * Rilis 2 rules. A fixture whose build finds the Operator's own value there (a price, a mark, rules someone has set) plants
 * nothing and records nothing: the set never overwrites a real value.
 */
function rencanaRilis3(ctx: Konteks, admin: Actor, prasyarat: PrasyaratRilis3, hariIni: string, alasan: string): RencanaTanam[] {
  const { modul, dataContoh, penawaran, mitraJasa, nazhir } = ctx;
  const gagal = (reason: string) => ({ ok: false as const, reason });
  const sekarang = () => modul.adapters.clock.now();
  const { varian, tpuDkiIds } = prasyarat;

  const hargaDki = (satu: VarianKatalog): RencanaTanam => ({
    kode: `rilis3/harga-dki/${satu.kode}`,
    jenis: "harga_layanan_dki",
    layananVariantId: satu.id,
    async buat({ catatInduk }) {
      // A contoh price a killed run left was recorded by `tanam` before this build; a price in force now is the Operator's own.
      if (await modul.tariffs.hargaLayananDki(satu.id, sekarang())) return { ok: true };
      const dibuat = await modul.tariffs.setHargaLayananDki(admin, satu.id, { amount: HARGA_DKI_DATA_CONTOH[satu.jenis], effectiveOn: hariIni, reason: alasan });
      if (!dibuat.ok) return gagal(`harga DKI contoh ${satu.nama}: ${dibuat.reason}`);
      await catatInduk(`${satu.id}:${dibuat.version.seq}`);
      return { ok: true };
    },
  });

  const tarifMitraJasa = (satu: VarianKatalog): RencanaTanam => ({
    kode: `rilis3/tarif-mitra-jasa/${satu.kode}`,
    jenis: "tarif_mitra_jasa",
    layananVariantId: satu.id,
    async buat({ catatInduk }) {
      if (await modul.tariffs.mitraJasaRate(admin, satu.id, sekarang())) return { ok: true };
      const dibuat = await modul.tariffs.setTarifMitraJasa(admin, satu.id, { amount: TARIF_MITRA_JASA_DATA_CONTOH[satu.jenis], effectiveOn: hariIni, reason: alasan });
      if (!dibuat.ok) return gagal(`tarif Mitra Jasa contoh ${satu.nama}: ${dibuat.reason}`);
      await catatInduk(`${satu.id}:${dibuat.version.seq}`);
      return { ok: true };
    },
  });

  const tandaTpu = (satu: VarianKatalog): RencanaTanam => ({
    kode: `rilis3/tanda-tpu/${satu.kode}`,
    jenis: "tanda_tpu_dki",
    async buat({ catatInduk }) {
      // Only a variant this set priced is marked: whether to offer a variant the Operator prices at a TPU is the Operator's call.
      const { aktif } = await dataContoh.status();
      if (!aktif.some((entri) => entri.jenis === "harga_layanan_dki" && entri.lengkap && entri.entitasId.startsWith(`${satu.id}:`))) return { ok: true };
      const ada = (await penawaran.katalog()).flatMap((layanan) => layanan.varian).find((v) => v.id === satu.id);
      // Already marked: the mark is somebody's own, left alone (`cabut` still takes it off while the price is a contoh one).
      if (!ada || ada.bolehDiTpu) return { ok: true };
      const tanda = await penawaran.tandaiBolehDiTpu(admin, satu.id, { boleh: true, reason: alasan });
      if (!tanda.ok) return gagal(`tanda "boleh di TPU DKI" ${satu.nama}: ${tanda.reason}`);
      await catatInduk(satu.id);
      return { ok: true };
    },
  });

  const mitraJasaContoh = MITRA_JASA_DATA_CONTOH.map(
    (persona): RencanaTanam => ({
      kode: `rilis3/mitra-jasa/${persona.slug}`,
      jenis: "mitra_jasa",
      async buat({ catatInduk }) {
        let id: string;
        const dibuat = await mitraJasa.buatMitraJasa(admin, persona.email, { namaLengkap: persona.namaLengkap, nik: persona.nik, area: persona.area });
        if (dibuat.ok) id = dibuat.mitraJasaId;
        else if (dibuat.reason === "sudah_ada") {
          // The same Mitra Jasa (Contoh), left by a run that was killed before recording it or ended by an earlier `cabut`: taken up again.
          const ada = (await mitraJasa.semuaMitraJasa(admin)).find((satu) => satu.email === persona.email);
          if (!ada) return gagal(`Mitra Jasa ${persona.namaLengkap}: NIK ${persona.nik} sudah dipakai oleh orang lain`);
          id = ada.id;
          if (ada.status !== "aktif") {
            const diaktifkan = await mitraJasa.ubahStatus(admin, id, { status: "aktif", alasan });
            if (!diaktifkan.ok) return gagal(`Mitra Jasa ${persona.namaLengkap} tidak bisa diaktifkan lagi: ${diaktifkan.reason}`);
          }
        } else return gagal(`Mitra Jasa ${persona.namaLengkap}: ${dibuat.reason}`);
        await catatInduk(id);
        const cakupan = await mitraJasa.ubahCoverage(admin, id, cakupanMitraJasa(persona.cakupan, tpuDkiIds, varian));
        if (!cakupan.ok) return gagal(`cakupan ${persona.namaLengkap}: ${cakupan.reason}`);
        return { ok: true };
      },
    }),
  );

  const nazhirContoh = NAZHIR_DATA_CONTOH.map(
    (satu): RencanaTanam => ({
      kode: `rilis3/nazhir/${satu.slug}`,
      jenis: "nazhir",
      async buat({ catatInduk }) {
        // The same Nazhir (Contoh) a killed run left is recorded, not added a second time.
        const ada = (await nazhir.daftarNazhir(admin)).find((lama) => lama.nama === satu.nama && lama.kabKota === satu.kabKota);
        if (ada) {
          await catatInduk(ada.id);
          return { ok: true };
        }
        const dibuat = await nazhir.tambahNazhir(admin, { nama: satu.nama, jenis: satu.jenis, kabKota: satu.kabKota, kontak: satu.kontak, nomorBwi: satu.nomorBwi });
        if (!dibuat.ok) return gagal(`Nazhir ${satu.nama}: ${dibuat.reason}`);
        await catatInduk(dibuat.nazhir.id);
        return { ok: true };
      },
    }),
  );

  const aturanContoh = prasyarat.aturan.map(
    ({ aturan, kode, lokasiId }): RencanaTanam => ({
      kode,
      jenis: "aturan_lokasi",
      async buat({ catatInduk }) {
        const profil = await modul.lokasi.lokasiMitra(admin, lokasiId);
        if (!profil.ok) return gagal(`aturan Rilis 2 ${aturan.lokasi}: ${profil.reason}`);
        const { policies, flags } = profil.lokasiMitra;
        if (!aturanSudahItu(policies, flags.saleTransfersAllowed, aturan)) {
          // Rules someone has already set on this Lokasi are theirs: nothing is written, nothing recorded.
          if (!aturanMasihBawaan(policies, flags.saleTransfersAllowed)) return { ok: true };
          const diatur = await modul.lokasi.setPoliciesAndFlags(admin, lokasiId, {
            policies: { ...policies, masaTenggangMonths: aturan.masaTenggangMonths, maxPerpanjanganTerms: aturan.maxPerpanjanganTerms, gantiPemegangHakFee: aturan.gantiPemegangHakFee },
            flags: { ...flags, saleTransfersAllowed: aturan.saleTransfersAllowed },
          });
          if (!diatur.ok) return gagal(`aturan Rilis 2 ${aturan.lokasi}: ${diatur.reason}`);
        }
        await catatInduk(lokasiId);
        return { ok: true };
      },
    }),
  );

  return [...varian.map(hargaDki), ...varian.map(tarifMitraJasa), ...varian.map(tandaTpu), ...mitraJasaContoh, ...nazhirContoh, ...aturanContoh];
}

/**
 * Enters the Retribusi Pemda of an IPTM as Rp 0 when no version of it is in force: the owner's real value, so its reason does
 * not begin with the mark of a tanam (that is how the Audit Log tells an example price), no registry row names it, and
 * `cabut` never waits for it to be superseded.
 */
async function masukkanRetribusi(ctx: Konteks, admin: Actor, perintah: Perintah, hariIni: string): Promise<{ ok: true; baru: boolean; jumlah: number } | { ok: false; reason: string }> {
  const { tariffs, adapters } = ctx.modul;
  const ada = await tariffs.globalTariff("retribusi_pemda_iptm", adapters.clock.now());
  if (ada) return { ok: true, baru: false, jumlah: ada.amount };
  const dibuat = await tariffs.setGlobalTariff(admin, {
    key: "retribusi_pemda_iptm",
    amount: RETRIBUSI_PEMDA_IPTM_ASLI,
    effectiveOn: hariIni,
    reason: `nilai asli (keputusan owner), dimasukkan oleh ${perintah.alasan}`,
  });
  return dibuat.ok ? { ok: true, baru: true, jumlah: dibuat.version.amount } : { ok: false, reason: dibuat.reason };
}

/** What a dry run of `tanam --set rilis3` finds, from reads only. */
async function ujiTanamRilis3(ctx: Konteks, admin: Actor, prasyarat: PrasyaratRilis3): Promise<Hasil> {
  const { modul, dataContoh } = ctx;
  const sekarang = modul.adapters.clock.now();
  const { aktif } = await dataContoh.status();
  const sudah = (kode: string) => aktif.some((entri) => entri.kode === kode && entri.lengkap);
  let tanpaHarga = 0;
  let tanpaTarif = 0;
  for (const satu of prasyarat.varian) {
    if (!(await modul.tariffs.hargaLayananDki(satu.id, sekarang))) tanpaHarga += 1;
    if (!(await modul.tariffs.mitraJasaRate(admin, satu.id, sekarang))) tanpaTarif += 1;
  }
  const mitraBaru = MITRA_JASA_DATA_CONTOH.filter((satu) => !sudah(`rilis3/mitra-jasa/${satu.slug}`));
  const nazhirBaru = NAZHIR_DATA_CONTOH.filter((satu) => !sudah(`rilis3/nazhir/${satu.slug}`));
  const aturanBaru = prasyarat.aturan.filter((satu) => !sudah(satu.kode));
  const retribusi = await modul.tariffs.globalTariff("retribusi_pemda_iptm", sekarang);
  return {
    exitCode: 0,
    output: [
      "[data-contoh] Mode dry-run: tidak ada yang ditulis.",
      `Varian Layanan di katalog: ${prasyarat.varian.length}; harga DKI contoh akan dicatat untuk ${tanpaHarga} yang belum punya harga DKI, tarif Mitra Jasa contoh untuk ${tanpaTarif} yang belum punya tarif, lalu tanda "boleh di TPU DKI" pada yang diberi harga contoh (varian dengan harga asli dilewati).`,
      `Mitra Jasa (Contoh): ${mitraBaru.length} akan ditanam, ${MITRA_JASA_DATA_CONTOH.length - mitraBaru.length} sudah ada, mencakup ${prasyarat.tpuDkiIds.length} TPU DKI.`,
      `Nazhir (Contoh): ${nazhirBaru.length} akan ditanam, ${NAZHIR_DATA_CONTOH.length - nazhirBaru.length} sudah ada.`,
      `Aturan Rilis 2 di Lokasi (Contoh): ${aturanBaru.length} akan dipasang, ${prasyarat.aturan.length - aturanBaru.length} sudah ada (${prasyarat.aturan.map((satu) => tandaContoh(satu.aturan.lokasi)).join(", ")}).`,
      retribusi
        ? `Retribusi Pemda IPTM: sudah ada (${rupiah(retribusi.amount)}), tidak ditulis.`
        : `Retribusi Pemda IPTM: ${rupiah(RETRIBUSI_PEMDA_IPTM_ASLI)} akan dimasukkan sebagai nilai asli (bukan contoh).`,
      "Gunakan --tulis untuk menanamnya.",
    ].join("\n"),
  };
}

async function tanamRilis3(ctx: Konteks, perintah: Perintah): Promise<Hasil> {
  const { modul, dataContoh } = ctx;
  const admin = await adminPlatform(modul.identity);
  if (!admin) return { exitCode: 1, output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu." };
  const prasyarat = await bacaPrasyaratRilis3(ctx, admin);
  if (!prasyarat.ok) return { exitCode: 1, output: prasyarat.output };
  if (!perintah.tulis) return ujiTanamRilis3(ctx, admin, prasyarat.prasyarat);
  const hariIni = wibDateOf(modul.adapters.clock.now());

  // The Retribusi Pemda first: a real value a TPU order cannot be quoted without, independent of the example data.
  const retribusi = await masukkanRetribusi(ctx, admin, perintah, hariIni);
  if (!retribusi.ok) return { exitCode: 1, output: `Ditolak: Retribusi Pemda IPTM tidak tersimpan (${retribusi.reason}).` };
  const tertanam = await dataContoh.tanam(admin, { himpunan: "rilis3", reason: perintah.alasan, rencana: rencanaRilis3(ctx, admin, prasyarat.prasyarat, hariIni, perintah.alasan) });
  if (!tertanam.ok) {
    const gagal =
      "alasan" in tertanam
        ? [
            `Ditolak: ${tertanam.kode} gagal ditanam (${tertanam.alasan}); yang sudah dibuatnya dicabut kembali.`,
            "Bagian yang sudah selesai sebelumnya tetap tercatat: jalankan tanam lagi setelah masalahnya diperbaiki.",
          ]
        : [`Ditolak: ${tertanam.reason}.`];
    // The Retribusi Pemda went in first and is a real value: a failed run does not take it back, and `cabut` never touches it.
    return { exitCode: 1, output: [...gagal, `Retribusi Pemda IPTM ${rupiah(retribusi.jumlah)} (nilai asli) tetap berlaku: ia bukan Data Contoh dan tidak ikut dicabut.`].join("\n") };
  }
  const baris = [
    tertanam.dibuat.length === 0 && !retribusi.baru
      ? "Data Contoh rilis3 sudah ditanam; data-contoh tidak mengubah apa pun."
      : `Data Contoh rilis3 ditanam: ${tertanam.dibuat.length} bagian baru (${tertanam.sudahAda.length} sudah ada).`,
    retribusi.baru
      ? `Retribusi Pemda IPTM: ${rupiah(retribusi.jumlah)} dimasukkan sebagai nilai asli (bukan contoh; cabut tidak menyentuhnya).`
      : `Retribusi Pemda IPTM: sudah ada (${rupiah(retribusi.jumlah)}), tidak ditulis.`,
  ];
  if (tertanam.dilewati.length > 0) baris.push(`${tertanam.dilewati.length} bagian dilewati: harga, tanda atau aturan dari Operator sudah ada di sana, tidak disentuh.`);
  return { exitCode: 0, output: baris.join("\n") };
}

async function tanam(ctx: Konteks, perintah: Perintah): Promise<Hasil> {
  return perintah.himpunan === "rilis3" ? tanamRilis3(ctx, perintah) : tanamRilis1(ctx, perintah);
}

function laporanRencanaCabut(rencana: RencanaCabut, nama: Map<string, string>): string[] {
  const baris =
    rencana.aktif.length > 0
      ? [`${rencana.aktif.length} entri aktif akan dicabut:`, ...entriPerJenis(rencana.aktif)]
      : [rencana.diblokir.length === 0 && rencana.tidakDitawarkan.length === 0 ? "Tidak ada Data Contoh yang aktif." : "Registri tidak memegang entri aktif."];
  if (rencana.diblokir.length > 0) baris.push(...laporanDiblokir(rencana.diblokir));
  baris.push(...laporanTidakDitawarkan(rencana.tidakDitawarkan, nama, true));
  baris.push(...laporanPesanan(rencana.pesananTerbuka));
  return baris;
}

/** The variants `cabut` stops offering at a TPU, by name, and which of their two prices is still an example. */
function laporanTidakDitawarkan(daftar: VarianTakDitawarkan[], nama: Map<string, string>, dryRun: boolean): string[] {
  if (daftar.length === 0) return [];
  return [
    `${daftar.length} varian Layanan ${dryRun ? "tidak akan" : "tidak"} lagi ditawarkan di TPU (harga DKI atau tarif Mitra Jasa contoh belum digantikan versi asli; tanda "boleh di TPU DKI" dicabut):`,
    ...daftar.map((satu) => {
      const sebab = [satu.hargaDki ? "harga DKI contoh" : null, satu.tarifMitraJasa ? "tarif Mitra Jasa contoh" : null].filter((teks) => teks !== null).join(", ");
      return `  - ${nama.get(satu.layananVariantId) ?? satu.layananVariantId} (${sebab})`;
    }),
    dryRun
      ? "Agar varian itu tetap ditawarkan, masukkan harga DKI dan tarif Mitra Jasa asli lewat layar Layanan sebelum cabut --tulis."
      : "Masukkan harga DKI dan tarif Mitra Jasa asli lewat layar Layanan, lalu tandai variannya lagi bila perlu.",
    "Pesanan TPU yang sudah masuk dengan harga itu tidak dibatalkan di sini: tinjau lewat Antrean.",
  ];
}

/** The jobs a Mitra Jasa (Contoh) still has in progress when it is set to Berhenti: left to it, for Admin Platform to reassign. */
function laporanPekerjaanBerjalan(daftar: PekerjaanBerjalanMitraJasa[]): string[] {
  const jumlah = daftar.reduce((total, satu) => total + satu.pekerjaan.length, 0);
  if (jumlah === 0) return [];
  return [
    `${jumlah} pekerjaan masih berjalan pada Mitra Jasa (Contoh) yang diberhentikan dan tidak dilepas; tugaskan ulang lewat layar Layanan:`,
    ...daftar.flatMap((satu) => satu.pekerjaan.map((job) => `  - ${satu.kode}: pekerjaan ${job.id} (${job.status}, target ${job.targetDate})`)),
  ];
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
  // Even the dry run reads as Admin Platform: the Mitra Jasa rates it checks are Admin Platform's to read.
  const admin = await adminPlatform(modul.identity);
  if (!admin) return { exitCode: 1, output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu." };
  const nama = new Map((await varianKatalog(ctx)).map((satu) => [satu.id, satu.nama] as const));
  if (!perintah.tulis) {
    const rencana = await dataContoh.rencanaCabut(admin);
    if (!rencana.ok) return { exitCode: 1, output: `Ditolak: ${rencana.reason}.` };
    return {
      exitCode: rencana.diblokir.length > 0 ? 1 : 0,
      output: ["[data-contoh] Mode dry-run: tidak ada yang ditulis.", ...laporanRencanaCabut(rencana, nama), "Gunakan --tulis untuk mencabutnya."].join("\n"),
    };
  }
  const hasil: CabutResult = await dataContoh.cabut(admin, { reason: perintah.alasan });
  if (hasil.ok) {
    const jumlah = Object.entries(hasil.dicabut).map(([jenis, banyak]) => `${jenis}: ${banyak}`);
    return {
      exitCode: 0,
      output: [
        jumlah.length === 0
          ? hasil.tidakDitawarkan.length === 0
            ? "Tidak ada Data Contoh yang aktif; tidak ada yang dicabut."
            : "Registri tidak memegang entri aktif; tidak ada entri yang dicabut."
          : `Data Contoh dicabut (${jumlah.join(", ")}). Tidak ada yang aktif lagi.`,
        ...laporanTidakDitawarkan(hasil.tidakDitawarkan, nama, false),
        ...laporanPekerjaanBerjalan(hasil.pekerjaanBerjalan),
        ...laporanPesanan(hasil.pesananTerbuka),
      ].join("\n"),
    };
  }
  if (hasil.reason === "harga_contoh_masih_berlaku") return { exitCode: 1, output: [...laporanDiblokir(hasil.diblokir), ...laporanPesanan(hasil.pesananTerbuka)].join("\n") };
  if (hasil.reason === "masih_aktif") {
    return {
      exitCode: 1,
      output: [
        `Ditolak: ${hasil.sisa.length} entri masih aktif setelah dicabut:`,
        ...hasil.gagal.map((satu) => `  - ${satu.kode}: ${satu.alasan}`),
        ...laporanPekerjaanBerjalan(hasil.pekerjaanBerjalan),
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
      const komposisi = { db: database.db, clock: modul.adapters.clock, audit };
      const penawaran = createPenawaranLayanan({ ...komposisi, tariffs: modul.tariffs });
      const mitraJasa = createMitraJasaDaftar(komposisi);
      const nazhir = createNazhirList(komposisi);
      const ctx: Konteks = {
        modul,
        operatorSettings,
        penawaran,
        mitraJasa,
        nazhir,
        dataContoh: createDataContoh({
          db: database.db,
          clock: modul.adapters.clock,
          audit,
          lokasi: modul.lokasi,
          identity: modul.identity,
          tariffs: modul.tariffs,
          layanan: { ...penawaran, ...mitraJasa },
          wakaf: nazhir,
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

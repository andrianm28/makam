/**
 * `npx tsx src/cli/seed-contoh-publik.ts` (dev) or, in a local stack's image,
 * `node dist/seed-contoh-publik.mjs [--izinkan-staging]`: gives a stack the
 * five example Lokasi Mitra of the public-site prototype
 * (`origin/prototype-public-site`'s `_mock/data.ts`), each taken all the way
 * to Terverifikasi through the real publish gate — a priced Jenis Makam per
 * mock entry, cleared Tersedia Petak, Jam Operasional, a Kontak Siaga, real
 * JPEG Kunjungan Verifikasi photos and, where the mock has `terencanaAktif`,
 * "Pemesanan Terencana aktif" switched on through its own gate (Cek Denah,
 * every Petak cleared). It also enters the shared example Pengaturan Operator
 * (the mock's CS contact, `dev-seed-support.ts`) when that is empty, never
 * overwriting it. A Lokasi Mitra an older run already listed is reconciled
 * with the mock, only ever adding (the Tersedia Petak / Kavling units it is
 * short of, and the Kontak Siaga's name while empty); once nothing is short
 * it changes nothing. Development and test always; staging — the environment the
 * beta for UAT runs on — only with the named allowance `--izinkan-staging`,
 * refused by default and named in the reason of every write that carries one
 * (`alasanSeed`, the same pattern as `import-katalog-lama-command.ts`'s
 * `alasanImport`). Production is refused outright. Exit 0 seeded or already
 * there, 1 refused or failed, 2 usage.
 *
 * Every email this command sends (Undangan Staf, Undangan Admin Lokasi, Kode
 * Masuk) goes to an address this command itself invented, never a real
 * person's — so it composes its own `identity` on a `FakeEmailSender`
 * regardless of environment, staging included, the same way
 * `masukDenganKodeMasuk` (`dev-seed-support.ts`) already reads the Kode Masuk
 * back from that fake in development and test. No real SMTP call is ever made
 * for these five fixtures, and the invented addresses are themselves on the
 * RFC 2606 reserved `.invalid` TLD besides, so even a future change that wired
 * a live sender in here by mistake could not reach a real inbox. Every other
 * port (FileStore, WebPush, PaymentProvider, PdfRenderer) stays whatever
 * `createAdapters` gives the running environment: on staging that is the real
 * live FileStore, so the Kunjungan Verifikasi photos and the agreement scan
 * land in the same private volume a real Lokasi Mitra's would.
 *
 * These five are deliberately never marked `data_contoh` (the flag that hides
 * a Lokasi Mitra from the public listing, ticket 86): the whole point of this
 * command is to make the public site's real listing, filters and wizards
 * walkable on a stack that otherwise has no Lokasi Mitra at all. They are dev
 * fixtures the same way `seed-saat-duka`'s is, just five of them and closer
 * to a design mock, not sanitised production imports.
 *
 * A few of the mock's fields have no real counterpart, and this command
 * approximates or drops them rather than inventing new domain state:
 * - `jenis` (Swasta/Wakaf/Yayasan/Masjid) is prototype-only; the real Lokasi
 *   Mitra record has no such field (its `pengelolaName` carries the same
 *   flavour in free text).
 * - `kontakSiaga.nama` ("Bapak Hendra", ...) IS reproduced 1:1: the Kontak
 *   Siaga is a real Admin Lokasi Akun, and an Akun's `name` starts empty
 *   until its own holder sets it (Akun Saya profile) — so this command's own
 *   `masukSebagai` (`dev-seed-support.ts`) passes the mock's name the same
 *   way a wizard's Kirim would, filling the Akun's name at its first Kode
 *   Masuk login (`identity.verifyKodeMasuk`'s existing optional `name`). Its
 *   phone number is real (the invited Admin Lokasi's own).
 * - Every Jenis Makam's Tersedia Petak count IS reproduced 1:1 with the
 *   mock's own `tersedia` (9–118 for most, down to the mock's small
 *   Kavling Keluarga counts): its Denah is one or more one-row Bloks, each at
 *   most Inventory's own `MAX_BLOK_DIMENSION` (40) wide (`denahChunksFor`),
 *   every cell of every one cleared Tersedia through `clearPetak`,
 *   sequentially — never a leftover Perlu Verifikasi cell anywhere at the
 *   Lokasi, which the two mock entries with `terencanaAktif: true` (Wakaf
 *   Al-Ikhlas, Hijau Asri) need to switch it on at all. A "Kavling Keluarga N
 *   Petak" mock entry becomes that many real Kavling Keluarga units instead
 *   (`createKavling` + `clearKavling`, one call per unit), the mock's own
 *   `tersedia` count of units (1–2). The one Jenis Makam the mock lists with
 *   `tersedia: 0` (Hijau Asri's "Makam Taman") is reproduced with its one
 *   Petak cleared Tidak Tersedia, which is what a real zero-availability
 *   Jenis Makam looks like.
 * - The mock's facilities are mapped onto the Kunjungan Verifikasi checklist
 *   1:1 (mushola→musala, akses-mobil→akses_ambulans, keamanan→pos_jaga,
 *   pendopo→tempat_duduk, air→air_bersih, parkir and toilet unchanged); every
 *   mock facility has a real counterpart, so none is dropped.
 * - The mock's `dikunjungi` month ("Agustus 2026", ...) is not reproduced:
 *   `recordKunjunganVerifikasi`'s date is always its own Clock's "now" at the
 *   moment the visit is completed (fieldwork's `completeTugasLapangan`, which
 *   this command drives through its public function like anything else), and
 *   this command runs the real `SystemClock`, never a faked one — faking the
 *   Clock to backdate a visit is exactly the shortcut AGENTS.md rules out for
 *   domain code. Every seeded Lokasi Mitra's Kunjungan Verifikasi is dated the
 *   day this command is run.
 * - Firdaus's `hargaBaru` (a scheduled Harga Hak Pakai change) IS reproduced:
 *   a second tariff version on its "Makam Standar", effective 1 January 2027,
 *   through Tariffs' own versioning (`setJenisMakamTariff`) — the same
 *   mechanism a real Admin Platform would use to schedule a price change.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { FakeEmailSender } from "@/adapters/memory";
import { composeBilling } from "@/composition/billing";
import { composeIdentity } from "@/composition/identity";
import { composeNotifications } from "@/composition/notifications";
import { createAdapters } from "@/composition/adapters";
import { createDatabase } from "@/db/client";
import { createFieldwork } from "@/domain/fieldwork";
import type { Actor } from "@/domain/identity";
import { createInventory, MAX_BLOK_DIMENSION } from "@/domain/inventory";
import {
  createLokasi,
  DEFAULT_FLAGS,
  DEFAULT_POLICIES,
  type LokasiFacility,
  type LokasiFlags,
  type LokasiPolicies,
} from "@/domain/lokasi";
import type { JamOperasional } from "@/domain/lokasi/jam-operasional-schema";
import { createOperatorSettings } from "@/domain/operator-settings";
import { createTariffs } from "@/domain/tariffs";
import { appEnvironments, readRuntimeEnv, usesInMemoryFakes } from "@/lib/env";
import { wibDateOf } from "@/lib/time/jakarta";
import { cliFailure } from "./cli-failure";
import {
  adminPlatform,
  BIAYA_LAYANAN_PLATFORM_CONTOH,
  isiPengaturanOperatorBilaKosong,
  masukDenganKodeMasuk,
  masukSebagai,
  scanPerjanjian,
  type Gagal,
  type Modul,
} from "./dev-seed-support";

const USAGE = "Pakai: seed-contoh-publik [--izinkan-staging]";

const SEED_CONTOH_PUBLIK = "seed-contoh-publik";

/**
 * The reason every write this command makes carries (tariffs' own, and the
 * two staff invites), the same pattern as `import-katalog-lama-command.ts`'s
 * `alasanImport`: on staging it names the allowance, so the Audit Log of
 * every row says the row was created on the beta's own environment under an
 * explicit `--izinkan-staging`.
 */
function alasanSeed(staging: boolean): string {
  return staging ? `${SEED_CONTOH_PUBLIK} (staging, --izinkan-staging)` : SEED_CONTOH_PUBLIK;
}

/** The Operator's flat platform fee, shared with `seed-tagihan` (`dev-seed-support.ts`) and equal to the prototype's mock. */
const BIAYA_LAYANAN_PLATFORM = BIAYA_LAYANAN_PLATFORM_CONTOH;

/** The prototype's DOKUMEN list (spec, document checklist), the same four for every example Lokasi Mitra. */
const DOKUMEN = [
  "KTP Almarhum (atau fotokopinya)",
  "Surat keterangan kematian dari rumah sakit atau kelurahan",
  "Kartu Keluarga",
  "KTP Pemegang Hak",
];

// Reserved by RFC 2606: never delegated, so an address on it can never reach a
// real inbox even if a future change wired a live EmailSender in here by
// mistake. The same domain family the identity module already uses for its
// own undeliverable placeholders (`<id>@akun.makam.invalid`).
const PETUGAS = { email: "petugas.contoh-publik@contoh.makam.invalid", phoneNumber: "085299999999" };

function fixture(file: string): Uint8Array {
  const path = fileURLToPath(new URL(`./fixtures/contoh-publik/${file}`, import.meta.url));
  return new Uint8Array(readFileSync(path));
}

function everyDay(opens: string, closes: string): JamOperasional["weekly"] {
  const hours = { opens, closes };
  return { monday: hours, tuesday: hours, wednesday: hours, thursday: hours, friday: hours, saturday: hours, sunday: hours };
}

function mondayToSaturday(opens: string, closes: string): JamOperasional["weekly"] {
  const hours = { opens, closes };
  return { monday: hours, tuesday: hours, wednesday: hours, thursday: hours, friday: hours, saturday: hours, sunday: null };
}

type Tenure = { kind: "tahun"; years: number } | { kind: "selamanya" };

/** One mock `jenisMakam` entry, mapped onto a real Jenis Makam and the small Denah that backs its Tersedia Petak count. */
export interface JenisMakamSpec {
  name: string;
  /** Carries the mock's `ukuran`, since the real Jenis Makam has no separate size field. */
  description: string;
  tenure: Tenure;
  hargaHakPakai: number;
  hargaPerpanjangan: number | null;
  /** Cleared units after the domain-side cap described in this file's doc comment. */
  tersedia: number;
  /** Set only for a mock "Kavling Keluarga N Petak" entry: a real Kavling Keluarga of this many Petak per unit (`tersedia` units, each its own Kavling). */
  kavlingPetak?: number;
  /** The mock's one `tersedia: 0` entry: its single Petak is cleared Tidak Tersedia instead of Tersedia. */
  kosong?: boolean;
  /** The mock's `hargaBaru`: a second tariff version scheduled for a future date, same tenure and Perpanjangan price. */
  hargaBaru?: { effectiveOn: string; hargaHakPakai: number };
}

export interface ContohLokasiSpec {
  name: string;
  pengelolaName: string;
  address: string;
  city: string;
  pin: { lat: number; lng: number } | null;
  facilities: LokasiFacility[];
  weekly: JamOperasional["weekly"];
  biayaPemakaman: number;
  biayaPemakamanTumpang: number;
  jenisMakam: JenisMakamSpec[];
  masaPembatalanDays: number;
  refundAfterMasaPembatalanPercent: number;
  terencanaAktif: boolean;
  photos: string[];
  adminLokasiEmail: string;
  adminLokasiPhone: string;
  /** The mock's `kontakSiaga.nama`, given to `verifyKodeMasuk` at this Admin Lokasi's first Kode Masuk login. */
  kontakSiagaName: string;
}

/** The prototype's five example Lokasi Mitra (`_mock/data.ts` on `origin/prototype-public-site`), as close to the mock as the real domain allows. */
export const CONTOH_LOKASI: ContohLokasiSpec[] = [
  {
    name: "Taman Makam Firdaus",
    pengelolaName: "PT Firdaus Lestari Abadi",
    address: "Jl. Raya Cileungsi–Jonggol Km 8, Kabupaten Bogor",
    city: "Bogor",
    pin: { lat: -6.4153, lng: 106.9936 },
    facilities: ["musala", "parkir", "akses_ambulans", "air_bersih", "pos_jaga", "tempat_duduk", "toilet"],
    weekly: everyDay("07:00", "17:00"),
    biayaPemakaman: 2_500_000,
    biayaPemakamanTumpang: 1_750_000,
    jenisMakam: [
      {
        name: "Makam Standar",
        description: "Ukuran 1 × 2,5 m",
        tenure: { kind: "tahun", years: 20 },
        hargaHakPakai: 8_500_000,
        hargaPerpanjangan: 4_000_000,
        tersedia: 42,
        // Mock's hargaBaru: "Makam Standar menjadi Rp 9.000.000" from 1 Januari 2027.
        hargaBaru: { effectiveOn: "2027-01-01", hargaHakPakai: 9_000_000 },
      },
      { name: "Makam Taman", description: "Ukuran 1,5 × 3 m, tepi jalan setapak", tenure: { kind: "tahun", years: 20 }, hargaHakPakai: 14_000_000, hargaPerpanjangan: 6_500_000, tersedia: 9 },
      { name: "Makam Selamanya", description: "Ukuran 1,5 × 3 m", tenure: { kind: "selamanya" }, hargaHakPakai: 32_000_000, hargaPerpanjangan: null, tersedia: 3 },
    ],
    masaPembatalanDays: 14,
    refundAfterMasaPembatalanPercent: 70,
    terencanaAktif: false,
    // The mock's full four photos, in the mock's own order.
    photos: ["lokasi-jalan-taman.jpg", "lokasi-pendopo.jpg", "lokasi-taman-tropis.jpg", "tile-perpanjang.jpg"],
    adminLokasiEmail: "lokasi.firdaus@contoh.makam.invalid",
    adminLokasiPhone: "085100000001",
    kontakSiagaName: "Bapak Hendra",
  },
  {
    name: "Pemakaman Wakaf Al-Ikhlas",
    pengelolaName: "Yayasan Wakaf Al-Ikhlas",
    address: "Jl. Tanah Baru No. 21, Beji, Depok",
    city: "Depok",
    pin: { lat: -6.3627, lng: 106.8249 },
    facilities: ["musala", "air_bersih", "parkir", "toilet"],
    weekly: mondayToSaturday("06:00", "22:00"),
    biayaPemakaman: 1_500_000,
    biayaPemakamanTumpang: 1_000_000,
    jenisMakam: [
      { name: "Makam Umum", description: "Ukuran 1 × 2 m", tenure: { kind: "selamanya" }, hargaHakPakai: 3_000_000, hargaPerpanjangan: null, tersedia: 118 },
      { name: "Kavling Keluarga 2 Petak", description: "2 petak bersebelahan", tenure: { kind: "selamanya" }, hargaHakPakai: 6_500_000, hargaPerpanjangan: null, tersedia: 2, kavlingPetak: 2 },
    ],
    masaPembatalanDays: 7,
    refundAfterMasaPembatalanPercent: 50,
    terencanaAktif: true,
    photos: ["lokasi-makam-wakaf.jpg", "lokasi-blok.jpg"],
    adminLokasiEmail: "lokasi.wakaf-al-ikhlas@contoh.makam.invalid",
    adminLokasiPhone: "085100000002",
    kontakSiagaName: "Ustaz Farid",
  },
  {
    name: "Makam Masjid Nurul Huda",
    pengelolaName: "DKM Masjid Nurul Huda",
    address: "Jl. Pondok Aren Raya No. 5, Tangerang Selatan",
    city: "Tangerang Selatan",
    pin: { lat: -6.3063, lng: 106.764 },
    facilities: ["musala", "air_bersih", "toilet"],
    weekly: everyDay("05:00", "21:00"),
    biayaPemakaman: 1_250_000,
    biayaPemakamanTumpang: 900_000,
    jenisMakam: [
      { name: "Makam Umum", description: "Ukuran 1 × 2 m", tenure: { kind: "tahun", years: 10 }, hargaHakPakai: 2_500_000, hargaPerpanjangan: 1_500_000, tersedia: 27 },
    ],
    masaPembatalanDays: 7,
    refundAfterMasaPembatalanPercent: 0,
    terencanaAktif: false,
    photos: ["lokasi-pendopo.jpg", "lokasi-jalan-taman.jpg"],
    adminLokasiEmail: "lokasi.nurul-huda@contoh.makam.invalid",
    adminLokasiPhone: "085100000003",
    kontakSiagaName: "Bapak Syamsul",
  },
  {
    name: "Taman Peristirahatan Hijau Asri",
    pengelolaName: "Yayasan Hijau Asri Sejahtera",
    address: "Jl. Raya Setu No. 88, Kabupaten Bekasi",
    city: "Bekasi",
    // The mock itself has no `koordinat` for this one: a completed Kunjungan
    // Verifikasi may leave the pin unset, and this is that case, kept as is.
    pin: null,
    facilities: ["parkir", "akses_ambulans", "tempat_duduk", "pos_jaga", "toilet"],
    weekly: everyDay("07:00", "22:00"),
    biayaPemakaman: 3_000_000,
    biayaPemakamanTumpang: 2_000_000,
    jenisMakam: [
      { name: "Makam Standar", description: "Ukuran 1,2 × 2,5 m", tenure: { kind: "tahun", years: 25 }, hargaHakPakai: 9_000_000, hargaPerpanjangan: 5_000_000, tersedia: 64 },
      { name: "Makam Taman", description: "Ukuran 2 × 3 m, dengan pagar rendah", tenure: { kind: "tahun", years: 25 }, hargaHakPakai: 22_500_000, hargaPerpanjangan: 9_000_000, tersedia: 0, kosong: true },
      { name: "Kavling Keluarga 4 Petak", description: "2 × 2 petak bersebelahan", tenure: { kind: "tahun", years: 25 }, hargaHakPakai: 40_000_000, hargaPerpanjangan: 18_000_000, tersedia: 1, kavlingPetak: 4 },
    ],
    masaPembatalanDays: 14,
    refundAfterMasaPembatalanPercent: 0,
    terencanaAktif: true,
    photos: ["lokasi-taman-tropis.jpg", "tile-perpanjang.jpg"],
    adminLokasiEmail: "lokasi.hijau-asri@contoh.makam.invalid",
    adminLokasiPhone: "085100000004",
    kontakSiagaName: "Ibu Ratna",
  },
  {
    name: "Pemakaman Bukit Sejuk",
    pengelolaName: "PT Bukit Sejuk Sentosa",
    address: "Jl. Raya Puncak Km 72, Cisarua, Kabupaten Bogor",
    city: "Bogor",
    pin: { lat: -6.7176, lng: 106.9489 },
    facilities: ["musala", "parkir", "air_bersih", "akses_ambulans"],
    weekly: everyDay("06:00", "24:00"),
    biayaPemakaman: 2_000_000,
    biayaPemakamanTumpang: 1_500_000,
    jenisMakam: [
      { name: "Makam Standar", description: "Ukuran 1 × 2,5 m", tenure: { kind: "tahun", years: 15 }, hargaHakPakai: 6_000_000, hargaPerpanjangan: 3_000_000, tersedia: 30 },
    ],
    masaPembatalanDays: 14,
    refundAfterMasaPembatalanPercent: 0,
    terencanaAktif: false,
    photos: ["lokasi-blok.jpg", "lokasi-makam-wakaf.jpg"],
    adminLokasiEmail: "lokasi.bukit-sejuk@contoh.makam.invalid",
    adminLokasiPhone: "085100000005",
    kontakSiagaName: "Bapak Yusuf",
  },
];

export async function seedContohPublikCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
  /** The example Lokasi Mitra to seed; only a test passes another (a reduced copy, standing in for an older version's run). */
  contoh: ContohLokasiSpec[] = CONTOH_LOKASI,
): Promise<{ exitCode: number; output: string }> {
  let izinkanStaging: boolean;
  try {
    const args = parseArgs({
      args: argv,
      options: { "izinkan-staging": { type: "boolean" } },
      allowPositionals: false,
      strict: true,
    });
    izinkanStaging = args.values["izinkan-staging"] === true;
  } catch {
    return { exitCode: 2, output: USAGE };
  }

  const appEnv = z.enum(appEnvironments).default("development").safeParse(source.APP_ENV);
  if (!appEnv.success) {
    return { exitCode: 1, output: `Ditolak: APP_ENV tidak dikenal (${String(source.APP_ENV)}).` };
  }
  // The beta for UAT runs on staging, so this seed has to be able to run there too: the
  // allowance is named, refused by default, and every write it makes says so in the Audit
  // Log. Production is refused outright, allowance or not.
  if (appEnv.data === "production") {
    return { exitCode: 1, output: "Ditolak: seed-contoh-publik tidak pernah jalan di production." };
  }
  if (appEnv.data === "staging" && !izinkanStaging) {
    return { exitCode: 1, output: "Ditolak: di staging perlu allowance --izinkan-staging (ditolak secara bawaan)." };
  }
  if (!usesInMemoryFakes(appEnv.data) && !izinkanStaging) {
    return { exitCode: 1, output: "Ditolak: seed-contoh-publik hanya untuk development, test, atau staging dengan allowance." };
  }
  const staging = appEnv.data === "staging";
  const alasan = alasanSeed(staging);

  try {
    const env = readRuntimeEnv(source);
    const database = createDatabase(env.DATABASE_URL, { max: 2, applicationName: "makam-seed-contoh-publik" });
    try {
      const adapters = createAdapters({
        appEnv: env.APP_ENV,
        vapid: env.vapid,
        smtp: env.smtp,
        sumopod: env.sumopod,
        chromiumPath: env.CHROMIUM_PATH,
        authSecret: env.AUTH_SECRET,
        filesRoot: env.FILES_ROOT,
        appBaseUrl: env.APP_BASE_URL,
        devFilesRoot: env.DEV_FILES_ROOT,
        // See this file's header comment: every email this command sends goes to an
        // address it invented itself, never a real person's, so it never needs the
        // live SMTP relay — staging included.
        overrides: usesInMemoryFakes(env.APP_ENV) ? undefined : { email: new FakeEmailSender() },
      });
      const { audit, identity } = composeIdentity({ env, db: database.db, adapters });
      const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
      const operatorSettings = createOperatorSettings({ db: database.db, clock: adapters.clock, audit });
      const tariffs = createTariffs({ db: database.db, clock: adapters.clock, audit, lokasi });
      const inventory = createInventory({ db: database.db, clock: adapters.clock, audit, files: adapters.files, tariffs, lokasi });
      const billing = composeBilling({ env, db: database.db, adapters, operatorSettings, layanan: { db: database.db, inventory }, reportError: () => {} });
      const notifications = composeNotifications({ env, db: database.db, adapters, audit, identity, billing, reportError: () => {} });
      const modul: Modul = {
        db: database.db,
        adapters,
        identity,
        lokasi,
        tariffs,
        inventory,
        fieldwork: createFieldwork({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity, notifications, lokasi, billing }),
      };

      const admin = await adminPlatform(identity);
      if (!admin) return { exitCode: 1, output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu." };

      // Pengaturan Operator: the shared example (CS contact = the mock's), entered only when
      // empty and never overwritten, so a stack the Operator already filled in keeps its own.
      const operatorKosong = (await operatorSettings.current()) === null;
      const operator = await isiPengaturanOperatorBilaKosong(operatorSettings, admin, alasan);
      if (!operator.ok) return { exitCode: 1, output: `Ditolak: Pengaturan Operator contoh tidak tersimpan (${operator.reason}).` };

      const terdaftar = await lokasi.publicLokasiMitraList();
      const idTerdaftar = new Map(terdaftar.map((one) => [one.name, one.id]));
      const belum = contoh.filter((spec) => !idTerdaftar.has(spec.name));

      // An example Lokasi Mitra an older run already listed is reconciled, only ever adding.
      let berubah = operatorKosong ? 1 : 0;
      for (const spec of contoh) {
        const id = idTerdaftar.get(spec.name);
        if (!id) continue;
        const disamakan = await samakanDenganContoh(modul, admin, id, spec, alasan);
        if (!disamakan.ok) return { exitCode: 1, output: `Ditolak: ${spec.name} tidak bisa disamakan (${disamakan.reason}).` };
        berubah += disamakan.berubah;
      }
      if (belum.length === 0) {
        return {
          exitCode: 0,
          output:
            berubah === 0
              ? `Sudah ada ${contoh.length} Lokasi Mitra contoh di listing; seed-contoh-publik tidak mengubah apa pun.`
              : `Sudah ada ${contoh.length} Lokasi Mitra contoh di listing; ${berubah} hal disamakan dengan contoh (hanya menambah).`,
        };
      }

      const petugas = await undangPetugas(modul, admin, alasan);
      if (!petugas.ok) return { exitCode: 1, output: `Ditolak: Petugas Lapangan contoh tidak siap (${petugas.reason}).` };

      const hariIni = wibDateOf(adapters.clock.now());
      const diterbitkan: string[] = [];
      for (const spec of belum) {
        const hasil = await seedOneLokasi(modul, admin, petugas.value, hariIni, spec, alasan);
        if (!hasil.ok) return { exitCode: 1, output: `Ditolak: ${spec.name} tidak siap (${hasil.reason}).` };
        diterbitkan.push(`${spec.name} (/lokasi/${hasil.id})`);
      }
      return {
        exitCode: 0,
        output: `${diterbitkan.length} Lokasi Mitra contoh terbit (Terverifikasi): ${diterbitkan.join(", ")}.`,
      };
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

/** The one Petugas Lapangan every example Lokasi Mitra's Kunjungan Verifikasi and Cek Denah are done by (the role is not Lokasi-scoped). */
async function undangPetugas(modul: Modul, admin: Actor, alasan: string): Promise<{ ok: true; value: Actor } | Gagal> {
  return masukSebagai(modul, PETUGAS.email, () =>
    modul.identity.inviteStaff(admin, { ...PETUGAS, role: "petugas_lapangan", reason: alasan }),
  );
}

/** This example Lokasi Mitra's own Admin Lokasi (and Kontak Siaga): its first Kode Masuk login is given the mock's `kontakSiaga.nama`. */
async function undangAdminLokasi(modul: Modul, admin: Actor, lokasiId: string, spec: ContohLokasiSpec, alasan: string): Promise<{ ok: true; value: Actor } | Gagal> {
  return masukSebagai(
    modul,
    spec.adminLokasiEmail,
    () => modul.lokasi.inviteAdminLokasi(admin, lokasiId, { email: spec.adminLokasiEmail, phoneNumber: spec.adminLokasiPhone, reason: alasan }),
    spec.kontakSiagaName,
  );
}

/**
 * `count` split into chunks of at most `MAX_BLOK_DIMENSION`, the size of the
 * one-row Bloks a Jenis Makam's Tersedia Petak count is built from: every
 * cell of every one of them is cleared (never a leftover Perlu Verifikasi
 * cell anywhere in the Lokasi), which "Pemesanan Terencana aktif" needs
 * globally, not just for the Jenis Makam being built.
 */
function denahChunksFor(count: number): number[] {
  const chunks: number[] = [];
  for (let remaining = count; remaining > 0; remaining -= MAX_BLOK_DIMENSION) {
    chunks.push(Math.min(remaining, MAX_BLOK_DIMENSION));
  }
  return chunks;
}

/** A supplier of Blok names: `base` first, then `base-2`, `base-3`, ... */
function namaBerurutan(base: string): () => string {
  let n = 0;
  return () => {
    n += 1;
    return n === 1 ? base : `${base}-${n}`;
  };
}

/**
 * The Denah behind `jumlah` Tersedia units of one Jenis Makam: one or more
 * Bloks (`denahChunksFor`'s chunks, every cell cleared Tersedia), or, for a
 * mock "Kavling Keluarga N Petak" entry, `jumlah` real Kavling Keluarga units
 * instead of standalone Petak; or, for the mock's one `tersedia: 0` entry, its
 * single Petak cleared Tidak Tersedia. `nextName` gives each new Blok its name.
 */
async function bangunDenahJenisMakam(
  modul: Modul,
  adminLokasi: Actor,
  lokasiId: string,
  jenisMakamId: string,
  spec: JenisMakamSpec,
  jumlah: number,
  nextName: () => string,
  alasan: string,
): Promise<{ ok: true } | Gagal> {
  const { inventory } = modul;

  if (spec.kavlingPetak) {
    const units = Math.max(jumlah, 1);
    const blok = await inventory.createBlok(adminLokasi, lokasiId, { name: nextName(), rows: 1, cols: spec.kavlingPetak * units, jenisMakamId });
    if (!blok.ok) return { ok: false, reason: `blok: ${blok.reason}` };
    const denah = await inventory.asStaff(adminLokasi).blok(lokasiId, blok.blok.id);
    const cells = denah?.cells ?? [];
    for (let unit = 0; unit < units; unit += 1) {
      const members = cells.slice(unit * spec.kavlingPetak, (unit + 1) * spec.kavlingPetak).map((cell) => cell.id);
      const kavling = await inventory.createKavling(adminLokasi, lokasiId, blok.blok.id, { cellIds: members, jenisMakamId });
      if (!kavling.ok) return { ok: false, reason: `kavling: ${kavling.reason}` };
      const cleared = await inventory.clearKavling(adminLokasi, lokasiId, kavling.kavlingId, { mode: "tersedia" });
      if (!cleared.ok) return { ok: false, reason: `kavling tersedia: ${cleared.reason}` };
    }
    return { ok: true };
  }

  const count = spec.kosong ? 1 : Math.max(jumlah, 1);
  for (const chunkSize of denahChunksFor(count)) {
    const blok = await inventory.createBlok(adminLokasi, lokasiId, { name: nextName(), rows: 1, cols: chunkSize, jenisMakamId });
    if (!blok.ok) return { ok: false, reason: `blok: ${blok.reason}` };
    const denah = await inventory.asStaff(adminLokasi).blok(lokasiId, blok.blok.id);
    for (const cell of denah?.cells ?? []) {
      const cleared = spec.kosong
        ? await inventory.clearPetak(adminLokasi, lokasiId, cell.id, { mode: "tidak_tersedia", reason: `${alasan}: Dipesan lebih dulu (contoh data)` })
        : await inventory.clearPetak(adminLokasi, lokasiId, cell.id, { mode: "tersedia" });
      if (!cleared.ok) return { ok: false, reason: `petak: ${cleared.reason}` };
    }
  }
  return { ok: true };
}

/**
 * Brings an already-listed example Lokasi Mitra (seeded by an older version of
 * this command) up to the mock, only ever adding: the Tersedia Petak / Kavling
 * units it is short of (new Bloks, cleared Tersedia; nothing existing is
 * touched, removed or re-cleared, and the mock's one `tersedia: 0` entry is
 * left alone), and its Kontak Siaga's name when the Akun still has none (a
 * Kode Masuk login fills it, never replacing one). Returns how many things it
 * changed; 0 changes nothing, not even a login.
 */
async function samakanDenganContoh(modul: Modul, admin: Actor, lokasiId: string, spec: ContohLokasiSpec, alasan: string): Promise<{ ok: true; berubah: number } | Gagal> {
  const { tariffs, inventory, lokasi, adapters } = modul;
  const [{ jenisMakam }, tersedia, kontak] = await Promise.all([
    tariffs.asStaff(admin).lokasiTariffs(lokasiId, adapters.clock.now()),
    inventory.tersediaPerJenisMakam(lokasiId),
    lokasi.kontakSiagaOf(lokasiId),
  ]);
  const countById = new Map(tersedia.map((row) => [row.jenisMakamId, row.count]));
  const kurang: { jm: JenisMakamSpec; id: string; jumlah: number }[] = [];
  for (const jm of spec.jenisMakam) {
    if (jm.kosong) continue;
    const found = jenisMakam.find((one) => one.name === jm.name);
    if (!found) continue;
    const jumlah = jm.tersedia - (countById.get(found.id) ?? 0);
    if (jumlah > 0) kurang.push({ jm, id: found.id, jumlah });
  }
  const perluNama = kontak !== null && kontak.name === "";
  if (kurang.length === 0 && !perluNama) return { ok: true, berubah: 0 };

  const adminLokasi = await masukDenganKodeMasuk(modul, spec.adminLokasiEmail, spec.kontakSiagaName);
  if (!adminLokasi.ok) return { ok: false, reason: `admin lokasi: ${adminLokasi.reason}` };

  const dipakai = new Set((await inventory.asStaff(admin).bloks(lokasiId)).map((blok) => blok.name));
  let k = 0;
  const nextName = () => {
    do k += 1;
    while (dipakai.has(`Tambahan-${k}`));
    dipakai.add(`Tambahan-${k}`);
    return `Tambahan-${k}`;
  };
  for (const { jm, id, jumlah } of kurang) {
    const built = await bangunDenahJenisMakam(modul, adminLokasi.value, lokasiId, id, jm, jumlah, nextName, alasan);
    if (!built.ok) return { ok: false, reason: `denah ${jm.name}: ${built.reason}` };
  }
  return { ok: true, berubah: kurang.length + (perluNama ? 1 : 0) };
}

/** One example Lokasi Mitra, taken all the way to Terverifikasi (and, where the mock has it, Terencana aktif). */
async function seedOneLokasi(modul: Modul, admin: Actor, petugas: Actor, hariIni: string, spec: ContohLokasiSpec, alasan: string): Promise<{ ok: true; id: string } | Gagal> {
  const { lokasi, tariffs, fieldwork, inventory } = modul;

  const dibuat = await lokasi.createLokasiMitra(admin, { name: spec.name, pengelolaName: spec.pengelolaName, address: spec.address, city: spec.city });
  if (!dibuat.ok) return { ok: false, reason: `lokasi: ${dibuat.reason}` };
  const lokasiId = dibuat.lokasiMitra.id;

  const adminLokasi = await undangAdminLokasi(modul, admin, lokasiId, spec, alasan);
  if (!adminLokasi.ok) return { ok: false, reason: `admin lokasi: ${adminLokasi.reason}` };

  const agreement = await lokasi.uploadAgreement(admin, lokasiId, { scan: { body: scanPerjanjian, contentType: "application/pdf" }, signedOn: hariIni });
  if (!agreement.ok) return { ok: false, reason: `perjanjian: ${agreement.reason}` };
  const jam = await lokasi.setJamOperasional(admin, lokasiId, { weekly: spec.weekly, tanggalTutup: [] });
  if (!jam.ok) return { ok: false, reason: `jam operasional: ${jam.reason}` };
  const kontak = await lokasi.pickKontakSiaga(admin, lokasiId, { accountId: adminLokasi.value.accountId });
  if (!kontak.ok) return { ok: false, reason: `kontak siaga: ${kontak.reason}` };

  const tugasKunjungan = await fieldwork.createTugasLapangan(admin, {
    type: "kunjungan_verifikasi",
    subject: "Kunjungan Verifikasi",
    lokasiId,
    address: spec.address,
    pin: spec.pin,
    plannedDate: hariIni,
    assigneeAccountId: petugas.accountId,
  });
  if (!tugasKunjungan.ok) return { ok: false, reason: `tugas kunjungan verifikasi: ${tugasKunjungan.reason}` };
  const kunjungan = await fieldwork.completeTugasLapangan(petugas, tugasKunjungan.tugasLapangan.id, {
    form: { addressConfirmed: true, pin: spec.pin, facilities: { checked: spec.facilities, note: "" }, note: "Sesuai (contoh data)" },
    uploads: spec.photos.map((file) => ({ kind: "foto_lokasi" as const, file: { body: fixture(file), contentType: "image/jpeg" as const } })),
  });
  if (!kunjungan.ok) return { ok: false, reason: `kunjungan verifikasi: ${kunjungan.reason}` };

  const jenisMakamIds: string[] = [];
  for (const jm of spec.jenisMakam) {
    const created = await tariffs.createJenisMakam(admin, lokasiId, {
      name: jm.name,
      description: jm.description,
      tariff: { hargaHakPakai: jm.hargaHakPakai, tenure: jm.tenure, hargaPerpanjangan: jm.hargaPerpanjangan, effectiveOn: hariIni },
      reason: alasan,
    });
    if (!created.ok) return { ok: false, reason: `jenis makam ${jm.name}: ${created.reason}` };
    jenisMakamIds.push(created.jenisMakam.id);

    if (jm.hargaBaru) {
      const scheduled = await tariffs.setJenisMakamTariff(admin, created.jenisMakam.id, {
        hargaHakPakai: jm.hargaBaru.hargaHakPakai,
        tenure: jm.tenure,
        hargaPerpanjangan: jm.hargaPerpanjangan,
        effectiveOn: jm.hargaBaru.effectiveOn,
        reason: alasan,
      });
      if (!scheduled.ok) return { ok: false, reason: `harga baru ${jm.name}: ${JSON.stringify(scheduled)}` };
    }
  }
  const pemakaman = await tariffs.setBiayaPemakaman(admin, lokasiId, {
    biayaPemakaman: spec.biayaPemakaman,
    biayaPemakamanTumpang: spec.biayaPemakamanTumpang,
    effectiveOn: hariIni,
    reason: alasan,
  });
  if (!pemakaman.ok) return { ok: false, reason: `biaya pemakaman: ${pemakaman.reason}` };

  // The platform fee is the Operator's own, shared by every Lokasi Mitra: set once
  // (by this command or another seed) and reused, never given a second version.
  const platformSudahAda = await tariffs.globalTariff("biaya_layanan_platform", modul.adapters.clock.now());
  if (!platformSudahAda) {
    const platform = await tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: BIAYA_LAYANAN_PLATFORM, effectiveOn: hariIni, reason: alasan });
    if (!platform.ok) return { ok: false, reason: `biaya layanan platform: ${platform.reason}` };
  }

  const checked = await tariffs.markTariffsChecked(admin, lokasiId, { reason: alasan });
  if (!checked.ok) return { ok: false, reason: `tarif diperiksa: ${JSON.stringify(checked)}` };
  const fakta = await tariffs.asStaff(admin).tariffsChecked(lokasiId);
  const published = await lokasi.publish(admin, lokasiId, { tariffsChecked: fakta && { changedSinceCheck: fakta.changedSinceCheck } });
  if (!published.ok) return { ok: false, reason: `publish: ${JSON.stringify(published)}` };

  const checklist = await lokasi.setDocumentChecklist(admin, lokasiId, { documentChecklist: DOKUMEN });
  if (!checklist.ok) return { ok: false, reason: `dokumen: ${checklist.reason}` };

  const flags: LokasiFlags = { ...DEFAULT_FLAGS, tumpang: { allowed: true, minYears: 3, maxLayers: 2 }, tumpangOnReleasedPlots: true };
  const policies: LokasiPolicies = {
    ...DEFAULT_POLICIES,
    masaPembatalanDays: spec.masaPembatalanDays,
    refundAfterMasaPembatalanPercent: spec.refundAfterMasaPembatalanPercent,
  };
  const kebijakan = await lokasi.setPoliciesAndFlags(admin, lokasiId, { policies, flags });
  if (!kebijakan.ok) return { ok: false, reason: `kebijakan: ${kebijakan.reason}` };

  for (const [index, jm] of spec.jenisMakam.entries()) {
    const built = await bangunDenahJenisMakam(modul, adminLokasi.value, lokasiId, jenisMakamIds[index], jm, jm.kosong ? 1 : jm.tersedia, namaBerurutan(String.fromCharCode(65 + index)), alasan);
    if (!built.ok) return { ok: false, reason: `denah ${jm.name}: ${built.reason}` };
  }

  if (spec.terencanaAktif) {
    const tugasCekDenah = await fieldwork.createTugasLapangan(admin, {
      type: "cek_denah",
      subject: "Cek Denah",
      lokasiId,
      address: spec.address,
      pin: spec.pin,
      plannedDate: hariIni,
      assigneeAccountId: petugas.accountId,
    });
    if (!tugasCekDenah.ok) return { ok: false, reason: `tugas cek denah: ${tugasCekDenah.reason}` };
    const cekDenah = await fieldwork.completeTugasLapangan(petugas, tugasCekDenah.tugasLapangan.id, {
      form: { sesuaiDenah: true, note: "Sesuai Denah (contoh data)" },
      uploads: [{ kind: "foto_denah", file: { body: fixture(spec.photos[0]), contentType: "image/jpeg" } }],
    });
    if (!cekDenah.ok) return { ok: false, reason: `cek denah: ${cekDenah.reason}` };
    const perluVerifikasi = await inventory.hasPetakPerluVerifikasi(lokasiId);
    const switched = await lokasi.activateTerencana(admin, lokasiId, { hasPetakPerluVerifikasi: perluVerifikasi });
    if (!switched.ok) return { ok: false, reason: `terencana: ${JSON.stringify(switched)}` };
  }

  return { ok: true, id: lokasiId };
}

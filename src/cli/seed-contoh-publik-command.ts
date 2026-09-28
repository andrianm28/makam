/**
 * `npx tsx src/cli/seed-contoh-publik.ts` (dev) or, in a local stack's image,
 * `node dist/seed-contoh-publik.mjs`: gives a development or test stack the
 * five example Lokasi Mitra of the public-site prototype
 * (`origin/prototype-public-site`'s `_mock/data.ts`), each taken all the way
 * to Terverifikasi through the real publish gate — a priced Jenis Makam per
 * mock entry, cleared Tersedia Petak, Jam Operasional, a Kontak Siaga, real
 * JPEG Kunjungan Verifikasi photos and, where the mock has `terencanaAktif`,
 * "Pemesanan Terencana aktif" switched on through its own gate (Cek Denah,
 * every Petak cleared). It changes nothing once every one of the five is
 * already listed. Refused on staging and production. Exit 0 seeded or
 * already there, 1 refused or failed, 2 usage.
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
 * - `kontakSiaga.nama` ("Bapak Hendra") has no real counterpart either: the
 *   Kontak Siaga is a real Admin Lokasi Akun, and an Akun's `name` starts
 *   empty until its own holder sets it (Akun Saya profile), which is not
 *   something a seed CLI does on someone else's behalf. Its phone number is
 *   real (the invited Admin Lokasi's own).
 * - A "Kavling Keluarga N Petak" mock entry becomes a real Kavling Keluarga
 *   (Inventory's `createKavling` + `clearKavling`), but only one unit each
 *   (the mock's own `tersedia` count, 1–2, is already small); every other
 *   Jenis Makam's Tersedia Petak count is capped at 3 cleared units even
 *   where the mock's is much larger (9–118), so the Denah this seeds stays
 *   small. The one Jenis Makam the mock lists with `tersedia: 0` (Hijau
 *   Asri's "Makam Taman") is reproduced with its one Petak cleared Tidak
 *   Tersedia, which is what a real zero-availability Jenis Makam looks like.
 * - The mock's facilities are mapped onto the Kunjungan Verifikasi checklist
 *   1:1 (mushola→musala, akses-mobil→akses_ambulans, keamanan→pos_jaga,
 *   pendopo→tempat_duduk, air→air_bersih, parkir and toilet unchanged); every
 *   mock facility has a real counterpart, so none is dropped.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { FakeEmailSender } from "@/adapters/memory";
import { composeBilling } from "@/composition/billing";
import { composeIdentity } from "@/composition/identity";
import { composeNotifications } from "@/composition/notifications";
import { createAdapters } from "@/composition/adapters";
import { createDatabase, type Database } from "@/db/client";
import { createFieldwork, type Fieldwork } from "@/domain/fieldwork";
import type { Actor, Identity } from "@/domain/identity";
import { createInventory, type Inventory } from "@/domain/inventory";
import {
  createLokasi,
  DEFAULT_FLAGS,
  DEFAULT_POLICIES,
  type Lokasi,
  type LokasiFacility,
  type LokasiFlags,
  type LokasiPolicies,
} from "@/domain/lokasi";
import type { JamOperasional } from "@/domain/lokasi/jam-operasional-schema";
import { createOperatorSettings } from "@/domain/operator-settings";
import { createTariffs, type Tariffs } from "@/domain/tariffs";
import { appEnvironments, readRuntimeEnv, usesInMemoryFakes } from "@/lib/env";
import { wibDateOf } from "@/lib/time/jakarta";
import type { Adapters } from "@/ports";
import { cliFailure } from "./cli-failure";

const USAGE = "Pakai: seed-contoh-publik";

/** The Operator's flat platform fee (spec: Biaya Layanan Platform), as the prototype's mock has it. */
const BIAYA_LAYANAN_PLATFORM = 250_000;

/** The prototype's DOKUMEN list (spec, document checklist), the same four for every example Lokasi Mitra. */
const DOKUMEN = [
  "KTP Almarhum (atau fotokopinya)",
  "Surat keterangan kematian dari rumah sakit atau kelurahan",
  "Kartu Keluarga",
  "KTP Pemegang Hak",
];

const PETUGAS = { email: "petugas.contoh-publik@contoh.id", phoneNumber: "085299999999" };

const scanPerjanjian = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);

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
interface JenisMakamSpec {
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
}

interface ContohLokasiSpec {
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
}

/** The prototype's five example Lokasi Mitra (`_mock/data.ts` on `origin/prototype-public-site`), as close to the mock as the real domain allows. */
const CONTOH_LOKASI: ContohLokasiSpec[] = [
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
      { name: "Makam Standar", description: "Ukuran 1 × 2,5 m", tenure: { kind: "tahun", years: 20 }, hargaHakPakai: 8_500_000, hargaPerpanjangan: 4_000_000, tersedia: 3 },
      { name: "Makam Taman", description: "Ukuran 1,5 × 3 m, tepi jalan setapak", tenure: { kind: "tahun", years: 20 }, hargaHakPakai: 14_000_000, hargaPerpanjangan: 6_500_000, tersedia: 3 },
      { name: "Makam Selamanya", description: "Ukuran 1,5 × 3 m", tenure: { kind: "selamanya" }, hargaHakPakai: 32_000_000, hargaPerpanjangan: null, tersedia: 3 },
    ],
    masaPembatalanDays: 14,
    refundAfterMasaPembatalanPercent: 70,
    terencanaAktif: false,
    photos: ["lokasi-jalan-taman.jpg", "lokasi-pendopo.jpg"],
    adminLokasiEmail: "lokasi.firdaus@contoh.id",
    adminLokasiPhone: "085100000001",
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
      { name: "Makam Umum", description: "Ukuran 1 × 2 m", tenure: { kind: "selamanya" }, hargaHakPakai: 3_000_000, hargaPerpanjangan: null, tersedia: 3 },
      { name: "Kavling Keluarga 2 Petak", description: "2 petak bersebelahan", tenure: { kind: "selamanya" }, hargaHakPakai: 6_500_000, hargaPerpanjangan: null, tersedia: 1, kavlingPetak: 2 },
    ],
    masaPembatalanDays: 7,
    refundAfterMasaPembatalanPercent: 50,
    terencanaAktif: true,
    photos: ["lokasi-makam-wakaf.jpg", "lokasi-blok.jpg"],
    adminLokasiEmail: "lokasi.wakaf-al-ikhlas@contoh.id",
    adminLokasiPhone: "085100000002",
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
      { name: "Makam Umum", description: "Ukuran 1 × 2 m", tenure: { kind: "tahun", years: 10 }, hargaHakPakai: 2_500_000, hargaPerpanjangan: 1_500_000, tersedia: 3 },
    ],
    masaPembatalanDays: 7,
    refundAfterMasaPembatalanPercent: 0,
    terencanaAktif: false,
    photos: ["lokasi-pendopo.jpg", "lokasi-jalan-taman.jpg"],
    adminLokasiEmail: "lokasi.nurul-huda@contoh.id",
    adminLokasiPhone: "085100000003",
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
      { name: "Makam Standar", description: "Ukuran 1,2 × 2,5 m", tenure: { kind: "tahun", years: 25 }, hargaHakPakai: 11_000_000, hargaPerpanjangan: 5_000_000, tersedia: 3 },
      { name: "Makam Taman", description: "Ukuran 2 × 3 m, dengan pagar rendah", tenure: { kind: "tahun", years: 25 }, hargaHakPakai: 22_500_000, hargaPerpanjangan: 9_000_000, tersedia: 0, kosong: true },
      { name: "Kavling Keluarga 4 Petak", description: "2 × 2 petak bersebelahan", tenure: { kind: "tahun", years: 25 }, hargaHakPakai: 40_000_000, hargaPerpanjangan: 18_000_000, tersedia: 1, kavlingPetak: 4 },
    ],
    masaPembatalanDays: 14,
    refundAfterMasaPembatalanPercent: 0,
    terencanaAktif: true,
    photos: ["lokasi-taman-tropis.jpg", "tile-perpanjang.jpg"],
    adminLokasiEmail: "lokasi.hijau-asri@contoh.id",
    adminLokasiPhone: "085100000004",
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
      { name: "Makam Standar", description: "Ukuran 1 × 2,5 m", tenure: { kind: "tahun", years: 15 }, hargaHakPakai: 6_000_000, hargaPerpanjangan: 3_000_000, tersedia: 3 },
    ],
    masaPembatalanDays: 14,
    refundAfterMasaPembatalanPercent: 0,
    terencanaAktif: false,
    photos: ["lokasi-blok.jpg", "lokasi-makam-wakaf.jpg"],
    adminLokasiEmail: "lokasi.bukit-sejuk@contoh.id",
    adminLokasiPhone: "085100000005",
  },
];

/** The modules this command drives, each through its own public functions. */
interface Modul {
  db: Database;
  adapters: Adapters;
  identity: Identity;
  lokasi: Lokasi;
  tariffs: Tariffs;
  inventory: Inventory;
  fieldwork: Fieldwork;
}

type Gagal = { ok: false; reason: string };

export async function seedContohPublikCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; output: string }> {
  if (argv.length > 0) return { exitCode: 2, output: USAGE };
  const appEnv = z.enum(appEnvironments).default("development").safeParse(source.APP_ENV);
  if (!appEnv.success || !usesInMemoryFakes(appEnv.data)) {
    return { exitCode: 1, output: "Ditolak: seed-contoh-publik hanya untuk development dan test." };
  }

  try {
    const env = readRuntimeEnv(source);
    const database = createDatabase(env.DATABASE_URL, { max: 2, applicationName: "makam-seed-contoh-publik" });
    try {
      const adapters = createAdapters({ appEnv: env.APP_ENV, vapid: env.vapid, devFilesRoot: env.DEV_FILES_ROOT });
      const { audit, identity } = composeIdentity({ env, db: database.db, adapters });
      const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
      const operatorSettings = createOperatorSettings({ db: database.db, clock: adapters.clock, audit });
      const tariffs = createTariffs({ db: database.db, clock: adapters.clock, audit, lokasi });
      const billing = composeBilling({ env, db: database.db, adapters, operatorSettings, reportError: () => {} });
      const notifications = composeNotifications({ env, db: database.db, adapters, audit, identity, billing, reportError: () => {} });
      const modul: Modul = {
        db: database.db,
        adapters,
        identity,
        lokasi,
        tariffs,
        inventory: createInventory({ db: database.db, clock: adapters.clock, audit, files: adapters.files, tariffs, lokasi }),
        fieldwork: createFieldwork({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity, notifications, lokasi, billing }),
      };

      const admin = await adminPlatform(identity);
      if (!admin) return { exitCode: 1, output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu." };

      const terdaftar = await lokasi.publicLokasiMitraList();
      const namaTerdaftar = new Set(terdaftar.map((one) => one.name));
      const belum = CONTOH_LOKASI.filter((spec) => !namaTerdaftar.has(spec.name));
      if (belum.length === 0) {
        return {
          exitCode: 0,
          output: `Sudah ada ${CONTOH_LOKASI.length} Lokasi Mitra contoh di listing; seed-contoh-publik tidak mengubah apa pun.`,
        };
      }

      const petugas = await undangPetugas(modul, admin);
      if (!petugas.ok) return { exitCode: 1, output: `Ditolak: Petugas Lapangan contoh tidak siap (${petugas.reason}).` };

      const hariIni = wibDateOf(adapters.clock.now());
      const diterbitkan: string[] = [];
      for (const spec of belum) {
        const hasil = await seedOneLokasi(modul, admin, petugas.value, hariIni, spec);
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

/**
 * The stack's first Admin Platform (seeded by seed:admin) as a local developer
 * with the stack's shell could act. Never on staging or production: the command
 * above refuses those before this is reached.
 */
async function adminPlatform(identity: Identity): Promise<Actor | null> {
  const admin = (await identity.staffAccounts()).find((account) => account.roles.includes("admin_platform") && !account.deactivated);
  if (!admin) return null;
  return {
    accountId: admin.accountId,
    email: admin.email ?? "",
    phoneNumber: admin.phoneNumber,
    roles: ["admin_platform"],
    lokasiIds: [],
    totp: "lolos",
    sessionId: `seed-contoh-publik-${admin.accountId}`,
  };
}

/** A fresh benchmarking IP per Kode Masuk request: the per-IP limit allows one per 60 s, and this command sends several in a row. */
function benchmarkingIp(): string {
  return `198.18.1.${1 + Math.floor(Math.random() * 250)}`;
}

async function masukDenganKodeMasuk(modul: Modul, email: string): Promise<{ ok: true; value: Actor } | Gagal> {
  const { identity, adapters } = modul;
  const sent = await identity.requestKodeMasuk({ email, ip: benchmarkingIp() });
  if (!sent.ok) return { ok: false, reason: sent.reason };
  const code = (adapters.email as FakeEmailSender).sent
    .filter((message) => message.to === sent.email)
    .at(-1)
    ?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) return { ok: false, reason: "kode_tidak_terkirim" };
  const login = await identity.verifyKodeMasuk({ email, code });
  if (!login.ok) return { ok: false, reason: login.reason };
  const cookies = login.session.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const actor = await identity.actorFromCookies(cookies);
  return actor ? { ok: true, value: actor } : { ok: false, reason: "belum_masuk" };
}

/** The one Petugas Lapangan every example Lokasi Mitra's Kunjungan Verifikasi and Cek Denah are done by (the role is not Lokasi-scoped). */
async function undangPetugas(modul: Modul, admin: Actor): Promise<{ ok: true; value: Actor } | Gagal> {
  const invited = await modul.identity.inviteStaff(admin, { ...PETUGAS, role: "petugas_lapangan" });
  if (!invited.ok) return { ok: false, reason: invited.reason };
  return masukDenganKodeMasuk(modul, PETUGAS.email);
}

/** This example Lokasi Mitra's own Admin Lokasi (and Kontak Siaga). */
async function undangAdminLokasi(modul: Modul, admin: Actor, lokasiId: string, spec: ContohLokasiSpec): Promise<{ ok: true; value: Actor } | Gagal> {
  const invited = await modul.lokasi.inviteAdminLokasi(admin, lokasiId, { email: spec.adminLokasiEmail, phoneNumber: spec.adminLokasiPhone });
  if (!invited.ok) return { ok: false, reason: invited.reason };
  return masukDenganKodeMasuk(modul, spec.adminLokasiEmail);
}

/**
 * The Denah behind one Jenis Makam's Tersedia Petak count: its own Blok (one
 * row, one cell per unit), cleared Tersedia — or, for a mock "Kavling
 * Keluarga N Petak" entry, grouped into real Kavling Keluarga units instead of
 * standalone Petak; or, for the mock's one `tersedia: 0` entry, its single
 * Petak cleared Tidak Tersedia.
 */
async function bangunDenahJenisMakam(
  modul: Modul,
  adminLokasi: Actor,
  lokasiId: string,
  blokIndex: number,
  jenisMakamId: string,
  spec: JenisMakamSpec,
): Promise<{ ok: true } | Gagal> {
  const { inventory } = modul;
  const blokName = String.fromCharCode(65 + blokIndex);

  if (spec.kavlingPetak) {
    const units = Math.max(spec.tersedia, 1);
    const blok = await inventory.createBlok(adminLokasi, lokasiId, { name: blokName, rows: 1, cols: spec.kavlingPetak * units, jenisMakamId });
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

  const count = spec.kosong ? 1 : Math.max(spec.tersedia, 1);
  const blok = await inventory.createBlok(adminLokasi, lokasiId, { name: blokName, rows: 1, cols: count, jenisMakamId });
  if (!blok.ok) return { ok: false, reason: `blok: ${blok.reason}` };
  const denah = await inventory.asStaff(adminLokasi).blok(lokasiId, blok.blok.id);
  for (const cell of denah?.cells ?? []) {
    const cleared = spec.kosong
      ? await inventory.clearPetak(adminLokasi, lokasiId, cell.id, { mode: "tidak_tersedia", reason: "Dipesan lebih dulu (contoh data)" })
      : await inventory.clearPetak(adminLokasi, lokasiId, cell.id, { mode: "tersedia" });
    if (!cleared.ok) return { ok: false, reason: `petak: ${cleared.reason}` };
  }
  return { ok: true };
}

/** One example Lokasi Mitra, taken all the way to Terverifikasi (and, where the mock has it, Terencana aktif). */
async function seedOneLokasi(modul: Modul, admin: Actor, petugas: Actor, hariIni: string, spec: ContohLokasiSpec): Promise<{ ok: true; id: string } | Gagal> {
  const { lokasi, tariffs, fieldwork, inventory } = modul;

  const dibuat = await lokasi.createLokasiMitra(admin, { name: spec.name, pengelolaName: spec.pengelolaName, address: spec.address, city: spec.city });
  if (!dibuat.ok) return { ok: false, reason: `lokasi: ${dibuat.reason}` };
  const lokasiId = dibuat.lokasiMitra.id;

  const adminLokasi = await undangAdminLokasi(modul, admin, lokasiId, spec);
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
      reason: null,
    });
    if (!created.ok) return { ok: false, reason: `jenis makam ${jm.name}: ${created.reason}` };
    jenisMakamIds.push(created.jenisMakam.id);
  }
  const pemakaman = await tariffs.setBiayaPemakaman(admin, lokasiId, {
    biayaPemakaman: spec.biayaPemakaman,
    biayaPemakamanTumpang: spec.biayaPemakamanTumpang,
    effectiveOn: hariIni,
    reason: null,
  });
  if (!pemakaman.ok) return { ok: false, reason: `biaya pemakaman: ${pemakaman.reason}` };

  // The platform fee is the Operator's own, shared by every Lokasi Mitra: set once
  // (by this command or another seed) and reused, never given a second version.
  const platformSudahAda = await tariffs.globalTariff("biaya_layanan_platform", modul.adapters.clock.now());
  if (!platformSudahAda) {
    const platform = await tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: BIAYA_LAYANAN_PLATFORM, effectiveOn: hariIni, reason: null });
    if (!platform.ok) return { ok: false, reason: `biaya layanan platform: ${platform.reason}` };
  }

  const checked = await tariffs.markTariffsChecked(admin, lokasiId, { reason: null });
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
    const built = await bangunDenahJenisMakam(modul, adminLokasi.value, lokasiId, index, jenisMakamIds[index], jm);
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

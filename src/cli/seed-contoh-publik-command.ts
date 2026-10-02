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
 * with the mock: its older single-row Bloks that are empty of history are
 * removed, then it only adds (the prototype Bloks, the Tersedia Petak / Kavling
 * units it is short of, a Jenis Makam price that differs as a new tariff
 * version effective today, and the Kontak Siaga's name while empty); once
 * nothing is short it changes nothing. Development and test always; staging — the environment the
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
 *   Masuk login (`identity.verifyKodeMasuk`'s existing optional `name`), or
 *   through `identity.nameAccountForSeed` when reconciling an Akun that
 *   already holds the role (no second Kode Masuk to re-send). Its
 *   phone number is real (the invited Admin Lokasi's own).
 * - Every Jenis Makam's Tersedia count IS reproduced 1:1 with the mock's own
 *   `tersedia` (9-118 for most, down to the mock's small Kavling Keluarga
 *   counts), and the Denah now reads like the prototype's. For the two Lokasi
 *   with a prototype Denah (`_mock/denah.ts`: Wakaf Al-Ikhlas, Hijau Asri) its
 *   Bloks are built FIRST and EXACTLY: same names ("Blok Utama", "Blok A",
 *   "Blok B", "Blok Melati"), grid sizes, Jalan and Bukan Petak cells, Kavling
 *   Keluarga rectangles (with the mock's Nomor Kavling), per-cell statuses and
 *   Petak numbering (`A-01` ..., Petak only, in reading order). Further tidy
 *   rectangular Bloks ("Blok C", ...: 10 columns, a Jalan row after every 4
 *   Petak rows, the last row padded with Bukan Petak, at most 100 Petak each,
 *   never a single 40-cell row) then top each Jenis Makam up to the mock's
 *   count; the three Lokasi with no prototype Denah get only those. All of it
 *   goes through Inventory's public functions (createBlok, setCellKind,
 *   renumberCells, createKavling, clearPetak, clearKavling), and no Perlu
 *   Verifikasi cell is left anywhere, which "Pemesanan Terencana aktif" needs.
 *   A "Kavling Keluarga N Petak" entry is real Kavling Keluarga units. The one
 *   Jenis Makam listed with `tersedia: 0` (Hijau Asri's "Makam Taman") is the
 *   prototype's "Blok Melati" (its `premium`), which holds only non-Tersedia
 *   cells; with no prototype Blok using it, it would be one Tidak Tersedia Petak.
 * - Prototype cell statuses that come from real facts have no honest path
 *   here, so they are approximated, never faked with a backdoor order or burial:
 *   T (Tersedia) and X (Tidak Tersedia) are reproduced exactly. I (Terisi) and
 *   U (Terisi, tumpang only) become Terisi through Inventory's own "already
 *   occupied" clearing (Hak Pakai with "data menyusul", no Pemegang Hak, no
 *   Pemakaman); U and I cannot differ, because whether a Terisi plot may take a
 *   tumpang is derived from its burials, so every Terisi Petak here is offered
 *   as tumpang-only where the Lokasi allows tumpang. D (Dipesan) needs a held
 *   order and a Kavling Dipesan has no manual state at all: a D Petak becomes
 *   Tidak Tersedia with a reason saying it is an example, and a Dipesan Kavling
 *   becomes Terisi ("data menyusul"); both are simply not pickable, as Dipesan is
 *   (until the picker reads a Kavling's own Hak Pakai, `picker.ts` shows an
 *   occupied Kavling as pickable although Inventory's availability counts do not count it.)
 * - Re-run on a stack an older version seeded (Bloks of single-row chunks named
 *   "A", "A-2", ..., "Tambahan-1", ...): each such Blok is removed through
 *   Inventory's `hapusBlok`, but only one that is empty of history (every Petak
 *   only ever Tersedia or Tidak Tersedia, none held); one that has a Terisi Petak,
 *   a Hak Pakai or a hold is left as it is. The prototype Bloks (matched by
 *   name, so once) and the tidy top-up Bloks are then built, so the stack ends
 *   with the prototype layout and the mock's counts. A Petak number an
 *   untouched old Blok still uses (`A-01`) makes the prototype Blok take the
 *   next free prefix (`A2-01`), since Nomor Makam is unique per Lokasi.
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
import { createInventory } from "@/domain/inventory";
import { pernahMenyebutPetakAtauKavling } from "@/domain/pemesanan";
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
import type { Clock } from "@/ports/clock";
import { cliFailure } from "./cli-failure";
import {
  adminPlatform,
  BIAYA_LAYANAN_PLATFORM_CONTOH,
  isiPengaturanOperatorBilaKosong,
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

/**
 * One Blok of the prototype's Denah (`_mock/denah.ts`), a grid of characters:
 * T Tersedia, D Dipesan, I Terisi, U Terisi (tumpang only), X Tidak Tersedia,
 * K part of a Kavling Keluarga, . Jalan, # Bukan Petak.
 */
export interface BlokPrototipe {
  nama: string;
  /** The Nomor Makam prefix: `A` gives `A-01`, `A-02`, ... over the Petak, in reading order. */
  prefix: string;
  /** The name of the Jenis Makam of this Blok's Petak (one of the Lokasi's `jenisMakam`). */
  jenisMakam: string;
  rows: string[];
  kavling?: KavlingPrototipe[];
}

export interface KavlingPrototipe {
  nomor: string;
  r: number;
  c: number;
  h: number;
  w: number;
  status: "Tersedia" | "Dipesan";
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
  /** The prototype's own Denah for this Lokasi (only the two with Terencana on have one), built exactly before any tidy top-up Blok. */
  denahPrototipe?: BlokPrototipe[];
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
    denahPrototipe: [
      {
        nama: "Blok Utama",
        prefix: "U",
        jenisMakam: "Makam Umum",
        rows: ["IIIIII.IIII", "IIDIII.ITTT", "...........", "TTTTTT.KKKK", "TTTTTT.KKKK"],
        kavling: [
          { nomor: "KK-U1", r: 3, c: 7, h: 1, w: 2, status: "Tersedia" },
          { nomor: "KK-U2", r: 3, c: 9, h: 1, w: 2, status: "Dipesan" },
          { nomor: "KK-U3", r: 4, c: 7, h: 1, w: 2, status: "Tersedia" },
          { nomor: "KK-U4", r: 4, c: 9, h: 1, w: 2, status: "Dipesan" },
        ],
      },
    ],
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
    denahPrototipe: [
      {
        nama: "Blok A",
        prefix: "A",
        jenisMakam: "Makam Standar",
        rows: ["IIIU.IIDTTTTX", "IIII.ITTTTTTT", ".............", "TTDD.TTTTTT##", "TTTT.TTTTIID#", ".............", "KKKK.TTTT####", "KKKK.TTTT####"],
        kavling: [
          { nomor: "KK-A1", r: 6, c: 0, h: 2, w: 2, status: "Tersedia" },
          { nomor: "KK-A2", r: 6, c: 2, h: 2, w: 2, status: "Dipesan" },
        ],
      },
      { nama: "Blok B", prefix: "B", jenisMakam: "Makam Standar", rows: ["TTTT.##TTT", "TTIT.##TIT", "..........", "TTTTTT.TTT", "TDTTTT.TTX"] },
      // The prototype's `premium` Blok: no Tersedia cell, so it sits on the mock's `tersedia: 0` Jenis Makam.
      { nama: "Blok Melati", prefix: "M", jenisMakam: "Makam Taman", rows: ["IIDI.IID", "IXII.DII", "####.III", "####.IIX"] },
    ],
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

type Hasil = { exitCode: number; output: string };

/** What the command's arguments and `APP_ENV` allow: the alasan its Audit Log entries carry, or the refusal to print. */
function bacaIzin(argv: string[], source: Record<string, string | undefined>): { alasan: string } | { tolak: Hasil } {
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
    return { tolak: { exitCode: 2, output: USAGE } };
  }

  const appEnv = z.enum(appEnvironments).default("development").safeParse(source.APP_ENV);
  if (!appEnv.success) {
    return { tolak: { exitCode: 1, output: `Ditolak: APP_ENV tidak dikenal (${String(source.APP_ENV)}).` } };
  }
  // The beta for UAT runs on staging, so this seed has to be able to run there too: the
  // allowance is named, refused by default, and every write it makes says so in the Audit
  // Log. Production is refused outright, allowance or not.
  if (appEnv.data === "production") {
    return { tolak: { exitCode: 1, output: "Ditolak: seed-contoh-publik tidak pernah jalan di production." } };
  }
  if (appEnv.data === "staging" && !izinkanStaging) {
    return { tolak: { exitCode: 1, output: "Ditolak: di staging perlu allowance --izinkan-staging (ditolak secara bawaan)." } };
  }
  if (!usesInMemoryFakes(appEnv.data) && !izinkanStaging) {
    return { tolak: { exitCode: 1, output: "Ditolak: seed-contoh-publik hanya untuk development, test, atau staging dengan allowance." } };
  }
  return { alasan: alasanSeed(appEnv.data === "staging") };
}

/** The modules this command drives, on one database connection, composed from the adapters of this stack. */
function susunModul(env: ReturnType<typeof readRuntimeEnv>, database: ReturnType<typeof createDatabase>, clock?: Clock) {
  const overrides = {
    // See this file's header comment: every email this command sends goes to an
    // address it invented itself, never a real person's, so it never needs the
    // live SMTP relay, staging included.
    ...(usesInMemoryFakes(env.APP_ENV) ? {} : { email: new FakeEmailSender() }),
    // A test injects the same Clock it reads back through, so a version entered
    // "today" is in force at the instant the test asks about (ticket 100).
    ...(clock ? { clock } : {}),
  };
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
    overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
  });
  const { audit, identity } = composeIdentity({ env, db: database.db, adapters });
  const lokasi = createLokasi({ db: database.db, clock: adapters.clock, files: adapters.files, audit, identity });
  const operatorSettings = createOperatorSettings({ db: database.db, clock: adapters.clock, audit });
  const tariffs = createTariffs({ db: database.db, clock: adapters.clock, audit, lokasi });
  const inventory = createInventory({ db: database.db, clock: adapters.clock, audit, files: adapters.files, tariffs, lokasi, pemesananPernahMenyebut: pernahMenyebutPetakAtauKavling });
  // Billing's payment effects include the Layanan module's scheduling, which reads a grave's Hak Pakai.
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
  return { modul, operatorSettings };
}

/** Brings each example Lokasi Mitra already listed up to the mock; what is left are the ones still to build. */
async function samakanYangAda(
  modul: Modul,
  admin: Actor,
  contoh: ContohLokasiSpec[],
  alasan: string,
): Promise<{ ok: true; berubah: number; belum: ContohLokasiSpec[] } | { ok: false; output: string }> {
  const idTerdaftar = new Map((await modul.lokasi.publicLokasiMitraList()).map((one) => [one.name, one.id]));
  let berubah = 0;
  for (const spec of contoh) {
    const id = idTerdaftar.get(spec.name);
    if (!id) continue;
    const disamakan = await samakanDenganContoh(modul, admin, id, spec, alasan);
    if (!disamakan.ok) return { ok: false, output: `Ditolak: ${spec.name} tidak bisa disamakan (${disamakan.reason}).` };
    berubah += disamakan.berubah;
  }
  return { ok: true, berubah, belum: contoh.filter((spec) => !idTerdaftar.has(spec.name)) };
}

/** Builds and publishes each example Lokasi Mitra that is not listed yet. */
async function terbitkanYangBelum(modul: Modul, admin: Actor, belum: ContohLokasiSpec[], alasan: string): Promise<Hasil> {
  const petugas = await undangPetugas(modul, admin, alasan);
  if (!petugas.ok) return { exitCode: 1, output: `Ditolak: Petugas Lapangan contoh tidak siap (${petugas.reason}).` };
  const hariIni = wibDateOf(modul.adapters.clock.now());
  const diterbitkan: string[] = [];
  for (const spec of belum) {
    const hasil = await seedOneLokasi(modul, admin, petugas.value, hariIni, spec, alasan);
    if (!hasil.ok) return { exitCode: 1, output: `Ditolak: ${spec.name} tidak siap (${hasil.reason}).` };
    diterbitkan.push(`${spec.name} (/lokasi/${hasil.id})`);
  }
  return { exitCode: 0, output: `${diterbitkan.length} Lokasi Mitra contoh terbit (Terverifikasi): ${diterbitkan.join(", ")}.` };
}

export async function seedContohPublikCommand(
  argv: string[],
  source: Record<string, string | undefined> = process.env,
  /** The example Lokasi Mitra to seed; only a test passes another (a reduced copy, standing in for an older version's run). */
  contoh: ContohLokasiSpec[] = CONTOH_LOKASI,
  /** Only a test passes a Clock, so its read-back at a fixed instant sees the versions this run entered (ticket 100). */
  options: { clock?: Clock } = {},
): Promise<Hasil> {
  const izin = bacaIzin(argv, source);
  if ("tolak" in izin) return izin.tolak;
  const { alasan } = izin;

  try {
    const env = readRuntimeEnv(source);
    const database = createDatabase(env.DATABASE_URL, { max: 2, applicationName: "makam-seed-contoh-publik" });
    try {
      const { modul, operatorSettings } = susunModul(env, database, options.clock);
      const admin = await adminPlatform(modul.identity);
      if (!admin) return { exitCode: 1, output: "Ditolak: belum ada Admin Platform. Jalankan seed:admin dulu." };

      // Pengaturan Operator: the shared example (CS contact = the mock's), entered only when
      // empty and never overwritten, so a stack the Operator already filled in keeps its own.
      const operatorKosong = (await operatorSettings.current()) === null;
      const operator = await isiPengaturanOperatorBilaKosong(operatorSettings, admin, alasan);
      if (!operator.ok) return { exitCode: 1, output: `Ditolak: Pengaturan Operator contoh tidak tersimpan (${operator.reason}).` };

      // An example Lokasi Mitra an older run already listed is reconciled (see `samakanDenganContoh`).
      const disamakan = await samakanYangAda(modul, admin, contoh, alasan);
      if (!disamakan.ok) return { exitCode: 1, output: disamakan.output };
      const berubah = disamakan.berubah + (operatorKosong ? 1 : 0);
      if (disamakan.belum.length === 0) {
        return {
          exitCode: 0,
          output:
            berubah === 0
              ? `Sudah ada ${contoh.length} Lokasi Mitra contoh di listing; seed-contoh-publik tidak mengubah apa pun.`
              : `Sudah ada ${contoh.length} Lokasi Mitra contoh di listing; ${berubah} hal disamakan dengan contoh (hanya menambah).`,
        };
      }
      return await terbitkanYangBelum(modul, admin, disamakan.belum, alasan);
    } finally {
      await database.close();
    }
  } catch (error) {
    return { exitCode: 1, output: cliFailure(error) };
  }
}

/** The one Petugas Lapangan every example Lokasi Mitra's Kunjungan Verifikasi and Cek Denah are done by (the role is not Lokasi-scoped). */
async function undangPetugas(modul: Modul, admin: Actor, alasan: string): Promise<{ ok: true; value: Actor } | Gagal> {
  return masukSebagai(
    modul,
    PETUGAS.email,
    { role: "petugas_lapangan" },
    () => modul.identity.inviteStaff(admin, { ...PETUGAS, role: "petugas_lapangan", reason: alasan }),
  );
}

/** This example Lokasi Mitra's own Admin Lokasi (and Kontak Siaga): its first Kode Masuk login is given the mock's `kontakSiaga.nama`. */
async function undangAdminLokasi(modul: Modul, admin: Actor, lokasiId: string, spec: ContohLokasiSpec, alasan: string): Promise<{ ok: true; value: Actor } | Gagal> {
  return masukSebagai(
    modul,
    spec.adminLokasiEmail,
    { role: "admin_lokasi", lokasiId },
    () => modul.lokasi.inviteAdminLokasi(admin, lokasiId, { email: spec.adminLokasiEmail, phoneNumber: spec.adminLokasiPhone, reason: alasan }),
    spec.kontakSiagaName,
  );
}

/** A tidy top-up Blok holds at most this many Petak (10 columns, so at most 10 Petak rows and the Jalan rows between them). */
const MAKS_PETAK_PER_BLOK_RAPI = 100;
const KOLOM_BLOK_RAPI = 10;
/** A Jalan row after every this many Petak rows. */
const BARIS_PETAK_SEBELUM_JALAN = 4;

/**
 * The grid of a tidy top-up Blok for `jumlah` Petak, every one `sel` ("T"
 * Tersedia, or "X" Tidak Tersedia): 10 columns (fewer when there are fewer
 * Petak), a Jalan row after every 4 Petak rows, and the unfilled tail of the
 * last row Bukan Petak, so it is always a full rectangle.
 */
export function gridRapi(jumlah: number, sel: "T" | "X"): string[] {
  const kolom = Math.min(KOLOM_BLOK_RAPI, jumlah);
  const barisPetak = Math.ceil(jumlah / kolom);
  const rows: string[] = [];
  let sisa = jumlah;
  for (let baris = 0; baris < barisPetak; baris += 1) {
    if (baris > 0 && baris % BARIS_PETAK_SEBELUM_JALAN === 0) rows.push(".".repeat(kolom));
    const isi = Math.min(kolom, sisa);
    rows.push(sel.repeat(isi) + "#".repeat(kolom - isi));
    sisa -= isi;
  }
  return rows;
}

/** Blok letters: A, B, ..., Z, AA, AB, ... */
function hurufKe(index: number): string {
  const huruf = String.fromCharCode(65 + (index % 26));
  return index < 26 ? huruf : `${hurufKe(Math.floor(index / 26) - 1)}${huruf}`;
}

interface KavlingGrid {
  /** Unset: Inventory picks the next free Nomor Kavling from the Blok's pattern. */
  nomor?: string;
  r: number;
  c: number;
  h: number;
  w: number;
  status: "Tersedia" | "Dipesan";
}

interface BlokGrid {
  nama: string;
  /** Nomor Makam prefixes to try in turn (`A`, then `A2`, ...): a number already used elsewhere in the Lokasi is refused. */
  awalan: string[];
  jenisMakamId: string;
  rows: string[];
  kavling: KavlingGrid[];
  kavlingJenisMakamId: string | null;
}

/**
 * One Blok from its grid (`BlokPrototipe`'s characters), only through
 * Inventory's public functions: createBlok, setCellKind (Jalan, Bukan Petak),
 * renumberCells (Petak only, in reading order), createKavling, then clearPetak
 * / clearKavling for every cell's status. Returns reason `nomor_bentrok` when
 * every prefix in `awalan` clashes with a Nomor Makam already in the Lokasi.
 */
async function bangunBlokDariGrid(modul: Modul, adminLokasi: Actor, lokasiId: string, blok: BlokGrid, alasan: string): Promise<{ ok: true } | Gagal> {
  const { inventory } = modul;

  let blokId: string | null = null;
  let pola = "";
  for (const awalan of blok.awalan) {
    pola = `${awalan}-{nn}`;
    const dibuat = await inventory.createBlok(adminLokasi, lokasiId, {
      name: blok.nama,
      rows: blok.rows.length,
      cols: blok.rows[0].length,
      numberPattern: pola,
      jenisMakamId: blok.jenisMakamId,
    });
    if (dibuat.ok) {
      blokId = dibuat.blok.id;
      break;
    }
    if (dibuat.reason !== "nomor_sudah_dipakai") return { ok: false, reason: `blok ${blok.nama}: ${dibuat.reason}` };
  }
  if (!blokId) return { ok: false, reason: "nomor_bentrok" };

  const denah = await inventory.asStaff(adminLokasi).blok(lokasiId, blokId);
  const idPerSel = new Map((denah?.cells ?? []).map((cell) => [`${cell.row},${cell.col}`, cell.id]));
  const kavlingDi = (r: number, c: number) => blok.kavling.find((k) => r >= k.r && r < k.r + k.h && c >= k.c && c < k.c + k.w);

  const jalan: string[] = [];
  const bukanPetak: string[] = [];
  const petak: { id: string; status: string }[] = [];
  for (const [r, baris] of blok.rows.entries()) {
    for (const [c, karakter] of [...baris].entries()) {
      const id = idPerSel.get(`${r},${c}`);
      if (!id) return { ok: false, reason: `blok ${blok.nama}: sel ${r},${c} tidak ada` };
      if (karakter === ".") jalan.push(id);
      else if (karakter === "#") bukanPetak.push(id);
      // A K cell outside every Kavling rectangle is a plot that cannot be sold: Tidak Tersedia.
      else petak.push({ id, status: karakter === "K" && !kavlingDi(r, c) ? "X" : karakter });
    }
  }

  for (const [kind, cellIds] of [["jalan", jalan], ["bukan_petak", bukanPetak]] as const) {
    if (cellIds.length === 0) continue;
    const diubah = await inventory.setCellKind(adminLokasi, lokasiId, blokId, { cellIds, kind });
    if (!diubah.ok) return { ok: false, reason: `blok ${blok.nama} ${kind}: ${diubah.reason}` };
  }
  if (petak.length > 0) {
    const diberiNomor = await inventory.renumberCells(adminLokasi, lokasiId, blokId, { cellIds: petak.map((one) => one.id), pattern: pola });
    if (!diberiNomor.ok) return { ok: false, reason: `blok ${blok.nama} nomor: ${diberiNomor.reason}` };
  }

  for (const { id, status } of petak) {
    if (status === "K") continue; // cleared with its Kavling Keluarga below
    const cleared =
      status === "T"
        ? await inventory.clearPetak(adminLokasi, lokasiId, id, { mode: "tersedia" })
        : status === "I" || status === "U"
          ? await inventory.clearPetak(adminLokasi, lokasiId, id, { mode: "terisi", dataMenyusul: true })
          : await inventory.clearPetak(adminLokasi, lokasiId, id, {
              mode: "tidak_tersedia",
              reason: `${alasan}: ${status === "D" ? "Dipesan (contoh data, tanpa pesanan)" : "Tidak tersedia (contoh data)"}`,
            });
    if (!cleared.ok) return { ok: false, reason: `blok ${blok.nama} petak: ${cleared.reason}` };
  }

  for (const k of blok.kavling) {
    if (!blok.kavlingJenisMakamId) return { ok: false, reason: `blok ${blok.nama}: Kavling tanpa Jenis Makam` };
    const cellIds: string[] = [];
    for (let r = k.r; r < k.r + k.h; r += 1) for (let c = k.c; c < k.c + k.w; c += 1) cellIds.push(idPerSel.get(`${r},${c}`)!);
    const kavling = await inventory.createKavling(adminLokasi, lokasiId, blokId, { cellIds, jenisMakamId: blok.kavlingJenisMakamId, nomorKavling: k.nomor });
    if (!kavling.ok) return { ok: false, reason: `kavling ${k.nomor ?? ""}: ${kavling.reason}` };
    const cleared = await inventory.clearKavling(adminLokasi, lokasiId, kavling.kavlingId, k.status === "Tersedia" ? { mode: "tersedia" } : { mode: "terisi", dataMenyusul: true });
    if (!cleared.ok) return { ok: false, reason: `kavling ${kavling.nomorKavling}: ${cleared.reason}` };
  }
  return { ok: true };
}

/**
 * The Denah of one example Lokasi Mitra, completed only by adding: first the
 * prototype's own Bloks it does not have yet (matched by name), built exactly;
 * then, for each Jenis Makam still short of the mock's Tersedia count, tidy
 * top-up Bloks ("Blok C", ...; Kavling Keluarga units for a Kavling entry). With
 * `denganKosong`, the mock's `tersedia: 0` Jenis Makam gets one Tidak Tersedia
 * Petak when no prototype Blok already sits on it. A second call adds nothing.
 */
async function lengkapiDenah(
  modul: Modul,
  adminLokasi: Actor,
  lokasiId: string,
  spec: ContohLokasiSpec,
  idPerNama: Map<string, string>,
  denganKosong: boolean,
  alasan: string,
): Promise<{ ok: true } | Gagal> {
  const { inventory } = modul;
  const kavlingJenisMakamId = idPerNama.get(spec.jenisMakam.find((jm) => jm.kavlingPetak)?.name ?? "") ?? null;
  const dipakai = new Set((await inventory.asStaff(adminLokasi).bloks(lokasiId)).map((blok) => blok.name.toLowerCase()));

  for (const proto of spec.denahPrototipe ?? []) {
    if (dipakai.has(proto.nama.toLowerCase())) continue;
    const jenisMakamId = idPerNama.get(proto.jenisMakam);
    if (!jenisMakamId) return { ok: false, reason: `blok ${proto.nama}: Jenis Makam ${proto.jenisMakam} tidak ada` };
    const dibangun = await bangunBlokDariGrid(
      modul,
      adminLokasi,
      lokasiId,
      {
        nama: proto.nama,
        awalan: [proto.prefix, ...Array.from({ length: 8 }, (_, n) => `${proto.prefix}${n + 2}`)],
        jenisMakamId,
        rows: proto.rows,
        kavling: proto.kavling ?? [],
        kavlingJenisMakamId,
      },
      alasan,
    );
    if (!dibangun.ok) return dibangun;
    dipakai.add(proto.nama.toLowerCase());
  }

  let huruf = 0;
  /** The next free "Blok <huruf>": skips a name taken and a letter whose Nomor Makam a Blok here already uses. */
  const bangunRapi = async (jenisMakamId: string, rows: string[], kavling: KavlingGrid[]): Promise<{ ok: true } | Gagal> => {
    for (; huruf < 26 * 27; huruf += 1) {
      const nama = `Blok ${hurufKe(huruf)}`;
      if (dipakai.has(nama.toLowerCase())) continue;
      const dibangun = await bangunBlokDariGrid(modul, adminLokasi, lokasiId, { nama, awalan: [hurufKe(huruf)], jenisMakamId, rows, kavling, kavlingJenisMakamId: kavling.length ? jenisMakamId : null }, alasan);
      if (dibangun.ok) {
        dipakai.add(nama.toLowerCase());
        return dibangun;
      }
      if (dibangun.reason !== "nomor_bentrok") return dibangun;
    }
    return { ok: false, reason: "tidak ada nama Blok yang bebas" };
  };

  const tersedia = new Map((await inventory.tersediaPerJenisMakam(lokasiId)).map((row) => [row.jenisMakamId, row.count]));
  for (const jm of spec.jenisMakam) {
    const id = idPerNama.get(jm.name);
    if (!id) continue;
    if (jm.kosong) {
      const dipakaiPrototipe = (spec.denahPrototipe ?? []).some((proto) => proto.jenisMakam === jm.name);
      if (denganKosong && !dipakaiPrototipe) {
        const dibangun = await bangunRapi(id, gridRapi(1, "X"), []);
        if (!dibangun.ok) return { ok: false, reason: `${jm.name}: ${dibangun.reason}` };
      }
      continue;
    }
    const kurang = jm.tersedia - (tersedia.get(id) ?? 0);
    if (kurang <= 0) continue;

    if (jm.kavlingPetak) {
      // Each unit a rectangle of `kavlingPetak` Petak (1 × 2, 2 × 2, ...), side by side in one row of units.
      const h = jm.kavlingPetak >= 4 ? 2 : 1;
      const w = jm.kavlingPetak / h;
      const kavling = Array.from({ length: kurang }, (_, u): KavlingGrid => ({ r: 0, c: u * w, h, w, status: "Tersedia" }));
      const dibangun = await bangunRapi(id, Array.from({ length: h }, () => "K".repeat(w * kurang)), kavling);
      if (!dibangun.ok) return { ok: false, reason: `${jm.name}: ${dibangun.reason}` };
      continue;
    }
    // Split evenly (103 becomes 52 + 51, never 100 + 3), so no top-up Blok is a stub.
    const jumlahBlok = Math.ceil(kurang / MAKS_PETAK_PER_BLOK_RAPI);
    for (let ke = 0; ke < jumlahBlok; ke += 1) {
      const ukuran = Math.floor(kurang / jumlahBlok) + (ke < kurang % jumlahBlok ? 1 : 0);
      const dibangun = await bangunRapi(id, gridRapi(ukuran, "T"), []);
      if (!dibangun.ok) return { ok: false, reason: `${jm.name}: ${dibangun.reason}` };
    }
  }
  return { ok: true };
}

/** The names an older version gave its single-row example Bloks: "A", "A-2", ..., "Tambahan-3". A current Blok is "Blok <huruf>" or a prototype name, never one of these. */
const NAMA_BLOK_LAMA = /^(?:[A-Z](?:-\d+)?|Tambahan-\d+)$/;

/** The older version's single-row Blok of this Lokasi that are empty of history (so Inventory would let them go). */
async function bloksLama(modul: Modul, admin: Actor, lokasiId: string, bloks: { id: string; name: string; rows: number }[]): Promise<{ id: string }[]> {
  const kandidat = bloks.filter((blok) => blok.rows === 1 && NAMA_BLOK_LAMA.test(blok.name));
  const bersih: { id: string }[] = [];
  for (const blok of kandidat) {
    const denah = await modul.inventory.asStaff(admin).blok(lokasiId, blok.id);
    if (denah && denah.cells.every((cell) => !cell.usedForever) && denah.kavling.every((kavling) => !kavling.firstUsedAt)) bersih.push({ id: blok.id });
  }
  return bersih;
}

/**
 * Brings an already-listed example Lokasi Mitra (seeded by an older version of
 * this command) up to the mock: its older single-row Bloks that are empty of
 * history are removed (`hapusBlok`), then only adding: the prototype Bloks it
 * does not have yet, the Tersedia Petak / Kavling units it is still short of (tidy
 * Bloks, cleared; nothing existing is touched, removed or re-cleared, and the
 * mock's one `tersedia: 0` entry is left alone), a Jenis Makam price that
 * differs from the mock's (a new tariff version effective today, never an edit
 * of the old one), and its Kontak Siaga's name
 * when the Akun still has none (a Kode Masuk login fills it, never replacing
 * one). Returns how many things it changed; 0 changes nothing, not even a login.
 */
async function samakanDenganContoh(modul: Modul, admin: Actor, lokasiId: string, spec: ContohLokasiSpec, alasan: string): Promise<{ ok: true; berubah: number } | Gagal> {
  const { tariffs, inventory, lokasi, adapters } = modul;
  const [{ jenisMakam }, tersedia, kontak, bloks] = await Promise.all([
    tariffs.asStaff(admin).lokasiTariffs(lokasiId, adapters.clock.now()),
    inventory.tersediaPerJenisMakam(lokasiId),
    lokasi.kontakSiagaOf(lokasiId),
    inventory.asStaff(admin).bloks(lokasiId),
  ]);
  const countById = new Map(tersedia.map((row) => [row.jenisMakamId, row.count]));
  let kurang = 0;
  for (const jm of spec.jenisMakam) {
    if (jm.kosong) continue;
    const found = jenisMakam.find((one) => one.name === jm.name);
    if (found && jm.tersedia - (countById.get(found.id) ?? 0) > 0) kurang += 1;
  }
  // A Jenis Makam whose price in force differs from the mock's (a stack seeded with an older price): a new
  // tariff version effective today, through Tariffs' own versioning; the old version is never edited.
  const hariIni = wibDateOf(adapters.clock.now());
  const tarifBeda = spec.jenisMakam.flatMap((jm) => {
    const found = jenisMakam.find((one) => one.name === jm.name);
    return found?.inForce && found.inForce.hargaHakPakai !== jm.hargaHakPakai ? [{ jm, id: found.id }] : [];
  });
  const lama = await bloksLama(modul, admin, lokasiId, bloks);
  const bloksAda = new Set(bloks.map((blok) => blok.name.toLowerCase()));
  const prototipeBelum = (spec.denahPrototipe ?? []).filter((proto) => !bloksAda.has(proto.nama.toLowerCase())).length;
  const perluNama = kontak !== null && kontak.name === "";
  if (kurang === 0 && prototipeBelum === 0 && !perluNama && tarifBeda.length === 0 && lama.length === 0) return { ok: true, berubah: 0 };

  for (const { jm, id } of tarifBeda) {
    const diubah = await tariffs.setJenisMakamTariff(admin, id, {
      hargaHakPakai: jm.hargaHakPakai,
      tenure: jm.tenure,
      hargaPerpanjangan: jm.hargaPerpanjangan,
      effectiveOn: hariIni,
      reason: alasan,
    });
    if (!diubah.ok) return { ok: false, reason: `tarif ${jm.name}: ${diubah.reason}` };
  }
  if (tarifBeda.length > 0) {
    // The Lokasi is already published: enter the new price as checked again, as the seed did when it first published.
    const diperiksa = await tariffs.markTariffsChecked(admin, lokasiId, { reason: alasan });
    if (!diperiksa.ok) return { ok: false, reason: `tarif diperiksa: ${diperiksa.reason}` };
  }
  if (kurang === 0 && prototipeBelum === 0 && !perluNama && lama.length === 0) return { ok: true, berubah: tarifBeda.length };

  const adminLokasi = await undangAdminLokasi(modul, admin, lokasiId, spec, alasan);
  if (!adminLokasi.ok) return { ok: false, reason: `admin lokasi: ${adminLokasi.reason}` };

  // The older version's single-row Bloks go first, so the counts below are read without them.
  let dihapus = 0;
  for (const blok of lama) {
    const hasil = await inventory.hapusBlok(adminLokasi.value, lokasiId, blok.id, `${alasan}: Blok contoh lama diganti denah prototipe`);
    if (hasil.ok) dihapus += 1;
    // A Blok that turned out to have history or a hold stays, as it is.
  }

  const denah = await lengkapiDenah(modul, adminLokasi.value, lokasiId, spec, new Map(jenisMakam.map((one) => [one.name, one.id])), false, alasan);
  if (!denah.ok) return { ok: false, reason: `denah: ${denah.reason}` };
  return { ok: true, berubah: tarifBeda.length + kurang + prototipeBelum + dihapus + (perluNama ? 1 : 0) };
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

  const denah = await lengkapiDenah(modul, adminLokasi.value, lokasiId, spec, new Map(spec.jenisMakam.map((jm, index) => [jm.name, jenisMakamIds[index]])), true, alasan);
  if (!denah.ok) return { ok: false, reason: `denah: ${denah.reason}` };

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

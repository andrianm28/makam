import { FakePdfRenderer } from "@/adapters/memory";
import { composeLayanan } from "@/composition/layanan";
import type { Database } from "@/db/client";
import { createBilling, type Billing } from "@/domain/billing";
import type { Actor } from "@/domain/identity";
import { buktiOf, type LayananNotifikasi, type NewLayanan } from "@/domain/layanan";
import { efekJadwalkanPekerjaan } from "@/domain/layanan/pembayaran";
import { PENGATURAN_OPERATOR } from "./billing";
import { cellsOf } from "./inventory";
import { adminPlatformOf } from "./identity";
import { pemesanDenganEmail } from "./pemesanan";
import { newLokasiMitra, publishOnTestDatabase, publishedLokasiMitra, signedInAdminLokasi, signedInAdminPlatform, type PublishSetup } from "./publish";
import { setLokasiMitraStatusForTest } from "./lokasi";

/** Every Layanan message a test may read instead of the Notifications module, which the fixtures stand in for. */
export interface PesananLayananTerb {
  nomor: string;
  email: string;
  pemesanName: string;
  lokasi: { id: string; name: string };
  petak: { nomor: string };
  item: { label: string; targetDate: string }[];
  tagihan: { nomorTagihan: string; total: number; dueAt: Date; link: string };
}

export interface PekerjaanLayananSelesaiTerb {
  pekerjaanId: string;
  nomor: string;
  email: string;
  pemesanName: string;
  label: string;
  selesaiAt: Date;
  bukti: { kind: "foto_sebelum" | "foto_sesudah" | "video"; url: string | null }[];
}

/** The announcements the Layanan module makes, collected in place of the Notifications module. */
export function collectLayananNotifikasi(): LayananNotifikasi & { pesananTerbit: PesananLayananTerb[]; selesai: PekerjaanLayananSelesaiTerb[] } {
  const pesananTerbit: PesananLayananTerb[] = [];
  const selesai: PekerjaanLayananSelesaiTerb[] = [];
  return {
    pesananTerbit,
    selesai,
    pesananLayananTerbit: async (hasil) => {
      pesananTerbit.push(hasil);
    },
    pekerjaanSelesai: async (hasil) => {
      selesai.push(hasil);
    },
  };
}

/**
 * The Layanan module on the test Postgres, next to Tariffs, Lokasi, Inventory,
 * Billing, Identity and the publish path (so a test can take a Lokasi Mitra all
 * the way to Terverifikasi, read the prices its public page shows, and **pay** a
 * Tagihan the order issued), sharing their fake Clock, FileStore and Audit Log.
 *
 * Billing here is composed **with the Layanan module's payment effect**, so a test
 * that pays for an order sees the order's jobs scheduled by the payment itself —
 * the same seam production uses — rather than by calling the effect by hand.
 */
export function layananOnTestDatabase(db: Database) {
  const base = publishOnTestDatabase(db);
  const billing = billingDenganEfekLayanan(db, base);
  const notifikasi = collectLayananNotifikasi();
  const layanan = composeLayanan({
    db,
    clock: base.clock,
    files: base.files,
    audit: base.audit,
    lokasi: base.lokasi,
    tariffs: base.tariffs,
    inventory: base.inventory,
    billing,
    identity: base.identity,
    notifikasi,
  });
  return { ...base, billing, layanan, notifikasi };
}

export type LayananSetup = ReturnType<typeof layananOnTestDatabase>;

/**
 * The publish fixture's Billing, with the Layanan module's payment effect
 * registered. The effect is what a payment fires to schedule a paid order's jobs,
 * so a test that pays reaches it the way production does, through the payment.
 */
function billingDenganEfekLayanan(db: Database, base: PublishSetup): Billing {
  return createBilling({
    db,
    clock: base.clock,
    operatorSettings: base.operatorSettings,
    pdf: new FakePdfRenderer(),
    payments: base.payments,
    documentPageUrl: (link) => `http://127.0.0.1:3000/dokumen/${link}`,
    publicDocumentUrl: (link) => `https://makam.test/dokumen/${link}`,
    paymentEffects: [efekJadwalkanPekerjaan({ db, inventory: base.inventory })],
    reportError: (error, context) => base.reportedErrors.push({ error, context }),
  });
}

export { newLokasiMitra, publishedLokasiMitra, setLokasiMitraStatusForTest, signedInAdminLokasi, signedInAdminPlatform };

/**
 * A Layanan of the v1 catalog, typed as an Admin Platform would enter it: the
 * kind (`jenis`) and the proof that kind requires, which is what the form carries.
 */
export function newLayananInput(overrides: Partial<NewLayanan> = {}): NewLayanan {
  const jenis = overrides.jenis ?? "pembersihan";
  return {
    name: "Pembersihan Makam",
    description: "Membersihkan dan merapikan makam.",
    jenis,
    bukti: buktiOf(jenis),
    leadTimeDays: 3,
    bisaHariH: false,
    adaDiPetakKosong: true,
    teksLabel: null,
    varian: ["Reguler"],
    reason: null,
    ...overrides,
  };
}

/** A Layanan in the catalog, created by `admin`, with its first variant's id. */
export async function newLayananFor(setup: LayananSetup, admin: Actor, overrides: Partial<NewLayanan> = {}) {
  const created = await setup.layanan.createLayanan(admin, newLayananInput(overrides));
  if (!created.ok) throw new Error(`Layanan refused: ${created.reason}`);
  return { layanan: created.layanan, varian: created.layanan.varian[0] };
}

/** A Layanan in the catalog, with the setup's one Admin Platform who made it. */
export async function catalogFixture(setup: LayananSetup, overrides: Partial<NewLayanan> = {}) {
  const { actor: admin } = await adminPlatformOf(setup);
  return { admin, ...(await newLayananFor(setup, admin, overrides)) };
}

/**
 * A Terverifikasi Lokasi Mitra that **offers** a Layanan variant at that place's
 * price, with one Blok of cleared Tersedia Petak and an Admin Lokasi who can work
 * there: everything a job needs except the grave, which the caller occupies.
 */
export async function lokasiDenganLayanan(
  setup: LayananSetup,
  options: { amount?: number; leadTimeDays?: number; jenis?: NewLayanan["jenis"]; nama?: string; teksLabel?: string | null } = {},
) {
  // The setup's one Admin Platform: a second seed would be refused, so every
  // helper here reads that one rather than creating its own.
  const { actor: admin } = await adminPlatformOf(setup);
  const { layanan, varian } = await newLayananFor(setup, admin, {
    // Only what the caller actually said: an `undefined` here would override the
    // defaults below rather than leave them, and a Layanan with no name is refused.
    ...(options.jenis === undefined ? {} : { jenis: options.jenis }),
    ...(options.leadTimeDays === undefined ? {} : { leadTimeDays: options.leadTimeDays }),
    ...(options.nama === undefined ? {} : { name: options.nama }),
    ...(options.teksLabel === undefined ? {} : { teksLabel: options.teksLabel }),
  });
  const dasar = await terverifikasiLokasiDenganPetak(setup, admin);
  const ditawarkan = await setup.layanan.tawarkanLayanan(admin, dasar.lokasiMitra.id, varian.id, {
    amount: options.amount ?? 750_000,
    effectiveOn: "2026-10-01",
    reason: null,
  });
  if (!ditawarkan.ok) throw new Error(`Layanan offering refused: ${ditawarkan.reason}`);
  return { admin, ...dasar, layanan, varian };
}

export type LokasiDenganLayanan = Awaited<ReturnType<typeof lokasiDenganLayanan>>;

/** A Terverifikasi Lokasi Mitra with a Blok of cleared Tersedia Petak and its own Admin Lokasi. */
async function terverifikasiLokasiDenganPetak(setup: LayananSetup, admin: Actor) {
  const { lokasiMitra, jenisMakam, adminLokasi } = await publishedLokasiMitra(setup, admin);
  const blok = await setup.inventory.createBlok(adminLokasi, lokasiMitra.id, { name: "A", rows: 1, cols: 2, jenisMakamId: jenisMakam.id });
  if (!blok.ok) throw new Error(`Blok refused: ${blok.reason}`);
  const petak = await cellsOf(setup, adminLokasi, lokasiMitra.id, blok.blok.id);
  for (const cell of petak) {
    const cleared = await setup.inventory.clearPetak(adminLokasi, lokasiMitra.id, cell.id, { mode: "tersedia" });
    if (!cleared.ok) throw new Error(`clearPetak refused: ${cleared.reason}`);
  }
  return { lokasiMitra, jenisMakam, adminLokasi, petak };
}

/**
 * A grave somebody else holds: the first cleared Petak of a Lokasi Mitra, with an
 * Aktif Hak Pakai on it. The family that orders the Layanan is **not** the Pemegang
 * Hak — that is the rule the order proves.
 */
export async function petakDenganHakPakai(
  setup: LayananSetup,
  lokasi: LokasiDenganLayanan,
  pemegangHak: { name: string; phoneNumber: string; email?: string } = { name: "Siti Aminah", phoneNumber: "081200000001" },
) {
  const diberikan = await setup.inventory.beriHakPakai(lokasi.adminLokasi, lokasi.lokasiMitra.id, {
    petakId: lokasi.petak[0].id,
    jenisMakamId: lokasi.jenisMakam.id,
    pemegangHak: { name: pemegangHak.name, phoneNumber: pemegangHak.phoneNumber, email: pemegangHak.email },
  });
  if (!diberikan.ok) throw new Error(`Hak Pakai refused: ${diberikan.reason}`);
  return { petakId: lokasi.petak[0].id, nomor: diberikan.nomor, hakPakaiId: diberikan.hakPakaiId };
}

/** A Pemesan with a proven email, a Kode Masuk away: the order's own Akun. */
export async function pemesanLayanan(setup: LayananSetup, email = "pemesan.layanan@contoh.id") {
  return pemesanDenganEmail(setup, email);
}

/** Pengaturan Operator, which every Tagihan is headed with, so one can be issued. */
export async function siapkanOperatorLayanan(setup: LayananSetup) {
  const { actor: admin } = await adminPlatformOf(setup);
  const changed = await setup.operatorSettings.change(admin, { ...PENGATURAN_OPERATOR, reason: null });
  if (!changed.ok) throw new Error(`Pengaturan Operator refused: ${changed.reason}`);
  return admin;
}

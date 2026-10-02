import { FakePdfRenderer } from "@/adapters/memory";
import { suratKuasaDeps } from "./surat-kuasa";
import { composeLayanan } from "@/composition/layanan";
import type { Database } from "@/db/client";
import { createBilling, type Billing } from "@/domain/billing";
import type { PengurusanDikonfirmasiInput } from "@/domain/notifications";
import { createPengurusan } from "@/domain/pengurusan";
import type { Actor } from "@/domain/identity";
import {
  buktiOf,
  type LayananNotifikasi,
  type NewLayanan,
  type PaketSiklusDijeda,
  type PesanThreadBaru,
  type PekerjaanMitraJasa,
  type PekerjaanMitraJasaPort,
  type PekerjaanTpuDitugaskan,
  type PesananTpuTerbit,
} from "@/domain/layanan";
import { efekJadwalkanPekerjaan } from "@/domain/layanan/pembayaran";
import { efekPencairanSaatLunas } from "@/domain/payouts/efek";
import { PENGATURAN_OPERATOR } from "./billing";
import { payoutsFor } from "./payouts";
import { refundsFor } from "./refunds";
import { cellsOf } from "./inventory";
import { actorOf, adminPlatformOf, logIn } from "./identity";
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
  tagihan: { id: string; nomorTagihan: string; total: number; dueAt: Date; link: string };
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
export function collectLayananNotifikasi(): LayananNotifikasi & {
  pesananTerbit: PesananLayananTerb[];
  selesai: PekerjaanLayananSelesaiTerb[];
  pesananTpuDicatat: PesananTpuTerbit[];
  ditugaskan: PekerjaanTpuDitugaskan[];
  paketDijeda: PaketSiklusDijeda[];
  pesanThread: PesanThreadBaru[];
} {
  const pesananTerbit: PesananLayananTerb[] = [];
  const selesai: PekerjaanLayananSelesaiTerb[] = [];
  const pesananTpuDicatat: PesananTpuTerbit[] = [];
  const ditugaskan: PekerjaanTpuDitugaskan[] = [];
  const paketDijeda: PaketSiklusDijeda[] = [];
  const pesanThread: PesanThreadBaru[] = [];
  return {
    pesanThread,
    pesanThreadBaru: async (_tx, hasil) => {
      pesanThread.push(hasil);
    },
    pesananTerbit,
    selesai,
    pesananTpuDicatat,
    ditugaskan,
    paketDijeda,
    pesananLayananTerbit: async (_tx, hasil) => {
      pesananTerbit.push(hasil);
    },
    pekerjaanSelesai: async (_tx, hasil) => {
      selesai.push(hasil);
    },
    pesananTpuTerbit: async (_tx, hasil) => {
      pesananTpuDicatat.push(hasil);
    },
    pekerjaanTpuDitugaskan: async (_tx, hasil) => {
      ditugaskan.push(hasil);
    },
    paketSiklusDijeda: async (_tx, hasil) => {
      paketDijeda.push(hasil);
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
export function layananOnTestDatabase(db: Database, options: { notifikasiNyata?: boolean; pekerjaanNyata?: boolean } = {}) {
  const base = publishOnTestDatabase(db);
  const billing = billingDenganEfekLayanan(db, base);
  const notifikasi = collectLayananNotifikasi();
  // The Mitra Jasa job port (ticket 55) is a seam a test seeds with job facts. A test of the TPU jobs themselves (ticket 56)
  // asks for the real one instead, so the scorecard, the picker's "Baru" badge and a suspension's release read the real jobs.
  const pekerjaan = newPekerjaanMitraJasaPort();
  // The real Refunds, on this fixture's own Billing, so a cancelled job's refund request is one an
  // Admin Platform can approve and transfer in a test.
  const { payouts } = payoutsFor({ ...base, billing });
  const { refunds } = refundsFor({ ...base, billing }, payouts);
  // A test of what the family is actually sent asks for the real Notifications module; every
  // other test reads the collected announcements instead.
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
    refunds,
    payouts,
    ...(options.pekerjaanNyata ? {} : { pekerjaan }),
    ...(options.notifikasiNyata ? { notifications: base.notifications } : { notifikasi }),
  });
  // The Pengurusan module beside it (ticket 56): a Saat Duka TPU confirmation puts the hari-H Layanan on its Tagihan and
  // schedules their jobs through this Layanan module, on this Billing (with the Layanan payment effect). Its own family
  // messages are recorded, not sent, as the Pengurusan fixture does.
  const pengurusanDikonfirmasi: PengurusanDikonfirmasiInput[] = [];
  const pengurusan = createPengurusan({
    db,
    clock: base.clock,
    files: base.files,
    ...suratKuasaDeps(),
    audit: base.audit,
    lokasi: base.lokasi,
    tariffs: base.tariffs,
    billing,
    identity: base.identity,
    fieldwork: base.fieldwork,
    notifikasi: {
      tagihanTerbit: async () => ({ ok: true as const, diingatkan: 0 }),
      pengurusanDikonfirmasi: async (hasil) => {
        pengurusanDikonfirmasi.push(hasil);
        return { ok: true };
      },
      iptmTerbit: async () => ({ ok: true }),
    },
    refunds,
    layanan,
  });
  return { ...base, billing, layanan, notifikasi, payouts, refunds, pekerjaan, pengurusan, pengurusanDikonfirmasi };
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
    // Harga Khusus (ticket 30) is an audited staff write.
    audit: base.audit,
    documentPageUrl: (link) => `http://127.0.0.1:3000/dokumen/${link}`,
    publicDocumentUrl: (link) => `https://makam.test/dokumen/${link}`,
    paymentEffects: [efekJadwalkanPekerjaan({ db, inventory: base.inventory }), efekPencairanSaatLunas()],
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

/* The Mitra Jasa (ticket 55) */

/** One job, as the module that owns jobs would hand it over. */
export function newPekerjaan(overrides: Partial<PekerjaanMitraJasa> & { id: string }): PekerjaanMitraJasa {
  return {
    status: "dijadwalkan",
    targetDate: "2026-10-05",
    dihitungPada: null,
    terlambat: false,
    keluhanUpheld: false,
    ditolak: false,
    tidakDirespons: false,
    penilaian: null,
    ...overrides,
  };
}

/**
 * The job port with an in-memory list: what a test seeds, and what a release comes
 * off. `gagalLepas` makes the next release fail, so a test can see that a status
 * change which cannot take a job off leaves the status alone.
 */
export function newPekerjaanMitraJasaPort() {
  const pekerjaan: { mitraJasaId: string; job: PekerjaanMitraJasa }[] = [];
  /** Every release a status change asked for, with the reason it gave. */
  const dilepas: { pekerjaanId: string; alasan: string }[] = [];
  let gagalLepas = false;
  const port: PekerjaanMitraJasaPort & {
    seed: (mitraJasaId: string, jobs: PekerjaanMitraJasa[]) => void;
    dilepas: typeof dilepas;
    gagalLepas: (ya: boolean) => void;
  } = {
    async daftarPekerjaan(mitraJasaId) {
      return pekerjaan.filter((satu) => satu.mitraJasaId === mitraJasaId).map((satu) => satu.job);
    },
    async jumlahSelesai(ids) {
      return Object.fromEntries(
        ids.map((id) => [id, pekerjaan.filter((satu) => satu.mitraJasaId === id && satu.job.status === "selesai").length]),
      );
    },
    async lepasPekerjaan(input) {
      const satu = pekerjaan.find((satu) => satu.job.id === input.pekerjaanId);
      if (!satu || gagalLepas) return { ok: false, reason: "tidak_ditemukan" };
      dilepas.push(input);
      return { ok: true };
    },
    within() {
      return port;
    },
    seed(mitraJasaId, jobs) {
      pekerjaan.push(...jobs.map((job) => ({ mitraJasaId, job })));
    },
    dilepas,
    gagalLepas: (ya) => {
      gagalLepas = ya;
    },
  };
  return port;
}

/** How many Layanan the fixtures have made, so each is named after its own. */
let layananBerikut = 0;

/** A NIK for a fixture, 16 digits and different on every call: the NIK is unique in the database. */
let nikBerikut = 1;
export function nikFixture(): string {
  nikBerikut += 1;
  return `320101450390${String(nikBerikut).padStart(4, "0")}`;
}

/** A Mitra Jasa's profile, typed as Admin Platform's onboarding form types it. */
export function newMitraJasaInput(overrides: Record<string, unknown> = {}) {
  return {
    namaLengkap: "Siti Rahayu",
    nik: nikFixture(),
    area: "Jakarta Timur",
    kontakSiagaNama: null,
    kontakSiagaTelepon: null,
    ...overrides,
  };
}

/** The account holder that matches the profile's KTP name, so the bank rule passes without an override. */
export function rekeningSesuaiKtp(namaLengkap: string, overrides: Record<string, unknown> = {}) {
  return { bankName: "BSI", accountNumber: "7123456789", accountHolder: namaLengkap, catatanOverride: null, ...overrides };
}

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);
const pdf = () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);

/**
 * A Mitra Jasa onboarded all the way to complete, through the module's own writes
 * and its own files: the profile, the three files, the bank account in the KTP
 * name, the coverage lists, and a signed-in Akun holding the role (the Undangan
 * Staf the profile's email is addressed to).
 */
export async function mitraJasaLengkap(
  setup: LayananSetup,
  admin: Actor,
  options: { email?: string; tpuDkiId?: string; layananVariantId?: string; namaLengkap?: string } = {},
) {
  const email = options.email ?? "mitra.jasa@contoh.id";
  const namaLengkap = options.namaLengkap ?? "Siti Rahayu";
  const dibuat = await setup.layanan.buatMitraJasa(admin, email, newMitraJasaInput({ namaLengkap }));
  if (!dibuat.ok) throw new Error(`Mitra Jasa refused: ${dibuat.reason}`);
  const id = dibuat.mitraJasaId;
  for (const jenis of ["ktp", "foto"] as const) {
    const uploaded = await setup.layanan.unggahBerkas(admin, id, { jenis, file: { body: jpeg(), contentType: "image/jpeg" } });
    if (!uploaded.ok) throw new Error(`berkas ${jenis} refused: ${uploaded.reason}`);
  }
  const perjanjian = await setup.layanan.unggahBerkas(admin, id, {
    jenis: "perjanjian",
    file: { body: pdf(), contentType: "application/pdf" },
    signedOn: "2026-09-20",
  });
  if (!perjanjian.ok) throw new Error(`perjanjian refused: ${perjanjian.reason}`);
  const rekening = await setup.layanan.ubahRekening(admin, id, rekeningSesuaiKtp(namaLengkap));
  if (!rekening.ok) throw new Error(`rekening refused: ${rekening.reason}`);
  // A Layanan of its own, named so a test that already has one in the catalog does not collide.
  layananBerikut += 1;
  const variant = options.layananVariantId ?? (await newLayananFor(setup, admin, { name: `Layanan ${layananBerikut}` })).varian.id;
  const coverage = await setup.layanan.ubahCoverage(admin, id, {
    tpuDkiIds: options.tpuDkiId ? [options.tpuDkiId] : [],
    layananVariantIds: [variant],
  });
  if (!coverage.ok) throw new Error(`coverage refused: ${coverage.reason}`);
  return { id, email, namaLengkap, layananVariantId: variant };
}

/** A Mitra Jasa signed in on its own Akun, having accepted the Undangan Staf. */
export async function signedInMitraJasa(setup: LayananSetup, admin: Actor, email = "mitra.jasa@contoh.id") {
  const invited = await setup.identity.inviteStaff(admin, { email, phoneNumber: "085555555555", role: "mitra_jasa" });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  const actor = await actorOf(setup.identity, (await logIn(setup, email)).cookies);
  return actor;
}

/** A job `hari` days before `now` (the fake Clock), finished, with the given flags. */
export function pekerjaanSelesai(hari: number, now: Date, overrides: Partial<PekerjaanMitraJasa> = {}): PekerjaanMitraJasa {
  const dihitungPada = new Date(now.getTime() - hari * 86_400_000);
  return newPekerjaan({
    id: `job-${hari}-${overrides.penilaian ?? 0}`,
    status: "selesai",
    targetDate: wibTanggal(dihitungPada),
    dihitungPada,
    ...overrides,
  });
}

function wibTanggal(instant: Date): string {
  const shifted = new Date(instant.getTime() + 7 * 3_600_000);
  return shifted.toISOString().slice(0, 10);
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

/**
 * A grave whose Hak Pakai the Admin Lokasi has still to complete: the Blok's
 * second Petak, cleared *occupied* as **"data menyusul"**, which is exactly how a
 * Hak Pakai comes out flagged (spec, Inventory: an imported or "data menyusul"
 * Hak Pakai with a missing Pemegang Hak contact or tenure). It is the state AC 1's
 * second half is about, reached through the module's own public clearing flow
 * rather than by writing the flag onto a row.
 */
export async function petakPerluVerifikasi(setup: LayananSetup, lokasi: LokasiDenganLayanan) {
  const diberikan = await setup.inventory.clearPetak(lokasi.adminLokasi, lokasi.lokasiMitra.id, lokasi.petak[1].id, {
    mode: "terisi",
    dataMenyusul: true,
  });
  if (!diberikan.ok) throw new Error(`clearPetak refused: ${diberikan.reason}`);
  if (diberikan.hakPakaiId === null) throw new Error("clearPetak granted no Hak Pakai");
  return { petakId: lokasi.petak[1].id, nomor: lokasi.petak[1].nomorMakam, hakPakaiId: diberikan.hakPakaiId };
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

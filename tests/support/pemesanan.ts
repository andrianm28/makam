import { FakePdfRenderer } from "@/adapters/memory";
import { composeLayanan } from "@/composition/layanan";
import { composePemesanan } from "@/composition/pemesanan";
import { pemilikPesananDari, refundsTertunda } from "@/composition/refunds";
import type { Database } from "@/db/client";
import { createBilling } from "@/domain/billing";
import type { Actor } from "@/domain/identity";
import { efekBuktiPembayaran } from "@/domain/notifications";
import { efekBuktiPemesanan } from "@/domain/pemesanan";
import type {
  CalonPenghuniBerubah,
  PesananAlternatifDitawarkan,
  ChasingDijadwalkan,
  PemesananBuktiPemesanan,
  PemesananDiajukan,
  PesananDibatalkan,
  PemesananDikonfirmasi,
  PesananDitolak,
  PemesananNotifikasi,
  TerencanaDiajukan,
} from "@/domain/pemesanan";
import { createPengurusan } from "@/domain/pengurusan";
import { createPerpanjangan } from "@/domain/perpanjangan";
import { createQueues } from "@/domain/queues";
import { createRefunds } from "@/domain/refunds";
import type {
  PembatalanTerencanaInput,
  PengurusanDikonfirmasiInput,
  TerencanaBatasBayarLewatInput,
  TerencanaBuktiInput,
  TerencanaDikonfirmasiInput,
  TerencanaDitolakInput,
} from "@/domain/notifications";
import { masaPembatalanDimulai } from "@/domain/payouts";
import { efekPencairanSaatLunas } from "@/domain/payouts/efek";
import { PENGATURAN_OPERATOR, TEST_PUBLIC_ORIGIN } from "./billing";
import { cellsOf } from "./inventory";
import { actorOf, adminPlatformOf, logIn, nextTestIp } from "./identity";
import { payoutsFor } from "./payouts";
import { jenisMakamInput, publishOnTestDatabase } from "./publish";
import type { TerencanaLokasi } from "./terencana";
import { layananHariHKosong } from "./layanan-hari-h-kosong";

/** The publish fixture's Kunjungan Verifikasi photo, as a real upload is. */
const fotoLokasi = new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);

/**
 * Lokasi, Tariffs, Inventory, Field Work, Billing and Pemesanan together on the
 * test Postgres, sharing one fake Clock, FileStore, Identity, Audit Log and
 * Notifications. Every announcement the Pemesanan module makes is collected in
 * `diumumkan`, standing in for the Notifications module the wizard hands it in
 * production.
 */
export function pemesananOnTestDatabase(
  db: Database,
  options: { notifications?: boolean; hasLoggedCall?: (tagihanId: string) => Promise<boolean> } = {},
) {
  const setup = publishOnTestDatabase(db);
  const diumumkan: PemesananDiajukan[] = [];
  /** Every confirmation the Pemesanan module announced, for a test that reads the family message. */
  const dikonfirmasi: PemesananDikonfirmasi[] = [];
  /** Every Bukti Pemesanan the Pemesanan module announced (ticket 25). */
  const buktiPemesanan: PemesananBuktiPemesanan[] = [];
  const terencana: TerencanaDiajukan[] = [];
  /** What the Terencana order's own messages announced (ticket 37), for a test that reads the family message. */
  const terencanaDikonfirmasi: TerencanaDikonfirmasiInput[] = [];
  const terencanaDitolak: TerencanaDitolakInput[] = [];
  const terencanaBatasBayarLewat: TerencanaBatasBayarLewatInput[] = [];
  const terencanaBukti: TerencanaBuktiInput[] = [];
  /** What a Pembatalan's answers announced (ticket 38), for a test that reads the family message. */
  const pembatalanTerencana: PembatalanTerencanaInput[] = [];
  /** Every Calon Penghuni label change the module announced (ticket 39). */
  const calonPenghuni: CalonPenghuniBerubah[] = [];
  /** Every decline, alternative and cancellation the module announced, for a test that reads the family message. */
  const ditolak: PesananDitolak[] = [];
  const alternatif: PesananAlternatifDitawarkan[] = [];
  const dibatalkan: PesananDibatalkan[] = [];
  /** Every Saat Duka TPU confirmation the Pengurusan module announced. */
  const pengurusanDikonfirmasi: PengurusanDikonfirmasiInput[] = [];
  /** Every Chasing schedule the Pemesanan module announced, once a pay-after Tagihan's overdue anchor is known (ticket 29). */
  const chasingDijadwalkan: ChasingDijadwalkan[] = [];
  const terkumpul: PemesananNotifikasi = {
    tagihanTerbit: async () => ({ ok: true as const, diingatkan: 0 }),
    pesananDiajukan: async (order) => {
      diumumkan.push(order);
    },
    pesananBelumDikonfirmasi: async (order) => {
      diumumkan.push(order);
    },
    pesananDikonfirmasi: async (hasil) => {
      dikonfirmasi.push(hasil);
    },
    pesananDitolak: async (hasil) => {
      ditolak.push(hasil);
    },
    pesananAlternatifDitawarkan: async (hasil) => {
      alternatif.push(hasil);
    },
    pesananDibatalkan: async (hasil) => {
      dibatalkan.push(hasil);
    },
    pesananBuktiPemesanan: async (hasil) => {
      buktiPemesanan.push(hasil);
    },
    terencanaDiajukan: async (order) => {
      terencana.push(order);
    },
    terencanaDikonfirmasi: async (_tx, input) => {
      terencanaDikonfirmasi.push(input);
    },
    terencanaDitolak: async (_tx, input) => {
      terencanaDitolak.push(input);
    },
    terencanaBatasBayarLewat: async (_tx, input) => {
      terencanaBatasBayarLewat.push(input);
    },
    terencanaBukti: async (_tx, input) => {
      terencanaBukti.push(input);
    },
    pembatalanTerencana: async (_tx, input) => {
      pembatalanTerencana.push(input);
    },
    calonPenghuniBerubah: async (input) => {
      calonPenghuni.push(input);
    },
    tidakTertagihDinyatakan: async () => {},
    chasingDijadwalkan: async (input) => {
      chasingDijadwalkan.push(input);
    },
  };
  // Billing composed the way the runtime composes it (src/server/runtime.ts): with its
  // payment effects registered, so a payment that settles an order issues its Bukti
  // Pemesanan and makes the order Selesai exactly as it does in production.
  const deps = {
    db,
    clock: setup.clock,
    operatorSettings: setup.operatorSettings,
    pdf: new FakePdfRenderer(),
    payments: setup.payments,
    documentPageUrl: (link: string) => `http://127.0.0.1:3000/dokumen/${link}`,
    publicDocumentUrl: (link: string) => `https://makam.test/dokumen/${link}`,
    reportError: (error: unknown, context: Record<string, unknown>) => setup.reportedErrors.push({ error, context }),
    // Harga Khusus (ticket 30) is an audited staff write, and its reissued Tagihan is announced in its own transaction.
    audit: setup.audit,
    files: setup.files,
    umumkanTagihanPengganti: options.notifications
      ? (tx: Database, input: Parameters<typeof setup.notifications.tagihanTerbitPengganti>[0]) => setup.notifications.tagihanTerbitPengganti(input, tx)
      : undefined,
    // The runtime wires Billing's "a call was logged" guard to Notifications' own call log (ticket 29).
    hasLoggedCall: options.notifications
      ? (tagihanId: string) => setup.notifications.teleponPemesanTercatat("tagihan", tagihanId)
      : options.hasLoggedCall,
  };
  const billing = createBilling({
    ...deps,
    paymentEffects: [
      efekBuktiPembayaran({ clock: setup.clock, dokumenUrl: deps.publicDocumentUrl }),
      // The Lunas half of the Pencairan trigger, as the runtime registers it (ticket 32), so a test of a paid
      // Pemesanan Terencana's Pencairan (ticket 37) pays through the real module.
      efekPencairanSaatLunas(),
      efekBuktiPemesanan({
        clock: setup.clock,
        billingOn: (tx) => createBilling({ ...deps, db: tx }),
        inventory: setup.inventory,
        lokasi: setup.lokasi,
        notifikasi: terkumpul,
        pencairan: { masaPembatalanDimulai },
      }),
    ],
  });
  // The Pemakaman a recording tells Payouts (ticket 90): the real module on the same database.
  const { payouts } = payoutsFor(setup);
  // Refunds asks Pemesanan who placed an order, and Pemesanan asks Refunds for the refund of a Pembatalan (ticket 38).
  const refundsMenunggu = refundsTertunda();
  const pemesanan = composePemesanan({
    db,
    clock: setup.clock,
    files: setup.files,
    audit: setup.audit,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    inventory: setup.inventory,
    billing,
    payouts,
    refunds: refundsMenunggu.refunds,
    identity: setup.identity,
    notifikasi: options.notifications ? undefined : terkumpul,
    notifications: options.notifications ? setup.notifications : undefined,
  });
  // The wizard's first screen is the combined Lokasi Mitra / TPU list, so a
  // wizard fixture has both modules: the Pengurusan module reads the TPU list and
  // the TPU prices the section shows, and shares everything else with this one.
  const pengurusan = createPengurusan({
    db,
    clock: setup.clock,
    files: setup.files,
    audit: setup.audit,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    billing,
    identity: setup.identity,
    fieldwork: setup.fieldwork,
    layanan: layananHariHKosong,
    notifikasi: {
      tagihanTerbit: async () => ({ ok: true as const, diingatkan: 0 }),
      pengurusanDikonfirmasi: async (hasil) => {
        pengurusanDikonfirmasi.push(hasil);
        return { ok: true };
      },
    },
  });
  const refunds = createRefunds({
    db,
    clock: setup.clock,
    audit: setup.audit,
    files: setup.files,
    lokasi: setup.lokasi,
    billing,
    payouts,
    notifications: setup.notifications,
    operatorSettings: setup.operatorSettings,
    buktiUrl: (link) => `${TEST_PUBLIC_ORIGIN}/dokumen/${link}`,
    pemilikPesanan: pemilikPesananDari(pemesanan),
  });
  refundsMenunggu.sambungkan(refunds);
  // The Antrean beside them, for a test of the Pembatalan rows (ticket 38): the Antrean Lokasi's own and Admin Platform's Tier 3.
  const layanan = composeLayanan({
    db,
    clock: setup.clock,
    files: setup.files,
    audit: setup.audit,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    inventory: setup.inventory,
    billing,
    identity: setup.identity,
    refunds,
    payouts,
    notifications: setup.notifications,
  });
  const perpanjangan = createPerpanjangan({
    db,
    clock: setup.clock,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    inventory: setup.inventory,
    billing,
    pemesanan,
    identity: setup.identity,
    files: setup.files,
    audit: setup.audit,
    notifikasi: setup.notifications,
  });
  const queues = createQueues({
    db,
    clock: setup.clock,
    audit: setup.audit,
    identity: setup.identity,
    lokasi: setup.lokasi,
    fieldwork: setup.fieldwork,
    billing,
    notifications: setup.notifications,
    inventory: setup.inventory,
    pemesanan,
    layanan,
    payouts,
    pengurusan,
    perpanjangan,
    refunds,
  });
  return {
    ...setup,
    billing,
    pemesanan,
    pengurusan,
    payouts,
    refunds,
    queues,
    diumumkan,
    dikonfirmasi,
    buktiPemesanan,
    ditolak,
    alternatif,
    dibatalkan,
    terencana,
    terencanaDikonfirmasi,
    terencanaDitolak,
    terencanaBatasBayarLewat,
    terencanaBukti,
    pembatalanTerencana,
    calonPenghuni,
    notifikasi: terkumpul,
    pengurusanDikonfirmasi,
    chasingDijadwalkan,
  };
}

export type PemesananSetup = ReturnType<typeof pemesananOnTestDatabase>;

/**
 * What the fixtures below need from a setup: the modules, without the
 * announcement collectors (a setup that composes the Pemesanan module itself,
 * as the Antrean Lokasi's tests do, has its own).
 */
export type PemesananModul = Omit<
  PemesananSetup,
  | "diumumkan"
  | "dikonfirmasi"
  | "buktiPemesanan"
  | "ditolak"
  | "alternatif"
  | "dibatalkan"
  | "terencana"
  | "terencanaDikonfirmasi"
  | "terencanaDitolak"
  | "terencanaBatasBayarLewat"
  | "terencanaBukti"
  | "pembatalanTerencana"
  | "calonPenghuni"
  | "notifikasi"
  | "pengurusanDikonfirmasi"
  | "chasingDijadwalkan"
  | "payouts"
  | "refunds"
  | "queues"
>;

/**
 * Pengaturan Operator entered by the first Admin Platform, as every document
 * needs before one can be issued: a confirmation issues a Tagihan, so a test
 * that confirms needs this first.
 */
export async function siapkanOperatorPemesanan(setup: PemesananModul) {
  const { actor: admin } = await adminPlatform(setup);
  const changed = await setup.operatorSettings.change(admin, { ...PENGATURAN_OPERATOR, reason: null });
  if (!changed.ok) throw new Error(`Pengaturan Operator refused: ${changed.reason}`);
  return admin;
}

/** The ids of the Petak Makam and Kavling Keluarga the Terencana fixture's Denah shows, by the number they are known by. */
export async function unitIds(setup: PemesananSetup, fixture: TerencanaLokasi, nomor: readonly string[]): Promise<Record<string, string>> {
  const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
  const cells = denah?.bloks.flatMap((blok) => blok.cells) ?? [];
  const kavling = denah?.bloks.flatMap((blok) => blok.kavling) ?? [];
  const found = await Promise.all(
    nomor.map(async (satu) => {
      const id = cells.find((cell) => cell.nomorMakam === satu)?.id ?? kavling.find((satu2) => satu2.nomorKavling === satu)?.id;
      if (!id) throw new Error(`no unit ${satu}`);
      return [satu, id] as const;
    }),
  );
  return Object.fromEntries(found);
}

/**
 * The one Admin Platform a setup's fixtures act as. The cache lives in the shared
 * identity fixture, as `adminPlatformOf`: ticket 23 kept a second WeakMap here,
 * and two caches over one seed means whichever misses second is refused with
 * `admin_platform_sudah_ada`. One cache, in one place, is the whole point.
 */
function adminPlatform(setup: PemesananModul) {
  return adminPlatformOf(setup);
}

/** The one PetugasLapangan of a setup: a Kode Masuk is sent at most once a minute per email. */
const petugasCache = new WeakMap<object, Promise<Actor>>();
function petugasLapangan(setup: PemesananModul, admin: Actor) {
  let cached = petugasCache.get(setup);
  if (!cached) {
    cached = (async () => {
      const invited = await setup.identity.inviteStaff(admin, {
        email: "petugas.lapangan@contoh.id",
        phoneNumber: "084444444444",
        role: "petugas_lapangan",
      });
      if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
      const { cookies } = await logIn(setup, "petugas.lapangan@contoh.id");
      return actorOf(setup.identity, cookies);
    })();
    petugasCache.set(setup, cached);
  }
  return cached;
}

/** One Admin Lokasi per Lokasi Mitra, each with its own email: a role is granted at the login that accepts its invite, so a second Lokasi needs a second Akun. */
type PeranAdminLokasi = { actor: Actor; cookies: string };
const adminLokasiCache = new WeakMap<object, Map<string, Promise<PeranAdminLokasi>>>();
function adminLokasiOf(setup: PemesananModul, admin: Actor, lokasiId: string) {
  const cache = adminLokasiCache.get(setup) ?? new Map<string, Promise<PeranAdminLokasi>>();
  adminLokasiCache.set(setup, cache);
  const cached = cache.get(lokasiId);
  if (cached) return cached;
  const dibuat = (async (): Promise<PeranAdminLokasi> => {
    const nomor = cache.size + 1;
    const email = `lokasi.saat-duka-${nomor}@contoh.id`;
    const phoneNumber = `08333333333${nomor}`;
    const invited = await setup.lokasi.inviteAdminLokasi(admin, lokasiId, { email, phoneNumber });
    if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
    const { cookies } = await logIn(setup, email);
    return { actor: await actorOf(setup.identity, cookies), cookies };
  })();
  cache.set(lokasiId, dibuat);
  return dibuat;
}

export interface LokasiOptions {
  /** Defaults to "Makam Wakaf Al-Ikhlas". */
  name?: string;
  /** Defaults to "Kota Jakarta Timur". */
  city?: string;
  /** The Harga Hak Pakai of its Jenis Makam; defaults to Rp 7.500.000. */
  hargaHakPakai?: number;
  /** Cleared Tersedia Petak of that Jenis Makam; `0` for a Lokasi with no plot yet. */
  petak?: { rows: number; cols: number };
}

/**
 * A Terverifikasi Lokasi Mitra with a priced Jenis Makam, a Blok of cleared
 * Tersedia Petak of it and Jam Operasional 07:00–15:00 WIB (Monday–Friday):
 * everything the Saat Duka list needs to offer it. The fake Clock sits at
 * Thursday 2026-10-01 09:00 WIB, inside those hours.
 */
export async function terverifikasiLokasi(setup: PemesananModul, options: LokasiOptions = {}) {
  const { actor: admin } = await adminPlatform(setup);
  const dibuat = await setup.lokasi.createLokasiMitra(admin, {
    name: options.name ?? "Makam Wakaf Al-Ikhlas",
    pengelolaName: "Yayasan Al-Ikhlas",
    address: "Jl. Raya Pondok Rangon No. 1",
    city: options.city ?? "Kota Jakarta Timur",
  });
  if (!dibuat.ok) throw new Error(`Lokasi Mitra refused: ${dibuat.reason}`);
  const lokasiMitra = dibuat.lokasiMitra;
  const { actor: adminLokasi } = await adminLokasiOf(setup, admin, lokasiMitra.id);
  const petugas = await petugasLapangan(setup, admin);
  const jenisMakam = await hargaDanJam(setup, admin, lokasiMitra.id, options);
  await prasyaratPublikasi(setup, admin, adminLokasi, petugas, lokasiMitra.id);
  await terbitkan(setup, admin, lokasiMitra.id);
  const petak = options.petak === undefined ? { rows: 2, cols: 2 } : options.petak;
  return { admin, adminLokasi, petugas, jenisMakam, lokasiMitra, blok: await blokTersedia(setup, adminLokasi, lokasiMitra.id, jenisMakam.id, petak) };
}

/** The agreement, the Jam Operasional, the Kontak Siaga and the Kunjungan Verifikasi the listing gate needs. */
async function prasyaratPublikasi(setup: PemesananModul, admin: Actor, adminLokasi: Actor, petugas: Actor, lokasiId: string) {
  const agreement = await setup.lokasi.uploadAgreement(admin, lokasiId, {
    scan: { body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]), contentType: "application/pdf" },
    signedOn: "2026-09-01",
  });
  if (!agreement.ok) throw new Error(`agreement refused: ${agreement.reason}`);
  const jam = await setup.lokasi.setJamOperasional(admin, lokasiId, jamOperasional);
  if (!jam.ok) throw new Error(`jam operasional refused: ${jam.reason}`);
  const kontak = await setup.lokasi.pickKontakSiaga(admin, lokasiId, { accountId: adminLokasi.accountId });
  if (!kontak.ok) throw new Error(`kontak siaga refused: ${kontak.reason}`);
  const tugas = await setup.fieldwork.createTugasLapangan(admin, {
    type: "kunjungan_verifikasi",
    subject: "Kunjungan Verifikasi",
    lokasiId,
    address: "Jl. Raya Pondok Rangon No. 1",
    pin: { lat: -6.29, lng: 106.9 },
    plannedDate: "2026-10-05",
    assigneeAccountId: petugas.accountId,
  });
  if (!tugas.ok) throw new Error(`tugas lapangan refused: ${tugas.reason}`);
  const selesai = await setup.fieldwork.completeTugasLapangan(petugas, tugas.tugasLapangan.id, {
    form: { addressConfirmed: true, pin: { lat: -6.301, lng: 106.901 }, facilities: { checked: ["parkir"], note: "" }, note: "Sesuai" },
    uploads: [{ kind: "foto_lokasi", file: { body: fotoLokasi, contentType: "image/jpeg" } }],
  });
  if (!selesai.ok) throw new Error(`kunjungan verifikasi refused: ${selesai.reason}`);
}

/** The Jenis Makam, the Biaya Pemakaman and the Biaya Layanan Platform the all-in total is priced from. */
async function hargaDanJam(setup: PemesananModul, admin: Actor, lokasiId: string, options: LokasiOptions) {
  const jenis = await setup.tariffs.createJenisMakam(admin, lokasiId, {
    ...jenisMakamInput(),
    tariff: {
      hargaHakPakai: options.hargaHakPakai ?? 7_500_000,
      tenure: { kind: "tahun" as const, years: 5 },
      hargaPerpanjangan: 3_000_000,
      effectiveOn: "2026-10-01",
    },
  });
  if (!jenis.ok) throw new Error(`jenis makam refused: ${jenis.reason}`);
  const pemakaman = await setup.tariffs.setBiayaPemakaman(admin, lokasiId, {
    biayaPemakaman: 2_000_000,
    biayaPemakamanTumpang: null,
    effectiveOn: "2026-10-01",
    reason: null,
  });
  if (!pemakaman.ok) throw new Error(`biaya pemakaman refused: ${pemakaman.reason}`);
  const platform = await setup.tariffs.setGlobalTariff(admin, {
    key: "biaya_layanan_platform",
    amount: 150_000,
    effectiveOn: "2026-10-01",
    reason: null,
  });
  if (!platform.ok) throw new Error(`biaya layanan platform refused: ${platform.reason}`);
  return jenis.jenisMakam;
}

/** Marks the tariffs "diperiksa" and takes the Lokasi Mitra to Terverifikasi. */
async function terbitkan(setup: PemesananModul, admin: Actor, lokasiId: string) {
  const checked = await setup.tariffs.markTariffsChecked(admin, lokasiId, { reason: null });
  if (!checked.ok) throw new Error(`tarif diperiksa refused: ${checked.reason}`);
  const fakta = await setup.tariffs.asStaff(admin).tariffsChecked(lokasiId);
  const published = await setup.lokasi.publish(admin, lokasiId, { tariffsChecked: fakta && { changedSinceCheck: fakta.changedSinceCheck } });
  if (!published.ok) throw new Error(`publish refused: ${JSON.stringify(published)}`);
}

const jamBuka = { opens: "07:00", closes: "15:00" };
const jamOperasional = {
  weekly: {
    monday: jamBuka,
    tuesday: jamBuka,
    wednesday: jamBuka,
    thursday: jamBuka,
    friday: jamBuka,
    saturday: jamBuka,
    sunday: null,
  },
  tanggalTutup: [],
};

/** A Blok of that Jenis Makam with every Petak cleared Tersedia, as a freshly drawn Denah is not. */
async function blokTersedia(
  setup: PemesananModul,
  adminLokasi: Actor,
  lokasiId: string,
  jenisMakamId: string,
  size: { rows: number; cols: number },
) {
  if (size.rows === 0 || size.cols === 0) return null;
  const dibuat = await setup.inventory.createBlok(adminLokasi, lokasiId, { name: "A", rows: size.rows, cols: size.cols, jenisMakamId });
  if (!dibuat.ok) throw new Error(`Blok refused: ${dibuat.reason}`);
  for (const cell of await cellsOf(setup, adminLokasi, lokasiId, dibuat.blok.id)) {
    const cleared = await setup.inventory.clearPetak(adminLokasi, lokasiId, cell.id, { mode: "tersedia" });
    if (!cleared.ok) throw new Error(`clearPetak refused: ${cleared.reason}`);
  }
  return dibuat.blok;
}

/** A Lokasi Mitra still Belum Tayang: never listed, so it never appears in the wizard. */
export async function belumTeverifikasiLokasi(setup: PemesananModul, name = "Makam Sawah Besar") {
  const { actor: admin } = await adminPlatform(setup);
  const dibuat = await setup.lokasi.createLokasiMitra(admin, {
    name,
    pengelolaName: "Yayasan Sawah Besar",
    address: "Jl. Sawah No. 3",
    city: "Kabupaten Bekasi",
  });
  if (!dibuat.ok) throw new Error(`Lokasi Mitra refused: ${dibuat.reason}`);
  return { admin, lokasiMitra: dibuat.lokasiMitra };
}

/**
 * A Pemesan with a proven email: a Kode Masuk created the Akun, as it does at
 * Kirim, with `name` the name "Data & kirim" held. It needs only the Clock, the
 * Identity module and the fake EmailSender, so the Pengurusan module's setup uses
 * this too.
 */
export async function pemesanDenganEmail(setup: Pick<PemesananSetup, "clock" | "identity" | "email">, email: string, name?: string) {  let sent = await setup.identity.requestKodeMasuk({ email, ip: nextTestIp() });
  // A second login to the same email within 60 s waits for "Kirim ulang", as a person would.
  if (!sent.ok && sent.reason === "tunggu_kirim_ulang") {
    setup.clock.set(sent.retryAt);
    sent = await setup.identity.requestKodeMasuk({ email, ip: nextTestIp() });
  }
  if (!sent.ok) throw new Error(`Kode Masuk not sent: ${sent.reason}`);
  const code = setup.email.sent.filter((message) => message.to === sent.email).at(-1)?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error("no Kode Masuk was sent");
  const login = await setup.identity.verifyKodeMasuk(name === undefined ? { email, code } : { email, code, name });
  if (!login.ok) throw new Error(`login failed: ${login.reason}`);
  return { pemesan: { accountId: login.account.id, email: login.account.email } };
}

/** A Lokasi Mitra the list offers, and a Pemesan to order from it. */
export async function saatDukaFixture(setup: PemesananModul, options: LokasiOptions & { email?: string } = {}) {
  const lokasi = await terverifikasiLokasi(setup, options);
  const pemesan = await pemesanDenganEmail(setup, options.email ?? "pemesan@contoh.id");
  return { ...lokasi, pemesan: pemesan.pemesan };
}

/** What the wizard's Kirim sends: a family after a death, at the chosen Lokasi Mitra. */
export function orderSaatDuka(lokasi: Awaited<ReturnType<typeof saatDukaFixture>>) {
  return {
    pemesan: lokasi.pemesan,
    pemesanName: "Budi Santoso",
    phoneNumber: "081234567890",
    lokasiId: lokasi.lokasiMitra.id,
    jenisMakamId: lokasi.jenisMakam.id,
    almarhumName: "Siti Aminah",
    tanggalWafat: "2026-09-30",
    rencanaPemakamanAt: "",
    keinginanPenempatan: "",
    pemegangHak: { mode: "pemesan" as const },
  };
}

export { jenisMakamInput } from "./publish";
export { logIn } from "./identity";
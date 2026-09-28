import { FakePaymentProvider, FakePdfRenderer, FakeWebPush } from "@/adapters/memory";
import type { Database } from "@/db/client";
import { createBilling, type PaymentEffect } from "@/domain/billing";
import type { Actor } from "@/domain/identity";
import { createFieldwork } from "@/domain/fieldwork";
import { createNotifications } from "@/domain/notifications";
import { createOperatorSettings } from "@/domain/operator-settings";
import { logIn } from "./identity";
import { inventoryOnTestDatabase, jenisMakamInput, newLokasiMitra } from "./inventory";
import { signedInAdminLokasi } from "./lokasi";

/**
 * Lokasi, Tariffs, Inventory, Field Work and Billing together on the test
 * Postgres, sharing one fake Clock, FileStore, Identity and Audit Log (ticket
 * 16: the publish gate and Terencana switch compose the first four; ticket
 * 17's Tier 2 Pembayaran Perlu Ditinjau row needs Billing too).
 */
export interface PublishOptions {
  /**
   * The downstream effects of a payment this Billing runs, for a test that
   * composes a module which registers one of its own (ticket 32's Pencairan
   * effect takes no dependencies, so it can be listed before the module that
   * also needs this Billing exists).
   */
  paymentEffects?: PaymentEffect[];
}

export function publishOnTestDatabase(db: Database, options: PublishOptions = {}) {
  const setup = inventoryOnTestDatabase(db);
  const webPush = new FakeWebPush();
  const operatorSettings = createOperatorSettings({ db, clock: setup.clock, audit: setup.audit });
  const payments = new FakePaymentProvider({ clock: setup.clock });
  const reportedErrors: { error: unknown; context: Record<string, unknown> }[] = [];
  const billing = createBilling({
    db,
    clock: setup.clock,
    operatorSettings,
    pdf: new FakePdfRenderer(),
    payments,
    documentPageUrl: (link) => `http://127.0.0.1:3000/dokumen/${link}`,
    publicDocumentUrl: (link) => `https://makam.test/dokumen/${link}`,
    paymentEffects: options.paymentEffects,
    reportError: (error, context) => reportedErrors.push({ error, context }),
  });
  const notifications = createNotifications({
    db,
    clock: setup.clock,
    email: setup.email,
    webPush,
    identity: setup.identity,
    audit: setup.audit,
    reportError: () => {},
    tagihan: billing,
    dokumenUrl: (link) => `https://makam.test/dokumen/${link}`,
    pesananUrl: (nomor) => `https://makam.test/pesanan/${nomor}`,
    pesanUlangUrl: (nomor) => `https://makam.test/pesan-makam/saat-duka?dari=${nomor}`,
    pengurusanUrl: (nomor) => `https://makam.test/pengurusan/${nomor}`,
  });
  const fieldwork = createFieldwork({
    db,
    clock: setup.clock,
    files: setup.files,
    audit: setup.audit,
    identity: setup.identity,
    notifications,
    lokasi: setup.lokasi,
    // Billing sits beside it, so the Tier 3 "Setor Retribusi" row and the
    // payment that closes it see the same Tagihan the rest of the setup does.
    billing,
  });
  return { db, ...setup, notifications, webPush, fieldwork, operatorSettings, payments, reportedErrors, billing };
}

export type PublishSetup = ReturnType<typeof publishOnTestDatabase>;

export { jenisMakamInput, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "./inventory";
export { newTpuDki } from "./lokasi";

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);

const openHours = { opens: "07:00", closes: "15:00" };
export const readyJamOperasional = {
  weekly: {
    monday: openHours,
    tuesday: openHours,
    wednesday: openHours,
    thursday: openHours,
    friday: openHours,
    saturday: openHours,
    sunday: null,
  },
  tanggalTutup: [],
};

/** A Petugas Lapangan, invited by `admin` and logged in with a Kode Masuk. */
export async function signedInPetugasLapangan(setup: PublishSetup, admin: Actor, email = "petugas.lapangan@contoh.id") {
  const invited = await setup.identity.inviteStaff(admin, { email, phoneNumber: "084444444444", role: "petugas_lapangan" });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  const { cookies } = await logIn(setup, email);
  const actor = await setup.identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return actor;
}

export interface ReadyToPublishOptions {
  /** Its first Jenis Makam (markTariffsChecked needs at least one); defaults to `jenisMakamInput()`. */
  jenisMakam?: Parameters<PublishSetup["tariffs"]["createJenisMakam"]>[2];
  biayaPemakaman?: number;
  biayaLayananPlatform?: number;
}

/**
 * Every publish-gate fact filled through the module's own public functions
 * (agreement, Jam Operasional, Kontak Siaga, a completed Kunjungan
 * Verifikasi via Field Work, tariffs "diperiksa"): the usual starting point
 * for a publish test. Leaves the Lokasi Belum Tayang; the test itself calls `publish`.
 */
export async function readyToPublish(setup: PublishSetup, admin: Actor, lokasiId: string, options: ReadyToPublishOptions = {}) {
  const agreement = await setup.lokasi.uploadAgreement(admin, lokasiId, {
    scan: { body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]), contentType: "application/pdf" },
    signedOn: "2026-09-01",
  });
  if (!agreement.ok) throw new Error(`agreement refused: ${agreement.reason}`);

  const jam = await setup.lokasi.setJamOperasional(admin, lokasiId, readyJamOperasional);
  if (!jam.ok) throw new Error(`jam operasional refused: ${jam.reason}`);

  const adminLokasi = await signedInAdminLokasi(setup, admin, [lokasiId]);
  const pick = await setup.lokasi.pickKontakSiaga(admin, lokasiId, { accountId: adminLokasi.accountId });
  if (!pick.ok) throw new Error(`kontak siaga refused: ${pick.reason}`);

  const petugas = await signedInPetugasLapangan(setup, admin);
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
  const completed = await setup.fieldwork.completeTugasLapangan(petugas, tugas.tugasLapangan.id, {
    form: {
      addressConfirmed: true,
      pin: { lat: -6.301, lng: 106.901 },
      facilities: { checked: ["parkir"], note: "" },
      note: "Sesuai",
    },
    uploads: [{ kind: "foto_lokasi", file: { body: jpegBytes, contentType: "image/jpeg" } }],
  });
  if (!completed.ok) throw new Error(`kunjungan verifikasi refused: ${completed.reason}`);

  const jenisMakam = await setup.tariffs.createJenisMakam(admin, lokasiId, options.jenisMakam ?? jenisMakamInput());
  if (!jenisMakam.ok) throw new Error(`jenis makam refused: ${jenisMakam.reason}`);
  await setup.tariffs.setBiayaPemakaman(admin, lokasiId, {
    biayaPemakaman: options.biayaPemakaman ?? 2_000_000,
    biayaPemakamanTumpang: null,
    effectiveOn: "2026-10-01",
    reason: null,
  });
  await setup.tariffs.setGlobalTariff(admin, {
    key: "biaya_layanan_platform",
    amount: options.biayaLayananPlatform ?? 150_000,
    effectiveOn: "2026-10-01",
    reason: null,
  });
  const checked = await setup.tariffs.markTariffsChecked(admin, lokasiId, { reason: null });
  if (!checked.ok) throw new Error(`tarif diperiksa refused: ${JSON.stringify(checked)}`);

  return { adminLokasi, petugas, jenisMakam: jenisMakam.jenisMakam };
}

/**
 * The `tariffsChecked` fact `publish` needs, read the way a Server Action
 * would: through the Tariffs module's staff read (Admin Platform also sees a
 * Belum Tayang Lokasi, unlike the public one, which is what `publish` itself
 * needs before the Lokasi is Terverifikasi).
 */
export async function tariffsCheckedFact(setup: PublishSetup, by: Actor, lokasiId: string) {
  const checked = await setup.tariffs.asStaff(by).tariffsChecked(lokasiId);
  return checked && { changedSinceCheck: checked.changedSinceCheck };
}

/**
 * A new Lokasi Mitra, taken all the way to Terverifikasi through the real
 * publish path (`readyToPublish` + `lokasi.publish`), for tests that need a
 * listed Lokasi Mitra but are not themselves about the publish gate (e.g.
 * public pricing, public reads).
 */
export async function publishedLokasiMitra(setup: PublishSetup, admin: Actor, name?: string, options: ReadyToPublishOptions = {}) {
  const lokasiMitra = await newLokasiMitra(setup, admin, name);
  const ready = await readyToPublish(setup, admin, lokasiMitra.id, options);
  const tariffsChecked = await tariffsCheckedFact(setup, admin, lokasiMitra.id);
  const published = await setup.lokasi.publish(admin, lokasiMitra.id, { tariffsChecked });
  if (!published.ok) throw new Error(`publish refused: ${JSON.stringify(published)}`);
  return { lokasiMitra, ...ready };
}

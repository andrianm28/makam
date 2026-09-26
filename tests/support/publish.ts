import { FakeWebPush } from "@/adapters/memory";
import type { Database } from "@/db/client";
import type { Actor } from "@/domain/identity";
import { createFieldwork } from "@/domain/fieldwork";
import { createNotifications } from "@/domain/notifications";
import { logIn } from "./identity";
import { inventoryOnTestDatabase, jenisMakamInput } from "./inventory";
import { signedInAdminLokasi } from "./lokasi";

/**
 * Lokasi, Tariffs, Inventory and Field Work together on the test Postgres,
 * sharing one fake Clock, FileStore, Identity and Audit Log (ticket 16: the
 * publish gate and Terencana switch compose all four).
 */
export function publishOnTestDatabase(db: Database) {
  const setup = inventoryOnTestDatabase(db);
  const webPush = new FakeWebPush();
  const notifications = createNotifications({
    db,
    clock: setup.clock,
    email: setup.email,
    webPush,
    identity: setup.identity,
    audit: setup.audit,
    reportError: () => {},
  });
  const fieldwork = createFieldwork({
    db,
    clock: setup.clock,
    files: setup.files,
    audit: setup.audit,
    identity: setup.identity,
    notifications,
    lokasi: setup.lokasi,
  });
  return { ...setup, notifications, webPush, fieldwork };
}

export type PublishSetup = ReturnType<typeof publishOnTestDatabase>;

export { jenisMakamInput, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "./inventory";

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

/**
 * Every publish-gate fact filled through the module's own public functions
 * (agreement, Jam Operasional, Kontak Siaga, a completed Kunjungan
 * Verifikasi via Field Work, tariffs "diperiksa"): the usual starting point
 * for a publish test. Leaves the Lokasi Belum Tayang; the test itself calls `publish`.
 */
export async function readyToPublish(setup: PublishSetup, admin: Actor, lokasiId: string) {
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

  const jenisMakam = await setup.tariffs.createJenisMakam(admin, lokasiId, jenisMakamInput());
  if (!jenisMakam.ok) throw new Error(`jenis makam refused: ${jenisMakam.reason}`);
  await setup.tariffs.setBiayaPemakaman(admin, lokasiId, {
    biayaPemakaman: 2_000_000,
    biayaPemakamanTumpang: null,
    effectiveOn: "2026-10-01",
    reason: null,
  });
  await setup.tariffs.setGlobalTariff(admin, { key: "biaya_layanan_platform", amount: 150_000, effectiveOn: "2026-10-01", reason: null });
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

import { FakeWebPush } from "@/adapters/memory";
import type { Database } from "@/db/client";
import { createFieldwork } from "@/domain/fieldwork";
import type { Actor } from "@/domain/identity";
import { createNotifications } from "@/domain/notifications";
import { logIn } from "./identity";
import { lokasiOnTestDatabase } from "./lokasi";
import { TEST_PUBLIC_ORIGIN } from "./billing";
import { TAGIHAN_TIDAK_ADA } from "./notifications";

/**
 * The Field Work module next to Lokasi, identity and notifications on the
 * test Postgres, all sharing the one fake Clock, FileStore, Audit Log and
 * Identity module (so advancing the Clock or inviting staff is seen everywhere).
 */
export function fieldworkOnTestDatabase(db: Database) {
  const lokasiSetup = lokasiOnTestDatabase(db);
  const webPush = new FakeWebPush();
  const notifications = createNotifications({
    db,
    clock: lokasiSetup.clock,
    email: lokasiSetup.email,
    webPush,
    identity: lokasiSetup.identity,
    audit: lokasiSetup.audit,
    reportError: () => {},
    tagihan: TAGIHAN_TIDAK_ADA,
    dokumenUrl: (link) => `${TEST_PUBLIC_ORIGIN}/dokumen/${link}`,
    pesananUrl: (nomor) => `${TEST_PUBLIC_ORIGIN}/pesanan/${nomor}`,
  });
  const fieldwork = createFieldwork({
    db,
    clock: lokasiSetup.clock,
    files: lokasiSetup.files,
    audit: lokasiSetup.audit,
    identity: lokasiSetup.identity,
    notifications,
    lokasi: lokasiSetup.lokasi,
  });
  return { ...lokasiSetup, notifications, webPush, fieldwork };
}

export type FieldworkSetup = ReturnType<typeof fieldworkOnTestDatabase>;

/** A Petugas Lapangan Akun, invited by `admin` and logged in with a Kode Masuk. */
export async function signedInPetugasLapangan(
  setup: FieldworkSetup,
  admin: Actor,
  email = "petugas.lapangan@contoh.id",
): Promise<Actor> {
  const invited = await setup.identity.inviteStaff(admin, { email, phoneNumber: "084444444444", role: "petugas_lapangan" });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  const { cookies } = await logIn(setup, email);
  const actor = await setup.identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return actor;
}

/** Records a Cek Denah on a Lokasi Mitra, the way it is really recorded (one of the Terencana switch's gate facts). */
export async function catatCekDenah(setup: FieldworkSetup, admin: Actor, petugas: Actor, lokasiId: string) {
  const tugas = await setup.fieldwork.createTugasLapangan(admin, {
    type: "cek_denah",
    subject: "Cek Denah",
    lokasiId,
    address: "Jl. Raya Pondok Rangon No. 1",
    pin: { lat: -6.29, lng: 106.9 },
    plannedDate: "2026-10-05",
    assigneeAccountId: petugas.accountId,
  });
  if (!tugas.ok) throw new Error(`tugas lapangan refused: ${tugas.reason}`);
  const completed = await setup.fieldwork.completeTugasLapangan(petugas, tugas.tugasLapangan.id, {
    form: { sesuaiDenah: true, note: "Sesuai Denah" },
    uploads: [{ kind: "foto_denah", file: { body: new Uint8Array([0xff, 0xd8, 0xff, 0, 1]), contentType: "image/jpeg" } }],
  });
  if (!completed.ok) throw new Error(`cek denah refused: ${completed.reason}`);
}

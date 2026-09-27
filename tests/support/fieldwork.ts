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

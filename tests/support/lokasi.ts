import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { createLokasi, type LokasiMitraStatus } from "@/domain/lokasi";
import { lokasiMitra as lokasiMitraTable } from "@/domain/lokasi/schema";
import { identityOnTestDatabase, logInByOtp, signedInAdminPlatform } from "./identity";

/** The Lokasi module on the test Postgres, sharing the identity module's fake Clock, FileStore and Audit Log. */
export function lokasiOnTestDatabase(db: Database) {
  const setup = identityOnTestDatabase(db);
  const lokasi = createLokasi({
    db,
    clock: setup.clock,
    files: setup.files,
    audit: setup.audit,
    identity: setup.identity,
  });
  return { ...setup, lokasi };
}

export type LokasiSetup = ReturnType<typeof lokasiOnTestDatabase>;

/** A Lokasi Mitra created by the signed-in Admin Platform, with the typed data every test starts from. */
export async function newLokasiMitra(
  setup: LokasiSetup,
  admin: Awaited<ReturnType<typeof signedInAdminPlatform>>["actor"],
  name = "Makam Wakaf Al-Ikhlas",
) {
  const created = await setup.lokasi.createLokasiMitra(admin, {
    name,
    pengelolaName: "Yayasan Al-Ikhlas",
    address: "Jl. Raya Pondok Rangon No. 1",
    city: "Kota Jakarta Timur",
  });
  if (!created.ok) throw new Error(`Lokasi Mitra refused: ${created.reason}`);
  return created.lokasiMitra;
}

/**
 * An Admin Lokasi of the given Lokasi Mitra: invited by the Admin Platform to
 * each, then logged in by OTP (which accepts the invites). Returns its actor.
 */
export async function signedInAdminLokasi(
  setup: LokasiSetup,
  admin: Awaited<ReturnType<typeof signedInAdminPlatform>>["actor"],
  lokasiIds: string[],
  phoneNumber = "083333333333",
) {
  for (const lokasiId of lokasiIds) {
    const invited = await setup.lokasi.inviteAdminLokasi(admin, lokasiId, { phoneNumber, email: "lokasi@contoh.id" });
    if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  }
  const { cookies } = await logInByOtp(setup.identity, setup.whatsapp, phoneNumber);
  const actor = await setup.identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return actor;
}

export { signedInAdminPlatform };

/**
 * Sets a Lokasi Mitra's status directly. A stand-in until the publish gate
 * (ticket 16) and Ditangguhkan / Berhenti (ticket 59) exist: those tickets
 * replace every use with their public functions.
 */
export async function setLokasiMitraStatusForTest(db: Database, lokasiId: string, status: LokasiMitraStatus): Promise<void> {
  await db.update(lokasiMitraTable).set({ status }).where(eq(lokasiMitraTable.id, lokasiId));
}

import type { Database } from "@/db/client";
import { createKedukaan } from "@/domain/kedukaan";
import { pemesanDenganEmail } from "./pemesanan";
import { publishOnTestDatabase } from "./publish";

/**
 * The Kedukaan module next to Notifications and Lokasi on the test Postgres, sharing one fake
 * Clock, Identity and Audit Log. The fake Clock starts on Thursday 2026-10-01 09:00 WIB.
 */
export function kedukaanOnTestDatabase(db: Database) {
  const setup = publishOnTestDatabase(db);
  const kedukaan = createKedukaan({ db, clock: setup.clock, audit: setup.audit, lokasi: setup.lokasi, notifikasi: setup.notifications });
  return { ...setup, kedukaan };
}

export type KedukaanSetup = ReturnType<typeof kedukaanOnTestDatabase>;

/** A family member: an Akun that logged in with a Kode Masuk, as `{ accountId, email }`. */
export async function keluargaDenganEmail(setup: KedukaanSetup, email = "keluarga@contoh.id") {
  return (await pemesanDenganEmail(setup as never, email)).pemesan;
}

export { signedInAdminPlatform, signedInAdminLokasi, newLokasiMitra } from "./publish";

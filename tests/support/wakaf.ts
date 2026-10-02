import type { Database } from "@/db/client";
import type { Actor } from "@/domain/identity";
import { createWakaf } from "@/domain/wakaf";
import { pemesanDenganEmail } from "./pemesanan";
import { publishOnTestDatabase } from "./publish";

/**
 * The Wakaf module next to Field Work, Notifications and Lokasi on the test Postgres, sharing one
 * fake Clock, FileStore, Identity and Audit Log. The fake Clock starts on Thursday 2026-10-01 09:00 WIB.
 */
export function wakafOnTestDatabase(db: Database) {
  const setup = publishOnTestDatabase(db);
  const wakaf = createWakaf({
    db,
    clock: setup.clock,
    files: setup.files,
    audit: setup.audit,
    lokasi: setup.lokasi,
    fieldwork: setup.fieldwork,
    notifikasi: setup.notifications,
  });
  return { ...setup, wakaf };
}

export type WakafSetup = ReturnType<typeof wakafOnTestDatabase>;

/** A Wakif: an Akun that logged in with a Kode Masuk, as `{ accountId, email }`. */
export async function wakifDenganEmail(setup: WakafSetup, email = "wakif@contoh.id") {
  return (await pemesanDenganEmail(setup as never, email)).pemesan;
}

export { newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform, signedInPetugasLapangan } from "./publish";
export type { Actor };

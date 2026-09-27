import type { Database } from "@/db/client";
import type { Billing } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Inventory } from "@/domain/inventory";
import type { Lokasi } from "@/domain/lokasi";
import type { Tariffs } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";

/**
 * Who is placing a Pemesanan Makam: an Akun's id with the Email Terverifikasi
 * that was proven to reach it. The wizard's Kirim is the login itself (the one
 * exception in AGENTS.md), so the Server Action has no session cookie to read
 * an Actor from; the Kode Masuk hands it these two facts instead, and the
 * module checks that the two really belong together.
 */
export interface Pemesan {
  accountId: string;
  email: string;
}

/**
 * The Notifications seam for the messages a Pemesanan Makam brings (spec,
 * Notifications; the Peringatan Staf a new order raises and the family's own
 * email). The Notifications module is a later ticket, so this is the one call
 * the wizard makes of it: `placeSaatDuka` announces the order here, and the
 * composition root hands it the runtime's Notifications as soon as that has a
 * family message. Nothing is sent until then, and nothing is lost but the
 * message: the Akun exists the moment the Kode Masuk succeeds.
 */
export interface PemesananNotifikasi {
  /** A Pemesanan Makam the Lokasi Mitra has to confirm, named by its Nomor Pemesanan. */
  pemesananDiajukan(order: { nomor: string; lokasiId: string; email: string | null }): Promise<void>;
}

/**
 * What the Pemesanan module needs from its neighbours: only their public
 * functions, never their tables. It reads the Lokasi Mitra's listing and
 * working time from Lokasi, its prices from Tariffs, what is still Tersedia
 * from Inventory, the Nomor Pemesanan's series from Billing, and which Akun an
 * email belongs to from Identity.
 */
export interface PemesananDeps {
  db: Database;
  clock: Clock;
  lokasi: Pick<
    Lokasi,
    "isTerverifikasi" | "publicLokasiMitra" | "publicLokasiMitraList" | "bukaSekarang" | "serviceHoursDeadline" | "kontakSiagaOf"
  >;
  tariffs: Pick<Tariffs, "lokasiPricing" | "quote">;
  inventory: Pick<Inventory, "tersediaPerJenisMakam">;
  /** For the Nomor Pemesanan series, taken `within` the order's own transaction. */
  billing: Pick<Billing, "within">;
  identity: Pick<Identity, "accountByEmail">;
  notifikasi: PemesananNotifikasi;
}

import type { Database } from "@/db/client";
import type { Billing } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Inventory } from "@/domain/inventory";
import type { Lokasi, LokasiFacility } from "@/domain/lokasi";
import type { Tariffs } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";

/**
 * Who is placing a Pemesanan Terencana: an Akun's id with the Email Terverifikasi
 * that was proven to reach it. The wizard's Kirim is the login itself (the one
 * exception in AGENTS.md), so the Server Action has no session cookie to read an
 * Actor from; the Kode Masuk hands it these two facts instead, and the module
 * checks that the two really belong together.
 */
export interface Pemesan {
  accountId: string;
  email: string;
}

/**
 * The Notifications seam for the messages a Pemesanan Terencana brings (spec,
 * Notifications). Ticket 20 builds the family's own messages and the event log
 * they retry from; until it lands, the composition root passes the runtime's
 * Notifications here and this is where its call arrives, so no message is sent
 * from the wizard itself and nothing is lost but the message: the Akun and its
 * Email Terverifikasi exist the moment the Kode Masuk succeeds, and a placement
 * never waits on a send.
 */
export interface PemesananNotifikasi {
  /** A Pemesanan Terencana the Lokasi Mitra has to confirm, named by its Nomor Pemesanan. */
  pemesananTerencanaDiajukan(order: { nomor: string; lokasiId: string; email: string }): Promise<void>;
}

/** The filters the Terencana wizard's Lokasi step offers (spec, story 39). */
export interface TerencanaQuery {
  city?: string;
  /** Every one of these must be checked. */
  facilities?: LokasiFacility[];
  /** Only Lokasi Mitra whose cheapest Hak Pakai all-in total falls in this band. */
  harga?: "hingga_10_juta" | "10_sampai_25_juta" | "di_atas_25_juta";
}

/**
 * What the Pemesanan module needs from its neighbours: only their public
 * functions, never their tables. It reads a Lokasi Mitra's listing and its
 * tumpang rules from Lokasi, its prices from Tariffs, what may be picked and the
 * hold itself from Inventory, the Nomor Pemesanan from Billing, and which Akun an
 * email belongs to from Identity.
 */
export interface PemesananDeps {
  db: Database;
  clock: Clock;
  lokasi: Pick<Lokasi, "publicLokasiMitra" | "publicLokasiMitraList" | "kontakSiagaOf">;
  tariffs: Pick<Tariffs, "lokasiPricing" | "quote">;
  inventory: Pick<Inventory, "publicDenah" | "tersediaUntukTerencana" | "tahan" | "within">;
  /** For the Nomor Pemesanan series, taken `within` the order's own transaction. */
  billing: Pick<Billing, "within">;
  identity: Pick<Identity, "accountByEmail">;
  notifikasi: PemesananNotifikasi;
}

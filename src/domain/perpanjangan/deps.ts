import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Inventory } from "@/domain/inventory";
import type { Layanan } from "@/domain/layanan";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { Pemesanan } from "@/domain/pemesanan";
import type { Tariffs } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";

/**
 * What the Perpanjangan module needs from its neighbours: only their public
 * functions, never their tables. The Hak Pakai and its end date come from
 * Inventory (which alone moves it), the price from Tariffs' `quote()`, the
 * Tagihan and the Bukti Perpanjangan from Billing, the block by an overdue
 * Saat Duka Tagihan from Pemesanan (which owns the link between a Hak Pakai and
 * its Tagihan), the code to the recorded email from Identity, and both family
 * messages from Notifications. The manual paths (ticket 41) add the FileStore for
 * the documents, the Audit Log for the Admin Lokasi's decisions, Inventory's
 * holder writes and the Lokasi's Jam Operasional calendar for the 2 working days.
 */
export interface PerpanjanganDeps {
  db: Database;
  clock: Clock;
  lokasi: Pick<Lokasi, "aturanPerpanjanganOf" | "jamOperasionalOf">;
  tariffs: Pick<Tariffs, "quote">;
  inventory: Pick<Inventory, "hakPakaiUntukPerpanjangan" | "perpanjangHakPakai" | "within" | "gantiPemegangHak" | "ubahKontakPemegangHak" | "lengkapiHakPakai">;
  billing: Pick<Billing, "within" | "tagihan" | "tagihanBerlaku">;
  pemesanan: Pick<Pemesanan, "tagihanPenghalangOf">;
  identity: Pick<Identity, "requestKodeMasuk" | "verifyKodeMasuk" | "accountByEmail">;
  /** The manual paths' documents (KTP, heirship proof, ...) live only here, private, and are read back through short-lived signed URLs (ticket 41). */
  files: FileStore;
  /** Approving, rejecting or returning a manual request is a staff write: one Entri Audit each (ticket 41). */
  audit: AuditLog;
  /**
   * The optional "Tambah Layanan" step (ticket 53): the items are checked against the Lokasi's offer and the Perpanjangan's due date,
   * priced in the Perpanjangan's own quote and written under the same Tagihan. Optional: a process without it refuses an order that adds Layanan.
   */
  layanan?: Pick<Layanan, "siapkanCheckout" | "gabungkanBaris" | "tulisCheckout" | "penawaranCheckout">;
  /** Both take the transaction of the write they announce, so a message is queued with it and rolls back with it. */
  notifikasi: Pick<Notifications, "tagihanTerbit" | "buktiPerpanjanganTerbit">;
}

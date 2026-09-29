import type { Database } from "@/db/client";
import type { Billing } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Inventory } from "@/domain/inventory";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { Pemesanan } from "@/domain/pemesanan";
import type { Tariffs } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";

/**
 * What the Perpanjangan module needs from its neighbours: only their public
 * functions, never their tables. The Hak Pakai and its end date come from
 * Inventory (which alone moves it), the price from Tariffs' `quote()`, the
 * Tagihan and the Bukti Perpanjangan from Billing, the block by an overdue
 * Saat Duka Tagihan from Pemesanan (which owns the link between a Hak Pakai and
 * its Tagihan), the code to the recorded email from Identity, and both family
 * messages from Notifications.
 */
export interface PerpanjanganDeps {
  db: Database;
  clock: Clock;
  lokasi: Pick<Lokasi, "aturanPerpanjanganOf">;
  tariffs: Pick<Tariffs, "quote">;
  inventory: Pick<Inventory, "hakPakaiUntukPerpanjangan" | "perpanjangHakPakai" | "within">;
  billing: Pick<Billing, "within" | "tagihan">;
  pemesanan: Pick<Pemesanan, "tagihanPenghalangOf">;
  identity: Pick<Identity, "requestKodeMasuk" | "verifyKodeMasuk" | "accountByEmail">;
  /** Only `within`: every message is queued in the transaction of the write it announces. */
  notifikasi: Pick<Notifications, "within">;
}

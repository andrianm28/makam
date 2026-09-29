import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Inventory } from "@/domain/inventory";
import type { Lokasi } from "@/domain/lokasi";
import type { Refunds } from "@/domain/refunds";
import type { Tariffs } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";

/**
 * Who is ordering Layanan: an Akun's id with the email the checkout holds, which
 * has to be that Akun's Email Terverifikasi. The checkout's Kirim is the login
 * itself when the family is new (the one exception in AGENTS.md), so the Server
 * Action has no session cookie to read an Actor from then; the Kode Masuk (or the
 * session, for a Pemesan already signed in) hands it these two facts instead, and
 * the module checks that the two really belong together.
 *
 * The Pemesan is never required to be the Pemegang Hak: any relative may care for
 * a grave (spec, story 84).
 */
export interface PemesanLayanan {
  accountId: string;
  email: string;
}

/**
 * The messages a Layanan order and its work bring (spec, Notifications). Each one
 * names who must see it and what they need to know, and nothing about the
 * message itself: which channel, which template and when it goes is the
 * Notifications module's business, and it logs and retries each one.
 *
 * `pekerjaanSelesai` carries the proof link the Pemesan is told to open — the
 * Admin Lokasi fulfils with in-app photo proof, and the Pemesan receives that
 * link, not the file.
 */
export interface LayananNotifikasi {
  /**
   * A new order Layanan with its Tagihan: the Pemesan hears the price and the
   * deadline. Queued on `tx`, the transaction that writes the order, so the message
   * exists only if the order does.
   */
  pesananLayananTerbit(tx: Database, hasil: PesananLayananTerbit): Promise<void>;
  /** A job finished: the Pemesan gets the link to its photo proof. Queued on the transaction that finishes it. */
  pekerjaanSelesai(tx: Database, hasil: PekerjaanSelesai): Promise<void>;
}

/** A new order Layanan as its Pemesan is told about it. */
export interface PesananLayananTerbit {
  pesananId: string;
  nomor: string;
  email: string;
  pemesanName: string;
  /** The grave the Layanan are for, named the way the Lokasi knows it. */
  lokasi: { id: string; name: string };
  petak: { nomor: string };
  /** The Layanan ordered, as the Tagihan's lines word them. */
  item: { label: string; targetDate: string }[];
  /** The pay-first Tagihan issued with the order. */
  tagihan: { id: string; nomorTagihan: string; total: number; dueAt: Date; link: string };
}

/** A job finished as its Pemesan is told about it. */
export interface PekerjaanSelesai {
  pekerjaanId: string;
  nomor: string;
  email: string;
  pemesanName: string;
  lokasi: { id: string; name: string };
  petak: { nomor: string };
  /** The Layanan that was done, in the wording the order kept. */
  label: string;
  /** When the work was recorded as finished. */
  selesaiAt: Date;
  /** The proof: what was captured, and the short-lived link to read it. */
  bukti: { kind: "foto_sebelum" | "foto_sesudah" | "video"; url: string | null }[];
}

/**
 * What the Layanan module needs from its neighbours: only their public
 * functions, never their tables. It reads the Lokasi Mitra's listing and name
 * from Lokasi, every price from Tariffs' `quote()`, a grave's Hak Pakai and a
 * Petak's name from Inventory, the Nomor Pesanan series and the Tagihan from
 * Billing, which Akun an email belongs to from Identity, and the files a proof is
 * made of from the FileStore.
 */
export interface LayananDeps {
  db: Database;
  clock: Clock;
  /** The private FileStore a job's photo proof lives in, and the links to read it by. */
  files: FileStore;
  /** Every catalog, offering, Paket and staff write records an Entri Audit here. */
  audit: AuditLog;
  /** A Lokasi Mitra is looked up through the Lokasi module, never its table: by a staff actor, or whether it is listed. */
  lokasi: Pick<Lokasi, "lokasiMitra" | "isTerverifikasi" | "publicLokasiMitra">;
  /**
   * Every price of a Layanan variant is a versioned tariff: quoted here, read for
   * the screens, and written through the Tariffs module — `within(tx)` so an
   * offering and its price commit or roll back together.
   */
  tariffs: Pick<Tariffs, "quote" | "hargaLayananLokasi" | "hargaLayananLokasiSemua" | "within">;
  /** A grave's Hak Pakai, which decides whether Layanan may be ordered for it at all. */
  inventory: Pick<Inventory, "hakPakaiOfUnit">;
  /** The Nomor Pemesanan series and an order's pay-first Tagihan, taken `within` the order's own transaction. */
  billing: Pick<Billing, "within" | "tagihan">;
  /** The Akun an email belongs to, and who is Admin Lokasi of a Lokasi Mitra. */
  identity: Pick<Identity, "accountByEmail" | "adminLokasiOf">;
  /**
   * A cancelled job's refund is asked of the Refunds module on the cancellation's own
   * transaction (`within`), so a job is never cancelled without its refund request.
   */
  refunds: Pick<Refunds, "within">;
  notifikasi: LayananNotifikasi;
}

import type { Database } from "@/db/client";
import type { Billing } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Inventory } from "@/domain/inventory";
import type { Lokasi } from "@/domain/lokasi";
import type { Tariffs } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";

/**
 * Who is placing a Pemesanan Makam: an Akun's id with the email "Data & kirim"
 * holds, which has to be that Akun's Email Terverifikasi. The wizard's Kirim is
 * the login itself (the one exception in AGENTS.md), so the Server Action has no
 * session cookie to read an Actor from; the Kode Masuk (or the session, for a
 * Pemesan already signed in) hands it these two facts instead, and the module
 * checks that the two really belong together.
 */
export interface Pemesan {
  accountId: string;
  email: string;
}

/**
 * The Notifications seam for the messages a Pemesanan Makam brings (spec,
 * Notifications: a new Saat Duka order alerts the Lokasi Mitra's staff at any
 * hour). `placeSaatDuka` announces the order here once it is written, naming
 * who must see it and what they need to confirm; the composition root hands it
 * the runtime's Notifications, which picks the channel, the template and the
 * timing. Nothing about a message is decided here.
 */
export interface PemesananNotifikasi {
  /** A Pemesanan Makam the Lokasi Mitra has to confirm, named by its Nomor Pemesanan. */
  pemesananDiajukan(order: PemesananDiajukan): Promise<void>;
}

/** A new Pemesanan Makam as the staff who must confirm it are told about it. */
export interface PemesananDiajukan {
  nomor: string;
  lokasi: { id: string; name: string };
  /** The Jenis Makam the family chose, as it was named at submission. */
  jenisMakamName: string;
  almarhum: { name: string; tanggalWafat: string };
  /** The Pemesan to call back, and the number to call. */
  pemesan: { name: string; phoneNumber: string | null };
  /** The burial the family plans, if it has one; the Lokasi agrees the day. */
  rencanaPemakamanAt: Date | null;
  /** The instant the Lokasi's Jam Operasional promised a confirmation by; null while it had none. */
  konfirmasiDueAt: Date | null;
  /** Every Akun Staf that must see this order: the Lokasi Mitra's Admin Lokasi and its Kontak Siaga. */
  penerima: { accountId: string }[];
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
  /** The Akun an email belongs to, and who is Admin Lokasi of a Lokasi Mitra. */
  identity: Pick<Identity, "accountByEmail" | "adminLokasiOf">;
  notifikasi: PemesananNotifikasi;
}

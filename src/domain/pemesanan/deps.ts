import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Inventory } from "@/domain/inventory";
import type { Lokasi, LokasiFacility } from "@/domain/lokasi";
import type { Tariffs } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";

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

/** The filters the Terencana wizard's Lokasi step offers (spec, story 39). */
export interface TerencanaQuery {
  city?: string;
  /** Every one of these must be checked. */
  facilities?: LokasiFacility[];
  /** Only Lokasi Mitra whose cheapest buyable Hak Pakai all-in total falls in this band (all of them within the payment cap). */
  harga?: "hingga_3_juta" | "3_sampai_6_juta" | "di_atas_6_juta";
}

/**
 * The Notifications seam for the messages a Pemesanan Makam brings (spec,
 * Notifications: a new Saat Duka order alerts the Lokasi Mitra's staff at any
 * hour, and ticket 23's family messages). `pesananDiajukan` announces a new
 * order, `pesananBelumDikonfirmasi` the re-alert, and `pesananDikonfirmasi`
 * the confirmation; each names who must see it and what they need to know, and
 * nothing about the message itself. The composition root hands it the runtime's
 * Notifications, which picks the channel, the template and the timing.
 */
export interface PemesananNotifikasi {
  /** A Pemesanan Makam the Lokasi Mitra has to confirm, named by its Nomor Pemesanan. */
  pesananDiajukan(order: PemesananDiajukan): Promise<void>;
  /**
   * The same order, still unconfirmed, now that 1 h of the Lokasi's Jam
   * Operasional has passed: the Lokasi's staff are alerted once more.
   */
  pesananBelumDikonfirmasi(order: PemesananDiajukan): Promise<void>;
  /** The Lokasi's confirmation of an order: the family hears the plot, the contact, the checklist and the Tagihan. */
  pesananDikonfirmasi(hasil: PemesananDikonfirmasi): Promise<void>;
  /**
   * A Pemesanan Terencana the Lokasi Mitra has to confirm. It is a call of its own
   * and not a variant of that first one because the two say different things: a
   * Terencana order names several plots and a Calon Penghuni who is alive, so it has
   * no Almarhum, no Jenis Makam of its own and no confirmation deadline (its plots
   * are held outright at submission, and the Tagihan follows the confirmation).
   */
  terencanaDiajukan(order: TerencanaDiajukan): Promise<void>;
}

/** A new Pemesanan Terencana as the staff who must see it are told about it. */
export interface TerencanaDiajukan {
  nomor: string;
  lokasi: { id: string; name: string };
  /** The plots it holds, by the numbers the family knows them by. */
  unit: { nomor: string; jenisMakamName: string }[];
  /** The Calon Penghuni the plots are prepared for, as it was named at submission. */
  calon: { name: string };
  /** The Pemesan to call back, and the number to call. */
  pemesan: { name: string; phoneNumber: string | null };
  /** Every Akun Staf that must see this order: the Lokasi Mitra's Admin Lokasi and its Kontak Siaga. */
  penerima: { accountId: string }[];
}

/** A new Pemesanan Makam as the staff who must confirm it are told about it. */
export interface PemesananDiajukan {
  id: string;
  nomor: string;
  lokasi: { id: string; name: string };
  /** The Jenis Makam the family chose, as it was named at submission. */
  jenisMakamName: string | null;
  almarhum: { name: string; tanggalWafat: string };
  /** The Pemesan to call back, and the number to call; its Email Terverifikasi, where the family's own message goes. */
  pemesan: { name: string; phoneNumber: string | null; email: string | null };
  /** The burial the family plans, if it has one; the Lokasi agrees the day at confirmation. */
  rencanaPemakamanAt: Date | null;
  /** The instant the Lokasi's Jam Operasional promised a confirmation by; null while it had none. */
  konfirmasiDueAt: Date | null;
  /** Every Akun Staf that must see this order: the Lokasi Mitra's Admin Lokasi and its Kontak Siaga. */
  penerima: { accountId: string }[];
}

/** A confirmed Pemesanan Makam as its family is told about it (spec, Notifications; ticket 23). */
export interface PemesananDikonfirmasi {
  pemesananId: string;
  nomor: string;
  /** The Email Terverifikasi the order was proven with; null when the order has none. */
  email: string | null;
  pemesanName: string;
  lokasi: { id: string; name: string };
  jenisMakamName: string | null;
  almarhum: { name: string; tanggalWafat: string };
  /** The burial the Lokasi agreed with the family, which the Tagihan counts from. */
  pemakamanAt: Date;
  /** The assigned Petak Makam, as its Nomor Makam. */
  petak: { nomor: string };
  /** The Lokasi Mitra to call, by name and (when it has one) number. */
  kontakLokasi: { name: string; phoneNumber: string | null };
  /** The Lokasi Mitra's document checklist, as the family should bring it. */
  dokumen: string[];
  /** The pay-after Tagihan issued with the confirmation. */
  tagihan: { nomorTagihan: string; total: number; dueAt: Date; link: string };
}

/**
 * What the Pemesanan module needs from its neighbours: only their public
 * functions, never their tables. It reads the Lokasi Mitra's listing and
 * working time from Lokasi, its prices from Tariffs, what is still Tersedia
 * and the Hak Pakai a confirmation creates from Inventory, the Nomor Pemesanan's
 * series and the Tagihan from Billing, and which Akun an email belongs to from
 * Identity.
 */
export interface PemesananDeps {
  db: Database;
  clock: Clock;
  /** The private FileStore for a family's own documents on an order. */
  files: FileStore;
  /** Every staff write on an order (a confirmation, a checklist tick) records an Entri Audit here. */
  audit: AuditLog;
  lokasi: Pick<
    Lokasi,
    | "isTerverifikasi"
    | "publicLokasiMitra"
    | "publicLokasiMitraList"
    | "lokasiMitra"
    | "bukaSekarang"
    | "serviceHoursDeadline"
    | "saatDukaPaymentWindowHours"
    | "documentChecklistOf"
    | "kontakSiagaOf"
  >;
  tariffs: Pick<Tariffs, "lokasiPricing" | "quote">;
  inventory: Pick<
    Inventory,
    | "tersediaPerJenisMakam"
    // A Saat Duka confirmation assigns a cleared Tersedia Petak and reads the ones it offers.
    | "beriHakPakai"
    // The Terencana wizard's Denah and the hold that keeps a plot sold (spec, Inventory > Denah).
    | "publicDenah"
    | "tersediaUntukTerencana"
    | "tahan"
    | "lepasTahan"
    | "within"
  >;
  /**
   * For the Nomor Pemesanan series, a confirmed order's Tagihan, and settling
   * it: a Harga Khusus replaces the Tagihan and a direct payment settles it,
   * each `within` the order's own transaction.
   */
  billing: Pick<Billing, "within" | "tagihan" | "metodePembayaran" | "recordPayment" | "reissueTagihan">;
  /**
   * Whether a Pencairan has ever been issued for an order, by its Nomor
   * Pemesanan (spec, Payouts: a partner share is frozen from then on, so an
   * amount already transferred cannot change). The Payouts module owns that
   * answer and is not built yet (ticket 32), so the composition root supplies
   * nothing, and **nothing here defaults it**: absent means the answer is
   * unknown, and `tambahHargaKhusus` refuses a partner share rather than
   * assuming none was ever issued. When Payouts lands the read is wired here
   * and the rule applies as written.
   */
  pencairanTerbit?: (nomorPemesanan: string) => Promise<boolean>;
  /** The Akun an email belongs to, and who is Admin Lokasi of a Lokasi Mitra. */
  identity: Pick<Identity, "accountByEmail" | "adminLokasiOf">;
  notifikasi: PemesananNotifikasi;
}

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
  /**
   * The Lokasi confirmed a Pemesanan Terencana: the family hears the plots, who holds
   * the right, who to call and what to pay. It is separate from `pesananDikonfirmasi`
   * because there is no Almarhum and no burial to say, and separate from
   * `tagihanTerbit` because this one names the right as well as the money (ticket 37).
   */
  terencanaDikonfirmasi(input: TerencanaDikonfirmasi): Promise<void>;
  /**
   * The Lokasi declined a Pemesanan Terencana: the family hears why and is sent back to
   * the wizard's Lokasi step to pick again (spec, story 49; ticket 37).
   */
  terencanaDitolak(input: TerencanaDitolak): Promise<void>;
  /**
   * A Pemesanan Terencana ended without a right: the Pemesan withdrew before paying, or
   * the payment hold ran out. Nothing was charged either way (ticket 37).
   */
  terencanaDibatalkan(input: TerencanaDibatalkan): Promise<void>;
  /**
   * A confirmed Terencairan's pay-first Tagihan, so the family is told what to pay and
   * the Terencana rule's own reminder is queued with it (spec, Notifications: "Pemesanan
   * Terencana Tagihan | once, about 4 h before the hold expires"; ticket 37). A Saat Duka
   * Tagihan is announced by the checkout Server Action that issues it instead, which is
   * ticket 22's pattern; this is the one place the domain issues the Tagihan itself.
   */
  tagihanTerbit(input: TagihanTerbitPemesanan): Promise<void>;
}

/** One plot of a Terencana order, by the number the family knows it by. */
export interface UnitTerencanaNotifikasi {
  jenis: "petak" | "kavling";
  nomor: string;
}

/** The pay-first Tagihan a Terencana confirmation issues, as the announcement needs it. */
export interface TagihanTerbitPemesanan {
  tagihanId: string;
  nomorTagihan: string;
  nomorPemesanan: string;
  email: string | null;
  perihal: string;
  total: number;
  dueAt: Date;
  /** The unguessable part of the Tagihan page's link. */
  link: string;
}

/** The Lokasi's confirmation of a Pemesanan Terencana, as its family is told about it. */
export interface TerencanaDikonfirmasi {
  pemesananId: string;
  nomor: string;
  email: string | null;
  pemesanName: string;
  lokasi: { id: string; name: string };
  /** The plots the order holds, by the numbers the family picked them by. */
  unit: UnitTerencanaNotifikasi[];
  /** The Calon Penghuni the plots are prepared for, as it was named at submission. */
  calon: { name: string };
  /** The pay-first Tagihan, whose due date is the end of the payment hold. */
  tagihan: { nomorTagihan: string; total: number; dueAt: Date; link: string };
  /** The Admin Lokasi of that Lokasi Mitra to call, when one is recorded as its Kontak Siaga. */
  kontakLokasi: { name: string; phoneNumber: string | null } | null;
}

/** The Lokasi's decline of a Pemesanan Terencana, as its family is told about it. */
export interface TerencanaDitolak {
  pemesananId: string;
  nomor: string;
  email: string | null;
  pemesanName: string;
  lokasi: { id: string; name: string };
  /** Why the Lokasi declined, in its own words. */
  alasan: string;
}

/** A Pemesanan Terencana that ended with no right, as its family is told about it. */
export interface TerencanaDibatalkan {
  pemesananId: string;
  nomor: string;
  email: string | null;
  pemesanName: string;
  lokasi: { id: string; name: string };
  /** Why it ended: the Pemesan withdrew, or the payment hold ran out. */
  alasan: string;
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
    /** A Terencairan confirmation's payment hold, the Lokasi Mitra's own policy (ticket 37). */
    | "terencanaHoldHours"
    /** A Terencairan's confirmation deadline, the end of the Lokasi's next working day (ticket 37). */
    | "jamOperasionalOf"
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
    // The Hak Pakai a paid Terencana order takes, on the plot its own hold stands on (ticket 37).
    | "beriHakPakaiTerencana"
    // The first Pemakaman of a Hak Pakai, which the Terencairan Pencairan trigger needs.
    | "firstPemakamanDate"
    | "within"
  >;
  /**
   * For the Nomor Pemesanan series, a confirmed order's Tagihan (voiding the one a
   * withdrawal cancels) and the Bukti Pemesanan a paid Terencana order is given, all
   * taken `within` the transaction that writes them.
   */
  billing: Pick<Billing, "within" | "tagihan" | "batalkanTagihan" | "terbitkanBuktiPemesanan">;
  /** The Akun an email belongs to, and who is Admin Lokasi of a Lokasi Mitra. */
  identity: Pick<Identity, "accountByEmail" | "adminLokasiOf">;
  notifikasi: PemesananNotifikasi;
}

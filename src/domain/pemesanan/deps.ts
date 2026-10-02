import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Inventory } from "@/domain/inventory";
import type { Layanan } from "@/domain/layanan";
import type { Lokasi, LokasiFacility } from "@/domain/lokasi";
import type {
  PembatalanTerencanaInput,
  TagihanTerbitInput,
  TagihanTerbitResult,
  TerencanaBatasBayarLewatInput,
  TerencanaBuktiInput,
  TerencanaDikonfirmasiInput,
  TerencanaDitolakInput,
} from "@/domain/notifications";
import type { Payouts } from "@/domain/payouts";
import type { Refunds } from "@/domain/refunds";
import type { Tariffs } from "@/domain/tariffs";
import type { Rupiah } from "@/lib/rupiah";
import type { ReportError } from "@/lib/observability/report-error";
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
  /**
   * A Tagihan this module has just issued to a family, announced inside the
   * issuing transaction (`tx`): Notifications records where the Tagihan's
   * messages go and queues the Tagihan email and its reminders. A refusal
   * rolls the whole confirmation back.
   */
  tagihanTerbit(tx: Database, input: TagihanTerbitInput): Promise<TagihanTerbitResult>;
  /** The family message that a Pemesanan Makam was placed, named by its Nomor Pemesanan. */
  pesananDiajukan(order: PemesananDiajukan): Promise<void>;
  /**
   * The Peringatan Staf a new Saat Duka order raises, queued inside the order's
   * own transaction `tx` (ticket 96): the alert commits or rolls back with the
   * order, so a rolled-back order leaves no alert and a committed one cannot
   * lose it.
   */
  peringatanStafSaatDuka(tx: Database, order: PemesananDiajukan): Promise<void>;
  /** The Peringatan Staf (bell + email) an heirship proof raises, queued inside the consent's own transaction (ticket 35). */
  peringatanStafAhliWaris(tx: Database, order: PemesananAhliWaris): Promise<void>;
  /**
   * The same order, still unconfirmed, now that 1 h of the Lokasi's Jam
   * Operasional has passed: the Lokasi's staff are alerted once more.
   */
  pesananBelumDikonfirmasi(order: PemesananDiajukan): Promise<void>;
  /** The Lokasi's confirmation of an order: the family hears the plot, the contact, the checklist and the Tagihan. */
  pesananDikonfirmasi(hasil: PemesananDikonfirmasi): Promise<void>;
  /**
   * The Lokasi's Tolak: the family hears it was declined and why, and is sent to
   * the Pilih makam list again with a banner, its own data and the rejecting
   * Lokasi taken out (ticket 24). A family nobody can reach by email is a Tier 1
   * call for Admin Platform, which this announcement opens.
   */
  pesananDitolak(hasil: PesananDitolak): Promise<void>;
  /** The Lokasi's alternative the Pemesan has to answer with one tap, seeing the new all-in total. */
  pesananAlternatifDitawarkan(hasil: PesananAlternatifDitawarkan): Promise<void>;
  /** A cancelled order, said to the family: what it gave back and what is on its way back. */
  pesananDibatalkan(hasil: PesananDibatalkan): Promise<void>;
  /** The Pemegang Hak consent request for a further burial: an ordinary email with a link to Akun Saya, no code (ticket 35, owner 2026-10-02). */
  tumpangMintaPersetujuan(hasil: TumpangMintaPersetujuan): Promise<void>;
  /** A further burial refused by the Lokasi or the Pemegang Hak: its own wording, with the Kontak Siaga to call and no Pilih makam. */
  tumpangDitolak(hasil: TumpangDitolak): Promise<void>;
  /**
   * The Bukti Pemesanan of a paid order: the link to the document that proves the
   * right (ADR 0004 — by email; an order with no email opens the call row, and
   * CS shares the link by hand). It is a call of its own because it says
   * something no other message does: the family now owns a plot, by name.
   */
  pesananBuktiPemesanan(hasil: PemesananBuktiPemesanan): Promise<void>;
  /**
   * A Pemesanan Terencana the Lokasi Mitra has to confirm. It is a call of its own
   * and not a variant of that first one because the two say different things: a
   * Terencana order names several plots and a Calon Penghuni who is alive, so it has
   * no Almarhum, no Jenis Makam of its own and no confirmation deadline (its plots
   * are held outright at submission, and the Tagihan follows the confirmation).
   *
   * Queued inside the order's own transaction `tx` (ticket 96), as the Saat Duka
   * alert is: it commits or rolls back with the order.
   */
  terencanaDiajukan(tx: Database, order: TerencanaDiajukan): Promise<void>;
  /**
   * The Terencana order's own messages (ticket 37), each announced inside the
   * transaction `tx` of the change it is about, so it commits or rolls back with
   * it: the Lokasi Mitra's confirmation (one email carrying both the order and the
   * Tagihan), its decline, a payment hold that ran out, and the Bukti Pemesanan of
   * the paid order.
   */
  terencanaDikonfirmasi(tx: Database, input: TerencanaDikonfirmasiInput): Promise<void>;
  terencanaDitolak(tx: Database, input: TerencanaDitolakInput): Promise<void>;
  terencanaBatasBayarLewat(tx: Database, input: TerencanaBatasBayarLewatInput): Promise<void>;
  terencanaBukti(tx: Database, input: TerencanaBuktiInput): Promise<void>;
  /**
   * The Admin Lokasi's answer to a Pembatalan request of a paid Terencana order (ticket 38): approved (the
   * Pemesan who paid is asked for a bank account when a refund is due), declined, or sent back for a fix.
   * Announced inside the decision's own transaction, so it commits or rolls back with it.
   */
  pembatalanTerencana(tx: Database, input: PembatalanTerencanaInput): Promise<void>;
  /**
   * The Pemegang Hak changed a plot's Calon Penghuni label, or cleared it (ticket 39). Sent at once to
   * each of the Lokasi Mitra's Admin Lokasi as a Peringatan Staf; the module resolves who they are.
   */
  calonPenghuniBerubah(input: CalonPenghuniBerubah): Promise<void>;
  /**
   * A pay-after Tagihan's overdue anchor just became known (`catatPemakaman`,
   * right after `billing.setOverdueAnchor` sets it): Chasing's four H+3/7/14/30
   * reminders are queued from here (spec, Billing > Chasing; ticket 29). Never
   * called for a Tagihan with no anchor (a pay-first moment).
   */
  chasingDijadwalkan(input: ChasingDijadwalkan): Promise<void>;
  /**
   * Admin Platform just declared a Tagihan Tidak Tertagih: the Admin Lokasi push
   * is queued **inside `tx`**, the declaration's own transaction, so it commits
   * or rolls back with it (AGENTS.md: enqueue in the same transaction as the
   * data; ticket 29).
   */
  tidakTertagihDinyatakan(tx: Database, tagihan: TidakTertagihDinyatakan): Promise<void>;
}

/** A change of a Hak Pakai's Calon Penghuni label (ticket 39), as the Lokasi's Admin Lokasi are told about it. */
export interface CalonPenghuniBerubah {
  hakPakaiId: string;
  lokasiId: string;
  unitNomor: string | null;
  /** The new label; null when the family cleared it. */
  label: string | null;
  /** Every Akun Staf that must see it: the Lokasi Mitra's Admin Lokasi. */
  penerima: { accountId: string }[];
}

/** The Tagihan just declared Tidak Tertagih, as far as the Admin Lokasi push needs it. */
export interface TidakTertagihDinyatakan {
  id: string;
  nomorTagihan: string;
  total: Rupiah;
  lokasiId: string | null;
}

/** What Chasing needs to schedule a pay-after Tagihan's reminders, the moment its overdue anchor becomes known. */
export interface ChasingDijadwalkan {
  tagihanId: string;
  nomorTagihan: string;
  nomorPemesanan: string | null;
  /** The Email Terverifikasi every family message goes to; null for an order CS placed with no email. */
  email: string | null;
  perihal: string;
  total: number;
  lewatJatuhTempoAt: Date;
  link: string;
}

/** A new Pemesanan Terencana as the staff who must see it are told about it. */
export interface TerencanaDiajukan {
  /** The Pemesanan Terencana's own id: the subject a retried alert is asked about (ticket 96). */
  id: string;
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

/** An heirship proof logged for a further burial, as the staff who must record a Ganti Pemegang Hak are told (ticket 35). */
export interface PemesananAhliWaris {
  id: string;
  nomor: string;
  lokasi: { id: string; name: string };
  almarhumName: string;
  /** Every Akun Staf that must see it: the Lokasi Mitra's Admin Lokasi and its Kontak Siaga. */
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

/** The Bukti Pemesanan of a paid Pemesanan Makam, as its family is told about it. */
export interface PemesananBuktiPemesanan {
  pemesananId: string;
  nomor: string;
  /** The Email Terverifikasi the order was proven with; null when the order has none (CS shares the link by hand). */
  email: string | null;
  pemesanName: string;
  lokasi: { id: string; name: string };
  /** The document itself: its number and the unguessable part of its page's link. */
  bukti: { nomor: string; link: string };
  /** The right it proves, so the email can name it before the family opens the link. */
  petakNomor: string;
  pemegangHakName: string;
  masa: { mulai: string | null; selesai: string | null; tahun?: number | null };
}

/**
 * A declined Pemesanan Makam as its family is told about it (spec, Work Queues:
 * Tier 1 "Saat Duka ditolak (call within 2 h)", Public site: "After a Tolak, the
 * Pilih makam list opens with a banner, the rejecting Lokasi removed and the
 * family's data prefilled"; ticket 24).
 */
export interface PesananDitolak {
  pemesananId: string;
  nomor: string;
  /** The Email Terverifikasi the order was proven with; null when it has none (the call is then the only channel). */
  email: string | null;
  pemesanName: string;
  lokasi: { id: string; name: string };
  /** The reason off the closed list, in the wording that list gives it. */
  alasan: string;
  /** The city the rejecting Lokasi Mitra is in: the list the family is sent back to is filtered by it. */
  kota: string | null;
  almarhum: { name: string; tanggalWafat: string };
  /** The Pemesan to call, and the number to call. */
  pemesan: { name: string; phoneNumber: string | null };
}

/** The alternative the Pemesan has to accept or decline, with the all-in total it would carry. */
export interface PesananAlternatifDitawarkan {
  pemesananId: string;
  nomor: string;
  email: string | null;
  pemesanName: string;
  lokasi: { id: string; name: string };
  /** The Almarhum the burial is for, as the order recorded them. */
  almarhum: { name: string; tanggalWafat: string };
  /** What was ordered, and what is offered instead: either half may be null, never both. */
  dari: { jenisMakam: string | null; pemakamanAt: Date | null };
  ke: { jenisMakam: string | null; pemakamanAt: Date | null };
  /** The all-in total the offer carries, as `quote()` priced it at this instant. */
  total: number;
  /** The lines behind that total, for the family to read before tapping one button. */
  lines: { label: string; amount: number }[];
}

/** A cancelled Pemesanan Makam as its family is told about it: what was given back, and what is on its way. */
/** A refused further burial, as its family is told. */
export interface TumpangDitolak {
  pemesananId: string;
  nomor: string;
  email: string | null;
  pemesanName: string;
  lokasi: { id: string; name: string };
  alasan: string;
  almarhum: { name: string; tanggalWafat: string };
  kontakSiaga: { name: string; phoneNumber: string | null } | null;
}

/** What the Pemegang Hak consent request needs: who is asked, by whom, about whom, where. */
export interface TumpangMintaPersetujuan {
  pemesananId: string;
  nomor: string;
  email: string;
  pemegangHakName: string;
  pemesanName: string;
  lokasi: { id: string; name: string };
  almarhum: { name: string; tanggalWafat: string };
}

export interface PesananDibatalkan {
  pemesananId: string;
  nomor: string;
  email: string | null;
  pemesanName: string;
  lokasi: { name: string };
  almarhum: { name: string };
  /** True when the Admin Lokasi recorded it for the family rather than the family itself. */
  olehLokasi: boolean;
  /** Why, in the family's own words where the family gave one. */
  alasan: string | null;
  /** The Tagihan cancelled with the order, and whether money is on its way back. */
  tagihan: { nomorTagihan: string; dibatalkan: boolean; jumlahDikembalikan: number } | null;
  /** What the plot became: a Terencana cancellation gives a plot back, a Saat Duka one has not taken one yet. */
  petak: { nomor: string } | null;
}

/**
 * What the Pemesanan module needs from its neighbours: only their public
 * functions, never their tables. It reads the Lokasi Mitra's listing and
 * working time from Lokasi, its prices from Tariffs, what is still Tersedia,
 * the Hak Pakai a confirmation creates and the one a Bukti Pemesanan names from
 * Inventory, the Nomor Pemesanan's series, the Tagihan and the Bukti Pemesanan
 * from Billing, and which Akun an email belongs to from Identity.
 */
export interface PemesananDeps {
  db: Database;
  clock: Clock;
  /** Where a broken invariant a tick meets is reported (tags only, no personal data); optional for a process with none. */
  reportError?: ReportError;
  /** The private FileStore for a family's own documents on an order. */
  files: FileStore;
  /** Every staff write on an order (a confirmation, a checklist tick) records an Entri Audit here. */
  audit: AuditLog;
  lokasi: Pick<
    Lokasi,
    | "isTerverifikasi"
    | "publicLokasiMitra"
    | "publicLokasiMitraTampil"
    | "publicLokasiMitraList"
    | "lokasiMitra"
    | "bukaSekarang"
    | "serviceHoursDeadline"
    | "saatDukaPaymentWindowHours"
    // A Terencana order's hold (Lokasi policy) and the working calendar its confirmation deadline counts on (ticket 37).
    | "terencanaHoldHours"
    | "jamOperasionalOf"
    // A Pembatalan's refund approval by Admin Platform is due 2 Hari Kerja on its own calendar (ticket 38).
    | "adminPlatformCalendar"
    | "documentChecklistOf"
    | "kontakSiagaOf"
    // A Ganti Pemegang Hak's sale-transfer rule and the fee the Lokasi collects offline (ticket 39).
    | "aturanGantiPemegangHak"
  >;
  tariffs: Pick<Tariffs, "lokasiPricing" | "quote">;
  inventory: Pick<
    Inventory,
    | "tersediaPerJenisMakam"
    // A Saat Duka confirmation assigns a cleared Tersedia Petak and reads the ones it offers;
    // a cancellation gives the Hak Pakai and its Petak back (ticket 24).
    | "beriHakPakai"
    | "batalkanHakPakai"
    // Recording the burial, which starts that Hak Pakai's tenure clock (ticket 25).
    | "catatPemakaman"
    // The Admin Lokasi ends a Hak Pakai once its Saat Duka Tagihan is Tidak Tertagih (ticket 29).
    | "akhiriHakPakai"
    // The Hak Pakai a Bukti Pemesanan names and the term it prints (ticket 25).
    | "hakPakaiById"
    // The Hak Pakai "Makamkan di sini" buries under, with its holder and its tumpang facts (ticket 35).
    | "hakPakaiUntukTumpang"
    // The Terencana wizard's Denah and the hold that keeps a plot sold (spec, Inventory > Denah).
    | "publicDenah"
    | "tersediaUntukTerencana"
    | "tahan"
    | "lepasTahan"
    // The Terencana confirmation starts the payment hold; the payment turns the hold into Hak Pakai (ticket 37).
    | "mulaiTahanBayar"
    | "beriHakPakaiDariTahan"
    // A Pengembalian / Ganti Pemegang Hak request's completion and the Calon Penghuni label (ticket 39).
    | "kembalikanHakPakai"
    | "gantiPemegangHak"
    | "ubahCalonPenghuni"
    | "within"
  >;
  /**
   * For the Nomor Pemesanan series, a confirmed order's Tagihan, the bill a
   * cancellation cancels, the Bukti Pemesanan it earned, and the pay-after
   * clock a recorded burial starts, all `within` the order's own transaction.
   */
  billing: Pick<Billing, "within" | "tagihan" | "tagihanBerlaku" | "rantaiTagihan" | "batalkanTagihan" | "buktiPemesananById" | "issueBuktiPemesanan" | "setOverdueAnchor" | "declareTidakTertagih">;
  /**
   * The refund an approved Pembatalan asks for (ticket 38), raised inside the approval's own transaction so the
   * Hak Pakai never ends with its money left unasked for, and read back to know whether Admin Platform has
   * approved it yet. Refunds is composed after this module (it asks this module who placed an order), so a
   * runtime reaches it through a lazy reference, as it reaches Payouts.
   */
  refunds: Pick<Refunds, "ajukanBaris" | "permintaan">;
  /**
   * Layanan at a checkout (ticket 53): the hari-H items of a Saat Duka order and the empty-plot items of a Terencana one are
   * checked at submission, put on the Tagihan the confirmation issues and scheduled there; a cancellation closes them.
   * Layanan is composed after Pemesanan, so the runtime hands this through a lazy box. Optional: a process with none
   * refuses an order that asks for Layanan and cancels nothing.
   */
  layanan?: Pick<Layanan, "siapkanCheckout" | "gabungkanBaris" | "tulisCheckout" | "batalkanLayananCheckout" | "batalkanLayananPetakDibatalkan">;
  /**
   * Payouts' half of the Saat Duka trigger that only this module can write: a
   * recorded Pemakaman, told to Payouts inside the burial's own transaction
   * (ticket 90). Required, not optional: a fixture that omitted it would look
   * like Payouts had never been told, which is the bug this dependency ends.
   */
  payouts: Pick<Payouts, "pemakamanTercatat">;
  /** The Akun an email belongs to, and who is Admin Lokasi of a Lokasi Mitra. */
  identity: Pick<Identity, "accountByEmail" | "adminLokasiOf">;
  notifikasi: PemesananNotifikasi;
}

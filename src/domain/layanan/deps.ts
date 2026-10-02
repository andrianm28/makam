import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Inventory } from "@/domain/inventory";
import type { Lokasi } from "@/domain/lokasi";
import type { Payouts } from "@/domain/payouts";
import type { Refunds } from "@/domain/refunds";
import type { Tariffs } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import type { ReportError } from "@/lib/observability/report-error";

/**
 * One job one Mitra Jasa holds or held, with the facts the scorecard counts and
 * the status effects act on (spec, Layanan > Mitra Jasa). The job row itself
 * belongs to the module that creates it (ticket 50 for a Lokasi Mitra, 56 for a
 * TPU), so this module asks for these facts and never reads that module's table.
 */
export interface PekerjaanMitraJasa {
  id: string;
  /** The job's own status, as the module that owns it words it. */
  status: "dijadwalkan" | "ditugaskan" | "dikerjakan" | "selesai" | "dibatalkan";
  /** The date the work is due on, as a WIB calendar date. */
  targetDate: string;
  /**
   * The moment this job is counted at, and the one the 90-day window is measured
   * from: when it was finished, declined, or never answered. Null while it is
   * still open, so a job nobody has answered yet counts for nothing yet.
   */
  dihitungPada: Date | null;
  /** Finished after its target date, or cancelled for lateness. */
  terlambat: boolean;
  /** Its Keluhan was upheld by Admin Platform. */
  keluhanUpheld: boolean;
  /** The Mitra Jasa declined it. */
  ditolak: boolean;
  /** The Mitra Jasa never answered the assignment. */
  tidakDirespons: boolean;
  /** The family's Penilaian 1–5, or null when none was given. */
  penilaian: number | null;
}

export type LepasPekerjaanResult = { ok: true } | { ok: false; reason: "tidak_ditemukan" };

/**
 * The narrow read and write this module needs from whoever owns the job rows.
 *
 * Deliberately dull: the *rules* stay here (which jobs a suspension takes off,
 * which ones count inside the 90-day window), and the port only stores and lists.
 * `within(tx)` is `tariffs.within(tx)`'s shape, so a status change and the jobs
 * it takes off commit together.
 */
export interface PekerjaanMitraJasaPort {
  /** Every job one Mitra Jasa holds or held, oldest first. */
  daftarPekerjaan(mitraJasaId: string): Promise<PekerjaanMitraJasa[]>;
  /** How many jobs each of these Mitra Jasa has finished (Selesai), in one read: a Mitra Jasa with none is 0. */
  jumlahSelesai(mitraJasaIds: string[]): Promise<Record<string, number>>;
  /** Takes one of that Mitra Jasa's jobs off them, with the reason, in the port's own words. */
  lepasPekerjaan(input: { pekerjaanId: string; alasan: string }): Promise<LepasPekerjaanResult>;
  /** The same two, bound to a caller's transaction. */
  within(tx: Database): PekerjaanMitraJasaPort;
}

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
  /**
   * A new order Layanan at a DKI TPU with its pay-first Tagihan (ticket 56): the same
   * message as `pesananLayananTerbit`, queued on the order's own transaction, and the
   * Tagihan announced with it so the family gets one email.
   */
  pesananTpuTerbit(tx: Database, hasil: PesananTpuTerbit): Promise<void>;
  /**
   * A TPU job was handed to a Mitra Jasa: a Peringatan Staf by web push and email with
   * the accept deadline. Queued through Notifications on `tx`, the assignment's own
   * transaction, so it exists only if the assignment does and is not lost by a crash
   * after the commit; the worker sends it and logs it.
   */
  pekerjaanTpuDitugaskan(tx: Database, hasil: PekerjaanTpuDitugaskan): Promise<void>;
  /**
   * A Paket Layanan cycle whose Tagihan would pass the Rilis 1 QRIS cap, so the
   * Paket was paused (ticket 54): the Pemesan is told in the transaction that set
   * the pause, so the pause and its Peringatan commit together.
   */
  paketSiklusDijeda(tx: Database, hasil: PaketSiklusDijeda): Promise<void>;
  /**
   * Someone wrote in a job's thread (ticket 52): the Pemesan is sent a link to read and reply.
   * It carries no text, no photo and no name of what was written; queued on the message's own transaction.
   */
  pesanThreadBaru(tx: Database, hasil: PesanThreadBaru): Promise<void>;
}

/** A thread message as its Pemesan is told of it: that one exists, by role, and where to read it. */
export interface PesanThreadBaru {
  pekerjaanId: string;
  nomor: string;
  email: string;
  label: string;
  /** A Lokasi Mitra's own name, or null at a TPU. */
  lokasi: { id: string; name: string } | null;
  /** Where the job is, for the sentence: the Lokasi Mitra's or the TPU's name. */
  tempat: string;
  dari: "admin_lokasi" | "admin_platform" | "mitra_jasa";
}

/** A new order Layanan at a DKI TPU as its Pemesan is told about it. */
export interface PesananTpuTerbit {
  nomor: string;
  email: string;
  pemesanName: string;
  tpu: { id: string; name: string };
  makam: { blokNomor: string };
  item: { label: string; targetDate: string }[];
  tagihan: { id: string; nomorTagihan: string; total: number; dueAt: Date; link: string };
}

/** What a Mitra Jasa is told when a job is handed to them: never the family's name or contact. */
export interface PekerjaanTpuDitugaskan {
  pekerjaanId: string;
  /** The Undangan Staf's address, the key to the Akun the alert goes to. */
  mitraJasaEmail: string;
  label: string;
  tpuName: string;
  targetDate: string;
  batasJawab: Date;
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

/** A Paket Layanan cycle whose Tagihan would pass the QRIS cap, as its Pemesan is told about it. */
export interface PaketSiklusDijeda {
  /** The subscription's own Nomor Pemesanan, so the message lands on its order page. */
  nomor: string;
  /** The Pemesan's proven email: a subscription always has one. */
  email: string;
  pemesanName: string;
  lokasi: { id: string; name: string };
  petak: { nomor: string };
  /** The WIB date of the cycle whose Tagihan Billing refused. */
  siklus: string;
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
  /** The private FileStore a job's photo proof lives in (with the links to read it by), and where a Mitra Jasa's KTP photo, their photo and the signed arrangement scan land. */
  files: FileStore;
  /** Every catalog, offering, Paket and staff write records an Entri Audit here. */
  audit: AuditLog;
  /** A Lokasi Mitra is looked up through the Lokasi module, never its table: by a staff actor, or whether it is listed. */
  lokasi: Pick<Lokasi, "lokasiMitra" | "isTerverifikasi" | "izinPesanan" | "publicLokasiMitra" | "publicLokasiMitraTampil" | "publicTpuDki">;
  /**
   * Every price of a Layanan variant is a versioned tariff: quoted here, read for
   * the screens, and written through the Tariffs module — `within(tx)` so an
   * offering and its price commit or roll back together.
   */
  tariffs: Pick<Tariffs, "quote" | "hargaLayananLokasi" | "hargaLayananLokasiSemua" | "within" | "mitraJasaRate">;
  /** A Mitra Jasa's jobs: the scorecard's numbers and the ones a suspension takes off. */
  pekerjaan: PekerjaanMitraJasaPort;
  /** A grave's Hak Pakai, which decides whether Layanan may be ordered for it at all. */
  inventory: Pick<Inventory, "hakPakaiOfUnit">;
  /** The Nomor Pemesanan series and an order's pay-first Tagihan, taken `within` the order's own transaction. */
  billing: Pick<Billing, "within" | "tagihan" | "tagihanBerlaku">;
  /** Where a failure that must not stop a whole tick is reported (a job whose Tagihan is missing, ticket 93); absent in a fixture. */
  reportError?: ReportError;
  /** The Akun an email belongs to, and who is Admin Lokasi of a Lokasi Mitra. */
  identity: Pick<Identity, "accountByEmail" | "adminLokasiOf">;
  /**
   * A cancelled job's refund is asked of the Refunds module on the cancellation's own
   * transaction (its `within` parameter), so a job is never cancelled without its refund request.
   */
  refunds: Pick<Refunds, "ajukanBaris">;
  /**
   * A Keluhan's Pencairan effects (ticket 51): the job's item is made due when its Keluhan window
   * closes with no Keluhan, a Keluhan is rejected or the redo proof is shown, and Admin Platform
   * may override what it pays after a Keluhan. Both are Payouts' public functions; this module
   * never reaches its tables.
   */
  payouts: Pick<Payouts, "itemLayanan" | "itemLayananById" | "jadikanLayananJatuhTempo" | "turunkanJumlahPencairan" | "catatItemLayananMitraJasa" | "batalkanItem" | "jadikanJatuhTempo">;
  notifikasi: LayananNotifikasi;
}

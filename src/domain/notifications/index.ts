/**
 * Notifications: the event table (recipient, channel, template, timing), the
 * email templates, the 08:00–20:00 WIB window, retries, the message log and
 * the "Telepon Pemesan" call row (ADR 0004: email only).
 *
 * Families get email (on the SumoPod relay, ticket 68), with a link into the
 * app; a family that must act and has no working address gets a Tier 2 call
 * row in the Antrean instead. Staff get a Peringatan Staf by web push to each
 * Perangkat Push of the Akun Staf and by email, and each Peringatan Staf is
 * kept for the bell in the staff header, read and marked read by its own Akun
 * Staf only. There is no WhatsApp and no SMS.
 *
 * The Kode Masuk is not here: Identity & Access sends it straight through
 * EmailSender, so it creates no log entry, is never retried and raises no row.
 *
 * Built so far: ticket 21 (Peringatan Staf, Perangkat Push) and ticket 20
 * (a Tagihan issued and its pay-first reminders, a Bukti Pembayaran issued);
 * Terencana, Paket and pay-after reminders arrive with tickets 37, 54 and 29.
 *
 * Owns tables: notifications_push_device, notifications_staff_alert,
 * notifications_message, notifications_tagihan_kontak,
 * notifications_telepon_pemesan, notifications_peringatan_antrean.
 */
import { and, asc, count, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing, PayAfterAnchored } from "@/domain/billing";
import {
  akunResource,
  staffRoles,
  writeRefusal,
  type Actor,
  type Identity,
  type StaffRole,
  type WriteRefusal,
} from "@/domain/identity";
import { base64urlBytes } from "@/lib/base64url";
import { scrubbedError, type ReportError } from "@/lib/observability/report-error";
import { scrubText } from "@/lib/observability/scrub";
import { STAFF_AREA_PATH, staffPagePath } from "@/lib/staff-area-path";
import type { Clock } from "@/ports/clock";
import type { EmailSender } from "@/ports/email-sender";
import type { PushNotification, PushSubscription, WebPush } from "@/ports/web-push";
import {
  catatPanggilan,
  teleponPemesanRiwayat,
  teleponPemesanTercatat,
  teleponPemesanTerbuka,
  type CatatPanggilanInput,
  type CatatPanggilanResult,
  type TeleponPemesan,
  type TeleponPemesanRiwayat,
} from "./telepon-pemesan";
import {
  antrekanPeringatanAntrean,
  kirimPeringatanAntreanTick,
  type HasilKirimPeringatan,
  type KirimPeringatanAntreanOpsi,
  type PeringatanAntreanInput,
  type PeringatanAntreanResult,
  type PeringatanPenugasanTpuInput,
} from "./peringatan-antrean";
import { antrekanPeringatanLokasi, chasingEskalasiTick, jadwalkanChasing, type JadwalkanChasingInput } from "./chasing";
import {
  catatanTagihan,
  tambahCatatanTagihan,
  tambahCatatanTagihanSchema,
  type CatatanTagihan,
  type TambahCatatanTagihanInput,
  type TambahCatatanTagihanResult,
} from "./catatan-tagihan";

export { tambahCatatanTagihanSchema, type CatatanTagihan, type TambahCatatanTagihanInput, type TambahCatatanTagihanResult };
import {
  kirimPesanJatuhTempo,
  pengembalianTerbit,
  pesanTagihan,
  tagihanTerbit,
  tagihanTerbitPengganti,
  type KirimJatuhTempo,
  type PengembalianTerbitInput,
  type PengembalianTerbitResult,
  type PesanTercatat,
  type TagihanTerbitInput,
  type TagihanTerbitResult,
} from "./pesan-keluarga";
import {
  pesananAlternatifDitawarkan,
  pesananDibatalkan,
  pesananBuktiPemesanan,
  pesananDiajukan,
  pesananDikonfirmasi,
  pesananDitolak,
  pesanPemesanan,
  layananPekerjaanSelesai,
  layananPesanBaru,
  layananPesananTerbit,
  layananTpuPesananTerbit,
  pesanLayanan,
  type LayananPekerjaanSelesaiInput,
  type LayananPesanBaruInput,
  type LayananPesananTerbitInput,
  type LayananTpuPesananTerbitInput,
  type PesanLayananResult,
  type PesanPemesananResult,
  type PesananAlternatifDitawarkanInput,
  type PesananDibatalkanInput,
  type PesananBuktiPemesananInput,
  type PesananDiajukanInput,
  type PesananDikonfirmasiInput,
  type PesananDitolakInput,
} from "./pesan-pemesanan";
import {
  buktiPerpanjanganTerbit,
  type BuktiPerpanjanganTerbitInput,
  type BuktiPerpanjanganTerbitResult,
} from "./pesan-perpanjangan";
import {
  pengurusanDikonfirmasi,
  pesanPengurusan,
  type PengurusanDikonfirmasiInput,
  type PesanPengurusanResult,
} from "./pesan-pengurusan";
import { pembatalanTerencana, type PembatalanTerencanaInput, type PesanPembatalanResult } from "./pesan-pembatalan";
import {
  terencanaBatasBayarLewat,
  terencanaBukti,
  terencanaDikonfirmasi,
  terencanaDitolak,
  type PesanTerencanaResult,
  type TerencanaBatasBayarLewatInput,
  type TerencanaBuktiInput,
  type TerencanaDikonfirmasiInput,
  type TerencanaDitolakInput,
} from "./pesan-terencana";
import { notificationsMessage, notificationsPushDevice, notificationsStaffAlert, pesanStatuses } from "./schema";

export type { KirimPeringatanAntreanOpsi, PeringatanAntreanInput, PeringatanAntreanResult, PeringatanPenugasanTpuInput, TahapPeringatanAntrean } from "./peringatan-antrean";
export { efekBuktiPembayaran, type BuktiEffectDeps } from "./efek-bukti";
export {
  catatPanggilanSchema,
  type CatatPanggilanInput,
  type CatatPanggilanResult,
  type TeleponPemesan,
  type TeleponPemesanRiwayat,
} from "./telepon-pemesan";
export {
  pesananBuktiPemesananSchema,
  layananPekerjaanSelesaiSchema,
  layananPesanBaruSchema,
  layananPesananTerbitSchema,
  layananTpuPesananTerbitSchema,
  pesananDiajukanSchema,
  pesananDikonfirmasiSchema,
  type LayananPekerjaanSelesaiInput,
  type LayananPesanBaruInput,
  type LayananPesananTerbitInput,
  type LayananTpuPesananTerbitInput,
  type PesanLayananResult,
  type PesanPemesananResult,
  type PesananBuktiPemesananInput,
  type PesananDiajukanInput,
  type PesananDikonfirmasiInput,
} from "./pesan-pemesanan";
export {
  pengurusanDikonfirmasiSchema,
  type PengurusanDikonfirmasiInput,
  type PesanPengurusanResult,
} from "./pesan-pengurusan";
export { pembatalanTerencanaSchema, type PembatalanTerencanaInput, type PesanPembatalanResult } from "./pesan-pembatalan";
export {
  terencanaBatasBayarLewatSchema,
  terencanaBuktiSchema,
  terencanaDikonfirmasiSchema,
  terencanaDitolakSchema,
  type PesanTerencanaResult,
  type TerencanaBatasBayarLewatInput,
  type TerencanaBuktiInput,
  type TerencanaDikonfirmasiInput,
  type TerencanaDitolakInput,
} from "./pesan-terencana";
export {
  tagihanTerbitSchema,
  type KirimJatuhTempo,
  type PesanTercatat,
  type TagihanTerbitInput,
  type TagihanTerbitResult,
} from "./pesan-keluarga";
/** The event table and the reminder rules, as the spec lists them, for anything that reports on them. */
export { ATURAN_PENGINGAT, MACAM_MOMEN_TAGIHAN, TABEL_ACARA, TEMPLATE_EMAIL, WAKTU_TEMPLATE } from "./acara";

/** A browser's `PushSubscription.toJSON()`, as the staff page hands it over. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
  keys: z.object({
    /** Uncompressed P-256 public key. */
    p256dh: base64urlBytes(65),
    /** 16-byte auth secret. */
    auth: base64urlBytes(16),
  }),
});

export interface NotificationsDeps {
  db: Database;
  clock: Clock;
  email: EmailSender;
  webPush: WebPush;
  /**
   * Who an Akun Staf is and which of its sessions are live: a Perangkat Push
   * lasts as long as its session. Chasing's H+1/Tidak Tertagih push reads
   * `adminLokasiOf` too (ticket 29): which Akun Staf are a Lokasi Mitra's own
   * Admin Lokasi is Identity's own fact.
   */
  identity: Pick<Identity, "staffRecipient" | "adminLokasiOf">;
  /** Where a failed send goes (error monitoring), while the outcome is kept. */
  reportError: ReportError;
  /** Turning push on or off is a staff write: one Entri Audit each. */
  audit: AuditLog;
  /**
   * Tagihan status reads for the reminder stop rule, plus Chasing's own two
   * queries (ticket 29): only billing reads its tables.
   */
  tagihan: Pick<Billing, "tagihan" | "payAfterAnchored" | "tagihanLewatJatuhTempo">;
  /** The Tagihan page's full URL from its link, for the family email's link into the app. */
  dokumenUrl: (link: string) => string;
  /** The order page's full URL from its Nomor Pemesanan, for a Pemesanan Makam's own messages. */
  pesananUrl: (nomor: string) => string;
  /** The Pilih makam list a declined order sends the family back to, with that order's number on the link. */
  pesanUlangUrl: (nomor: string) => string;
  /** A Pengurusan order's own page, where a family follows a TPU filing (ticket 45). */
  pengurusanUrl: (nomor: string) => string;
  /** An order Layanan's own page, from its Nomor Pemesanan. */
  layananUrl: (nomor: string) => string;
}

export interface PushDevice {
  endpoint: string;
  enabledAt: Date;
}

export type EnablePushResult = { ok: true } | WriteRefusal | { ok: false; reason: "perangkat_tidak_valid" };
export type DisablePushResult = { ok: true } | WriteRefusal;

/**
 * Every kind of Peringatan Staf (the staff events of the spec's Notifications
 * table). Later tickets that raise a new one add it here.
 */
export const staffAlertKinds = [
  "staf_saat_duka_baru",
  "staf_saat_duka_belum_dikonfirmasi",
  /** A family submitted a new Pemesanan Terencana; one alert, no re-alert (ticket 97). */
  "staf_terencana_baru",
  "staf_antrean_mendesak",
  "staf_antrean_eskalasi",
  "staf_tugas_lapangan_baru",
  "staf_hak_pakai_berakhir",
  "staf_calon_penghuni_diubah",
  /** A Bukti Pencairan was issued to a Lokasi Mitra's staff or to a Mitra Jasa (ticket 32). */
  "staf_bukti_pencairan",
  /** A Lokasi Mitra Saat Duka Tagihan reached H+1 overdue (ticket 29's Chasing). */
  "staf_tagihan_lewat_jatuh_tempo",
  /** Admin Platform declared a Lokasi Mitra Saat Duka Tagihan Tidak Tertagih (ticket 29). */
  "staf_tagihan_tidak_tertagih",
  /** A Mitra Jasa was handed a TPU job to accept or decline by its deadline (ticket 56). */
  "staf_pekerjaan_tpu_ditugaskan",
] as const;
export type StaffAlertKind = (typeof staffAlertKinds)[number];

/** What an earlier attempt of a queued Peringatan Staf already did, so a retry skips it. */
export interface StaffAlertLewati {
  lonceng?: boolean;
  email?: boolean;
  push?: boolean;
}

export interface StaffAlert {
  /** The Akun Staf; its Email Terverifikasi is read from the Akun, never taken from the caller. */
  to: { accountId: string };
  /** Which Peringatan Staf this is; names it in error reports, never shown. */
  kind: StaffAlertKind;
  /** The email to the Akun Staf's Email Terverifikasi: it may carry what the lock screen may not. */
  email: { subject: string; text: string };
  /**
   * What the push shows; `url` is the staff page tapping it opens
   * (`STAFF_AREA_PATH` or under it). A push shows on the lock screen, so
   * `title` and `body` carry no personal data: no names, phone numbers or
   * emails; name the work by Nomor Pemesanan, Lokasi and kind instead (the
   * email may carry the rest). Phone numbers and emails are refused.
   */
  push: PushNotification & { url: string };
}

export type StaffAlertResult =
  | {
      ok: true;
      /** `tanpa_email`: an Akun from before ADR 0004 with no Email Terverifikasi yet (push only). */
      email: "terkirim" | "gagal" | "tanpa_email";
      /** Pushes the push services accepted, and Perangkat Push removed because their browser dropped them. */
      push: { delivered: number; removed: number };
    }
  /** The Akun holds no staff role (Dinonaktifkan, or never invited): nothing is sent. */
  | { ok: false; reason: "bukan_akun_staf" };

/** One Peringatan Staf in the bell of the Akun it was sent to. */
export interface StaffAlertEntry {
  id: string;
  title: string;
  body: string;
  /** The staff page of its subject. */
  url: string;
  sentAt: Date;
  read: boolean;
}

export type StaffAlertsResult = { ok: true; unread: number; latest: StaffAlertEntry[] } | WriteRefusal;

/** How many Peringatan Staf the bell lists at most. */
export const STAFF_ALERTS_SHOWN = 10;

export interface Notifications {
  /** An Akun Staf turns push on for the browser it is using (one Perangkat Push per browser); audited. */
  enablePush(by: Actor, input: { subscription: PushSubscription }): Promise<EnablePushResult>;
  /** Turns push off for one browser of the signed-in Akun Staf; audited. */
  disablePush(by: Actor, input: { endpoint: string }): Promise<DisablePushResult>;
  /** The Akun's Perangkat Push, oldest first. */
  pushDevices(accountId: string): Promise<PushDevice[]>;
  /**
   * Sends a Peringatan Staf: by push to each Perangkat Push of the Akun and by
   * email to its Email Terverifikasi (ADR 0004). A Perangkat Push whose browser
   * dropped it is removed. Each channel is logged in the message log. One send,
   * never retried here: an alert queued for the worker (`peringatanAntreanTier1`,
   * `peringatanPenugasanTpu`) is retried by its tick; a failed one is never
   * escalated to a call row.
   */
  sendStaffAlert(alert: StaffAlert): Promise<StaffAlertResult>;
  /**
   * Queues a Peringatan Staf about a Tier 1 row of the Antrean (ticket 28), one per
   * Akun Staf in `to`: the first alert, the 30 min re-alert or the 90 min one. The
   * Work Queues module names the recipients and the moment. `within` is its open
   * transaction, in which it claims the alert's stage: the alert is queued only if
   * that commits. The worker's `kirimPeringatanAntreanTick` sends it.
   */
  peringatanAntreanTier1(input: PeringatanAntreanInput, within?: Database): Promise<PeringatanAntreanResult>;
  /**
   * Queues the Peringatan Staf that tells a Mitra Jasa a TPU job was handed to them
   * (ticket 56), on `within`, the assignment's open transaction: it exists only if the
   * assignment commits. The same worker tick as the Tier 1 alerts sends it (push + email,
   * logged); the words never name the family.
   */
  peringatanPenugasanTpu(input: PeringatanPenugasanTpuInput, within?: Database): Promise<PeringatanAntreanResult>;
  /**
   * The worker's tick: sends every queued Tier 1 alert not yet done and due, and retries a failed one
   * (4 sends, backed off; a channel that went through is not repeated). Idempotent. `opsi` carries
   * Queues' answer on whether an Antrean row is still open and untaken.
   */
  kirimPeringatanAntreanTick(opsi?: KirimPeringatanAntreanOpsi): Promise<{ dikirim: number }>;
  /**
   * The bell of the signed-in Akun Staf: how many of its Peringatan Staf are
   * unread, and the latest `limit` (newest first). Only its own.
   */
  staffAlerts(by: Actor, options?: { limit?: number }): Promise<StaffAlertsResult>;
  /** Opening the bell: every Peringatan Staf of the signed-in Akun Staf is read. */
  markStaffAlertsRead(by: Actor): Promise<{ ok: true } | WriteRefusal>;
  /**
   * Announces a Tagihan: records where its family messages go and queues the
   * Tagihan email plus, for a pay-first Tagihan, its H-1 and due-day
   * reminders. The worker's tick sends them. An order with no email gets a
   * "Telepon Pemesan" row at once instead.
   *
   * The checkout Server Actions that issue a Tagihan call this with the
   * address on the order (ticket 22 owns that address); a Tagihan paid through
   * the provider needs no such call, its receipt goes out through Billing's
   * payment effect instead.
   *
   * `within` is the issuing module's own open transaction: the announcement
   * then commits or rolls back with the Tagihan, so a Tagihan is never issued
   * without its address (and never announced without existing).
   */
  tagihanTerbit(input: TagihanTerbitInput, within?: Database): Promise<TagihanTerbitResult>;
  /**
   * Announces the Tagihan that replaces another (Harga Khusus): the address is
   * the one recorded for `tagihanLamaId`, and the family gets the standalone
   * "Tagihan terbit" email, since a reissue sends no confirmation of its own.
   * Same transaction rule as `tagihanTerbit`.
   */
  tagihanTerbitPengganti(
    input: Omit<TagihanTerbitInput, "email"> & { tagihanLamaId: string },
    within?: Database,
  ): Promise<TagihanTerbitResult>;
  /**
   * Announces a Bukti Pengembalian Dana to the Tagihan's own contact (the
   * address `tagihanTerbit` recorded); an order with no email opens a Telepon
   * Pemesan row instead. The Refunds module (ticket 31) calls this once a
   * transfer's Bukti exists.
   */
  pengembalianTerbit(input: PengembalianTerbitInput): Promise<PengembalianTerbitResult>;
  /**
   * The worker's send tick: sends every queued message whose time has come
   * (reminders only 08:00–20:00 WIB), retries with backoff, drops reminders
   * for settled Tagihan, and opens a "Telepon Pemesan" row when a money
   * message finally fails. Idempotent.
   */
  kirimPesanJatuhTempo(now: Date): Promise<KirimJatuhTempo>;
  /** Every logged message about one Tagihan, oldest first: what its order page shows. */
  pesanTagihan(tagihanId: string): Promise<PesanTercatat[]>;
  /**
   * Announces a Pemesanan Makam to its family: the order submitted, or the
   * same order confirmed with its Petak, the Lokasi's contact, the document
   * checklist and the pay-after Tagihan (ticket 23). Queued first, the worker's
   * tick sends it, one message per order per template. An order with no email
   * opens a call row for that Lokasi's own Admin Lokasi instead.
   */
  pesananDiajukan(input: PesananDiajukanInput): Promise<PesanPemesananResult>;
  pesananDikonfirmasi(input: PesananDikonfirmasiInput): Promise<PesanPemesananResult>;
  /**
   * A Tolak (ticket 24): the reason and the rebook link by email, plus the Tier 1
   * "Telepon Pemesan" row for Admin Platform to call the family within 2 h — the
   * row is opened whether or not the email went out, and it has no `lokasiId`,
   * so the call is Admin Platform's rather than the declining Lokasi's.
   */
  pesananDitolak(input: PesananDitolakInput): Promise<PesanPemesananResult>;
  /** An alternative the Pemesan has to accept or decline with one tap, seeing the new all-in total. */
  pesananAlternatifDitawarkan(input: PesananAlternatifDitawarkanInput): Promise<PesanPemesananResult>;
  /** A cancelled order: the Petak given back, the Tagihan cancelled and the money on its way back. */
  pesananDibatalkan(input: PesananDibatalkanInput): Promise<PesanPemesananResult>;
  /**
   * Announces the Bukti Pemesanan of a paid order: the link to the document that
   * proves the right, by email (ADR 0004; ticket 25). An order with no email
   * opens a call row, and CS hands the link over by hand.
   */
  pesananBuktiPemesanan(input: PesananBuktiPemesananInput): Promise<PesanPemesananResult>;
  /**
   * The family messages of a Pemesanan Terencana (ticket 37): its confirmation with
   * the payment hold and the Tagihan (one email, the Tagihan's own "terbit" email is
   * not sent beside it), a decline, a payment hold that ran out, and the Bukti
   * Pemesanan. `within` is the caller's open transaction: the message then commits or
   * rolls back with the change it announces. A Terencana order always has an Email
   * Terverifikasi, so none of these opens a call row.
   */
  terencanaDikonfirmasi(input: TerencanaDikonfirmasiInput, within?: Database): Promise<PesanTerencanaResult>;
  terencanaDitolak(input: TerencanaDitolakInput, within?: Database): Promise<PesanTerencanaResult>;
  terencanaBatasBayarLewat(input: TerencanaBatasBayarLewatInput, within?: Database): Promise<PesanTerencanaResult>;
  terencanaBukti(input: TerencanaBuktiInput, within?: Database): Promise<PesanTerencanaResult>;
  /**
   * The Admin Lokasi's answer to a Pembatalan request of a paid Terencana order (ticket 38): approved
   * (the Pemesan who paid is asked for the bank account the refund goes to), declined, or sent back
   * for a fix. `within` is the decision's own transaction, so the message commits with it.
   */
  pembatalanTerencana(input: PembatalanTerencanaInput, within?: Database): Promise<PesanPembatalanResult>;
  /**
   * Announces the Bukti Perpanjangan of a paid Perpanjangan by email (ticket 40),
   * logged against the Perpanjangan itself. With no email a call row opens.
   */
  buktiPerpanjanganTerbit(input: BuktiPerpanjanganTerbitInput, within?: Database): Promise<BuktiPerpanjanganTerbitResult>;
  /**
   * Announces a Saat Duka TPU confirmation to its family: the agreed burial, the
   * TPU office and Admin Platform contacts, both document lists, the price lines
   * and the pay-after Tagihan. One message per order, whatever runs twice.
   */
  pengurusanDikonfirmasi(input: PengurusanDikonfirmasiInput): Promise<PesanPengurusanResult>;
  /** Every logged message about one Pengurusan order, oldest first: what its order page shows. */
  pesanPengurusan(pengurusanId: string): Promise<PesanTercatat[]>;
  /** An order Layanan and its pay-first Tagihan, as its Pemesan is told (the family must pay before the work). */
  layananPesananTerbit(input: LayananPesananTerbitInput, within?: Database): Promise<PesanLayananResult>;
  /** The same for an order Layanan at a DKI TPU, which names no Lokasi Mitra (ticket 56). */
  layananTpuPesananTerbit(input: LayananTpuPesananTerbitInput, within?: Database): Promise<PesanLayananResult>;
  /** A job finished: the Pemesan is sent the link to its photo proof, which is why it is finished. */
  layananPekerjaanSelesai(input: LayananPekerjaanSelesaiInput, within?: Database): Promise<PesanLayananResult>;
  /** A new message from staff or the fulfiller in a job's thread: the Pemesan is told one arrived, never what it says (ticket 52). */
  layananPesanBaru(input: LayananPesanBaruInput, within?: Database): Promise<PesanLayananResult>;
  /** Every logged message about one order Layanan, oldest first. */
  pesanLayanan(nomorPemesanan: string): Promise<PesanTercatat[]>;
  /** Every logged message about one Pemesanan Makam, oldest first: what its order page shows. */
  pesanPemesanan(pemesananId: string): Promise<PesanTercatat[]>;
  /** The staff message log of one Akun Staf (its Peringatan Staf per channel), newest first. */
  pesanStaf(akunStafId: string, options?: { limit?: number }): Promise<PesanTercatat[]>;
  /** Every open "Telepon Pemesan" row, oldest first: what the Antrean's Tier 2 row reads. */
  teleponPemesanTerbuka(): Promise<TeleponPemesan[]>;
  /** Every "Telepon Pemesan" row ever opened for one subject, oldest first: the overdue list's own call log (ticket 29). */
  teleponPemesanRiwayat(subjectKind: string, subjectId: string): Promise<TeleponPemesanRiwayat[]>;
  /**
   * Whether the call to one subject has already been logged (a closed row): what
   * the Tier 1 "Saat Duka ditolak" row reads to know it is done. A subject that
   * was never called is false, whether a row is open for it or none was ever
   * opened.
   */
  teleponPemesanTercatat(subjectKind: string, subjectId: string): Promise<boolean>;
  /** An Admin Platform logs the call: the "Telepon Pemesan" row closes; audited. */
  catatPanggilan(by: Actor, input: CatatPanggilanInput): Promise<CatatPanggilanResult>;
  /**
   * Queues a pay-after Tagihan's four Chasing reminders (H+3/7/14/30 of its
   * overdue anchor), the moment the module that recorded the burial learns it
   * (ticket 29). Called once; calling it again queues nothing new.
   */
  jadwalkanChasing(input: JadwalkanChasingInput): Promise<{ dijadwalkan: number }>;
  /**
   * The worker's Chasing escalation tick (ticket 29): every Tagihan still
   * Lewat Jatuh Tempo at H+1 of its overdue anchor gets its "Telepon Pemesan"
   * row opened and its Lokasi's Admin Lokasi pushed once. Idempotent.
   */
  chasingEskalasiTick(now: Date): Promise<{ dieskalasi: number }>;
  /**
   * Queues the Admin Lokasi push "on Tidak Tertagih" (spec, Notifications'
   * reminder table) inside the caller's own transaction `tx`, so it commits with
   * the declaration itself; the worker's Chasing tick sends it (ticket 29).
   */
  antrekanPeringatanTidakTertagih(tx: Database, tagihan: Pick<PayAfterAnchored, "id" | "nomorTagihan" | "total" | "lokasiId">): Promise<void>;
  /**
   * A standalone note on a chased Tagihan's call log, by that Lokasi's Admin
   * Lokasi or Admin Platform: closes no row and is never a call (ticket 29).
   */
  tambahCatatanTagihan(by: Actor, input: TambahCatatanTagihanInput): Promise<TambahCatatanTagihanResult>;
  /** Every standalone note on one Tagihan's call log, oldest first. */
  catatanTagihan(tagihanId: string): Promise<CatatanTagihan[]>;
}

export function createNotifications(deps: NotificationsDeps): Notifications {
  const { db } = deps;

  /** The Akun's Perangkat Push whose session is still live, oldest first. */
  const devicesOf = async (tx: Database, accountId: string, liveSessionIds?: string[]) => {
    const live = liveSessionIds ?? (await deps.identity.staffRecipient(accountId))?.liveSessionIds ?? [];
    if (live.length === 0) return [];
    return tx
      .select()
      .from(notificationsPushDevice)
      .where(and(eq(notificationsPushDevice.accountId, accountId), inArray(notificationsPushDevice.sessionId, live)))
      .orderBy(asc(notificationsPushDevice.enabledAt), asc(notificationsPushDevice.id));
  };
  const countDevices = async (tx: Database, accountId: string) => (await devicesOf(tx, accountId)).length;

  /**
   * One send of a Peringatan Staf. `lewati` names what an earlier attempt of a queued
   * alert already did (the bell entry, a channel that went through), so a retry only
   * repeats what failed. `pushDicoba` is how many Perangkat Push were tried.
   */
  async function kirimPeringatanStaf(
    alert: StaffAlert,
    lewati: StaffAlertLewati,
    q: Database,
  ): Promise<HasilKirimPeringatan> {
    for (const text of [alert.push.title, alert.push.body]) {
      if (!lockScreenSafe(text)) {
        throw new Error("A Peringatan Staf push shows on the lock screen: no phone numbers or emails in its title or body");
      }
    }
    const url = staffPagePath(alert.push.url);
    if (!url) throw new Error(`A Peringatan Staf push opens a staff page (${STAFF_AREA_PATH} or ${STAFF_AREA_PATH}/…)`);

    const recipient = await deps.identity.staffRecipient(alert.to.accountId);
    if (!recipient) {
      await q.delete(notificationsPushDevice).where(eq(notificationsPushDevice.accountId, alert.to.accountId));
      return { result: { ok: false, reason: "bukan_akun_staf" }, pushDicoba: 0 };
    }

    // Kept for the bell regardless of how the email/push sends below turn out; a retry never lists it twice.
    if (!lewati.lonceng) {
      await q.insert(notificationsStaffAlert).values({
        accountId: recipient.accountId,
        title: alert.push.title,
        body: alert.push.body,
        url,
        sentAt: deps.clock.now(),
      });
    }

    let email: "terkirim" | "gagal" | "tanpa_email" = recipient.email ? "terkirim" : "tanpa_email";
    if (recipient.email && !lewati.email) {
      try {
        await deps.email.send({ to: recipient.email, subject: alert.email.subject, text: alert.email.text });
      } catch (error) {
        email = "gagal";
        deps.reportError(scrubbedError(error), {
          tags: { module: "notifications", channel: "email", template: alert.kind },
        });
      }
    }

    const push = { delivered: 0, removed: 0 };
    // A Perangkat Push whose session ended (Keluar, a new role grant, expiry) is gone.
    await q
      .delete(notificationsPushDevice)
      .where(
        and(
          eq(notificationsPushDevice.accountId, recipient.accountId),
          recipient.liveSessionIds.length > 0
            ? notInArray(notificationsPushDevice.sessionId, recipient.liveSessionIds)
            : undefined,
        ),
      );
    let tried = 0;
    for (const device of lewati.push ? [] : await devicesOf(q, recipient.accountId, recipient.liveSessionIds)) {
      tried += 1;
      const subscription = { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } };
      const result = await deps.webPush
        .send({ subscription, notification: { ...alert.push, url } })
        .catch((error: unknown) => {
          // Not delivered this time; the Perangkat Push is kept for the next Peringatan Staf.
          deps.reportError(scrubbedError(error), {
            tags: { module: "notifications", channel: "push", template: alert.kind },
          });
          return null;
        });
      if (result?.delivered) push.delivered++;
      if (result?.subscriptionGone) {
        await q.delete(notificationsPushDevice).where(eq(notificationsPushDevice.id, device.id));
        push.removed++;
      }
    }
    // The staff alert's own log: one row per channel attempted, so each retry of a
    // queued alert adds its own rows. A failed staff alert is never escalated to a call row.
    const now = deps.clock.now();
    if (!lewati.email) {
      await catatPesanStaf(q, {
        template: alert.kind,
        channel: "email",
        akunStafId: recipient.accountId,
        email: recipient.email,
        subject: alert.email.subject,
        body: alert.email.text,
        status: email,
        sentAt: recipient.email && email === "terkirim" ? now : null,
        now,
      });
    }
    if (tried > 0) {
      await catatPesanStaf(q, {
        template: alert.kind,
        channel: "push",
        akunStafId: recipient.accountId,
        email: null,
        subject: alert.push.title,
        body: alert.push.body,
        status: push.delivered > 0 ? "terkirim" : "gagal",
        sentAt: push.delivered > 0 ? now : null,
        now,
      });
    }
    return { result: { ok: true, email, push }, pushDicoba: tried };
  }

  const notifications: Notifications = {
    async enablePush(by, input) {
      const writer = pushWriter(by);
      if (!writer.ok) return writer;
      const parsed = pushSubscriptionSchema.safeParse(input.subscription);
      if (!parsed.success) return { ok: false, reason: "perangkat_tidak_valid" };
      const { endpoint, keys } = parsed.data;

      // The staff page confirms its browser's push on every visit: unchanged, nothing to write.
      const [current] = await db
        .select()
        .from(notificationsPushDevice)
        .where(eq(notificationsPushDevice.endpoint, endpoint));
      if (
        current?.accountId === by.accountId &&
        current.sessionId === by.sessionId &&
        current.p256dh === keys.p256dh &&
        current.auth === keys.auth
      ) {
        return { ok: true };
      }

      return deps.audit.staffWrite(db, async (tx, record) => {
        const before = await countDevices(tx, by.accountId);
        const device = {
          accountId: by.accountId,
          sessionId: by.sessionId,
          p256dh: keys.p256dh,
          auth: keys.auth,
          enabledAt: deps.clock.now(),
        };
        await tx
          .insert(notificationsPushDevice)
          .values({ endpoint, ...device })
          .onConflictDoUpdate({ target: notificationsPushDevice.endpoint, set: device });
        await record({
          actor: { accountId: by.accountId, role: writer.role },
          action: "akun.push_aktifkan",
          entity: { kind: "akun", id: by.accountId },
          before: { perangkatPush: before },
          after: { perangkatPush: await countDevices(tx, by.accountId) },
          reason: null,
        });
        return { ok: true as const };
      });
    },

    async disablePush(by, input) {
      const writer = pushWriter(by);
      if (!writer.ok) return writer;
      // Already off, or another Akun's browser: the write is refused (rolled back), so no Entri Audit; push is off either way.
      await deps.audit.staffWrite(db, async (tx, record) => {
        const before = await countDevices(tx, by.accountId);
        const removed = await tx
          .delete(notificationsPushDevice)
          .where(
            and(eq(notificationsPushDevice.accountId, by.accountId), eq(notificationsPushDevice.endpoint, input.endpoint)),
          )
          .returning({ id: notificationsPushDevice.id });
        if (removed.length === 0) return { ok: false as const };
        await record({
          actor: { accountId: by.accountId, role: writer.role },
          action: "akun.push_matikan",
          entity: { kind: "akun", id: by.accountId },
          before: { perangkatPush: before },
          after: { perangkatPush: await countDevices(tx, by.accountId) },
          reason: null,
        });
        return { ok: true as const };
      });
      return { ok: true };
    },

    async pushDevices(accountId) {
      const rows = await devicesOf(db, accountId);
      return rows.map((row) => ({ endpoint: row.endpoint, enabledAt: row.enabledAt }));
    },

    async sendStaffAlert(alert) {
      return (await kirimPeringatanStaf(alert, {}, db)).result;
    },

    async peringatanAntreanTier1(input, within) {
      return antrekanPeringatanAntrean(within ?? db, deps.clock, input);
    },

    async peringatanPenugasanTpu(input, within) {
      return antrekanPeringatanAntrean(within ?? db, deps.clock, {
        to: [input.to],
        tahap: "penugasan_tpu",
        row: { label: input.label, subjectLabel: input.subjectLabel, href: input.href },
      });
    },

    async kirimPeringatanAntreanTick(opsi) {
      return kirimPeringatanAntreanTick(db, deps.clock, kirimPeringatanStaf, opsi);
    },

    async staffAlerts(by, options = {}) {
      const refusal = writeRefusal(by, "akun.peringatan", akunResource(by.accountId));
      if (refusal) return refusal;
      const mine = eq(notificationsStaffAlert.accountId, by.accountId);
      const [rows, [unread]] = await Promise.all([
        db
          .select()
          .from(notificationsStaffAlert)
          .where(mine)
          .orderBy(desc(notificationsStaffAlert.sentAt), desc(notificationsStaffAlert.id))
          .limit(options.limit ?? STAFF_ALERTS_SHOWN),
        db
          .select({ n: count() })
          .from(notificationsStaffAlert)
          .where(and(mine, isNull(notificationsStaffAlert.readAt))),
      ]);
      return {
        ok: true,
        unread: unread?.n ?? 0,
        latest: rows.map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          url: row.url,
          sentAt: row.sentAt,
          read: row.readAt !== null,
        })),
      };
    },

    async markStaffAlertsRead(by) {
      const refusal = writeRefusal(by, "akun.peringatan", akunResource(by.accountId));
      if (refusal) return refusal;
      await db
        .update(notificationsStaffAlert)
        .set({ readAt: deps.clock.now() })
        .where(and(eq(notificationsStaffAlert.accountId, by.accountId), isNull(notificationsStaffAlert.readAt)));
      return { ok: true };
    },

    async tagihanTerbit(input, within) {
      return tagihanTerbit(within ? { ...deps, db: within } : deps, input);
    },

    async tagihanTerbitPengganti(input, within) {
      return tagihanTerbitPengganti(within ? { ...deps, db: within } : deps, input);
    },

    async pengembalianTerbit(input) {
      return pengembalianTerbit(deps, input);
    },

    async kirimPesanJatuhTempo(now) {
      return kirimPesanJatuhTempo(deps, now);
    },

    async pesanTagihan(tagihanId) {
      return pesanTagihan(deps, tagihanId);
    },

    async pesananDiajukan(input) {
      return pesananDiajukan(deps, input);
    },

    async pesananDikonfirmasi(input) {
      return pesananDikonfirmasi(deps, input);
    },
    async pengurusanDikonfirmasi(input) {
      return pengurusanDikonfirmasi(deps, input);
    },
    async pesanPengurusan(pengurusanId) {
      return pesanPengurusan(deps, pengurusanId);
    },

    async pesananDitolak(input) {
      return pesananDitolak(deps, input);
    },

    async pesananAlternatifDitawarkan(input) {
      return pesananAlternatifDitawarkan(deps, input);
    },

    async pesananDibatalkan(input) {
      return pesananDibatalkan(deps, input);
    },

    async pesananBuktiPemesanan(input) {
      return pesananBuktiPemesanan(deps, input);
    },

    async terencanaDikonfirmasi(input, within) {
      return terencanaDikonfirmasi(within ? { ...deps, db: within } : deps, input);
    },

    async terencanaDitolak(input, within) {
      return terencanaDitolak(within ? { ...deps, db: within } : deps, input);
    },

    async terencanaBatasBayarLewat(input, within) {
      return terencanaBatasBayarLewat(within ? { ...deps, db: within } : deps, input);
    },

    async terencanaBukti(input, within) {
      return terencanaBukti(within ? { ...deps, db: within } : deps, input);
    },

    async pembatalanTerencana(input, within) {
      return pembatalanTerencana(within ? { ...deps, db: within } : deps, input);
    },

    async buktiPerpanjanganTerbit(input, within) {
      return buktiPerpanjanganTerbit(within ? { ...deps, db: within } : deps, input);
    },

    async layananPesananTerbit(input, within) {
      return layananPesananTerbit(within ? { ...deps, db: within } : deps, input);
    },
    async layananTpuPesananTerbit(input, within) {
      return layananTpuPesananTerbit(within ? { ...deps, db: within } : deps, input);
    },
    async layananPekerjaanSelesai(input, within) {
      return layananPekerjaanSelesai(within ? { ...deps, db: within } : deps, input);
    },
    async layananPesanBaru(input, within) {
      return layananPesanBaru(within ? { ...deps, db: within } : deps, input);
    },
    async pesanLayanan(nomorPemesanan) {
      return pesanLayanan(deps, nomorPemesanan);
    },

    async pesanPemesanan(pemesananId) {
      return pesanPemesanan(deps, pemesananId);
    },

    async pesanStaf(akunStafId, options = {}) {
      const rows = await db
        .select()
        .from(notificationsMessage)
        .where(eq(notificationsMessage.akunStafId, akunStafId))
        .orderBy(desc(notificationsMessage.createdAt), desc(notificationsMessage.id))
        .limit(options.limit ?? 20);
      return rows.map((row) => ({
        id: row.id,
        template: row.template,
        channel: row.channel,
        status: row.status,
        subject: row.subject,
        attempts: row.attempts,
        sentAt: row.sentAt,
      }));
    },

    async teleponPemesanTerbuka() {
      return teleponPemesanTerbuka(db);
    },

    async teleponPemesanRiwayat(subjectKind, subjectId) {
      return teleponPemesanRiwayat(db, subjectKind, subjectId);
    },

    async teleponPemesanTercatat(subjectKind, subjectId) {
      return teleponPemesanTercatat(db, subjectKind, subjectId);
    },

    async catatPanggilan(by, input) {
      return catatPanggilan(deps, by, input);
    },

    async jadwalkanChasing(input) {
      return jadwalkanChasing(deps, input);
    },

    async chasingEskalasiTick(now) {
      return chasingEskalasiTick(
        { db, billing: deps.tagihan, identity: deps.identity, send: (alert) => notifications.sendStaffAlert(alert) },
        now,
      );
    },

    async antrekanPeringatanTidakTertagih(tx, tagihan) {
      await antrekanPeringatanLokasi(tx, deps.clock.now(), "staf_tagihan_tidak_tertagih", tagihan);
    },

    async tambahCatatanTagihan(by, input) {
      return tambahCatatanTagihan(deps, by, input);
    },

    async catatanTagihan(tagihanId) {
      return catatanTagihan(db, tagihanId);
    },
  };
  return notifications;
}

/** An email address anywhere in a text. */
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/**
 * One Peringatan Staf row in the message log, per channel: what the Akun Staf
 * was sent, and how it went. Staff messages are never queued and never
 * retried, so their row is written already sent (or gagal) as it happens.
 */
async function catatPesanStaf(
  db: Database,
  row: {
    template: string;
    channel: "email" | "push";
    akunStafId: string;
    email: string | null;
    subject: string;
    body: string;
    status: (typeof pesanStatuses)[number];
    sentAt: Date | null;
    now: Date;
  },
): Promise<void> {
  await db.insert(notificationsMessage).values({
    template: row.template,
    channel: row.channel,
    tagihanId: null,
    nomorTagihan: null,
    nomorPemesanan: null,
    email: row.email,
    akunStafId: row.akunStafId,
    subject: row.subject,
    body: row.body,
    status: row.status,
    attempts: 1,
    sendAfter: row.now,
    sentAt: row.sentAt,
    createdAt: row.now,
  });
}

/** Fit for a lock screen: no phone number (as error scrubbing finds them) and no email address. */
function lockScreenSafe(text: string): boolean {
  return scrubText(text) === text && !EMAIL.test(text);
}

/**
 * Only an Akun Staf turns push on or off, and only for itself (an Admin
 * Platform after TOTP). Allowed: the role its Entri Audit names, its first staff role.
 */
function pushWriter(by: Actor): { ok: true; role: StaffRole } | WriteRefusal {
  const refusal = writeRefusal(by, "akun.push", akunResource(by.accountId));
  if (refusal) return refusal;
  const role = staffRoles.find((held) => by.roles.includes(held));
  // `akun.push` is allowed only to an Akun holding a staff role, so there is always one.
  if (!role) return { ok: false, reason: "tidak_berwenang" };
  return { ok: true, role };
}

export { buktiPerpanjanganTerbitSchema, type BuktiPerpanjanganTerbitInput, type BuktiPerpanjanganTerbitResult } from "./pesan-perpanjangan";

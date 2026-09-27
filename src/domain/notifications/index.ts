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
 * notifications_telepon_pemesan.
 */
import { and, asc, count, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
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
  teleponPemesanTercatat,
  teleponPemesanTerbuka,
  type CatatPanggilanInput,
  type CatatPanggilanResult,
  type TeleponPemesan,
} from "./telepon-pemesan";
import {
  kirimPesanJatuhTempo,
  pesanTagihan,
  tagihanTerbit,
  type KirimJatuhTempo,
  type PesanTercatat,
  type TagihanTerbitInput,
  type TagihanTerbitResult,
} from "./pesan-keluarga";
import {
  pesananAlternatifDitawarkan,
  pesananDibatalkan,
  pesananDiajukan,
  pesananDikonfirmasi,
  pesananDitolak,
  pesanPemesanan,
  type PesanPemesananResult,
  type PesananAlternatifDitawarkanInput,
  type PesananDibatalkanInput,
  type PesananDiajukanInput,
  type PesananDikonfirmasiInput,
  type PesananDitolakInput,
} from "./pesan-pemesanan";
import { notificationsMessage, notificationsPushDevice, notificationsStaffAlert, pesanStatuses } from "./schema";

export { efekBuktiPembayaran, type BuktiEffectDeps } from "./efek-bukti";
export {
  catatPanggilanSchema,
  type CatatPanggilanInput,
  type CatatPanggilanResult,
  type TeleponPemesan,
} from "./telepon-pemesan";
export {
  pesananDiajukanSchema,
  pesananDikonfirmasiSchema,
  type PesanPemesananResult,
  type PesananDiajukanInput,
  type PesananDikonfirmasiInput,
} from "./pesan-pemesanan";
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
  /** Who an Akun Staf is and which of its sessions are live: a Perangkat Push lasts as long as its session. */
  identity: Pick<Identity, "staffRecipient">;
  /** Where a failed send goes (error monitoring), while the outcome is kept. */
  reportError: ReportError;
  /** Turning push on or off is a staff write: one Entri Audit each. */
  audit: AuditLog;
  /** Tagihan status reads for the reminder stop rule; only billing reads its tables. */
  tagihan: Pick<Billing, "tagihan">;
  /** The Tagihan page's full URL from its link, for the family email's link into the app. */
  dokumenUrl: (link: string) => string;
  /** The order page's full URL from its Nomor Pemesanan, for a Pemesanan Makam's own messages. */
  pesananUrl: (nomor: string) => string;
  /** The Pilih makam list a declined order sends the family back to, with that order's number on the link. */
  pesanUlangUrl: (nomor: string) => string;
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
  "staf_antrean_mendesak",
  "staf_antrean_eskalasi",
  "staf_tugas_lapangan_baru",
  "staf_hak_pakai_berakhir",
  "staf_calon_penghuni_diubah",
] as const;
export type StaffAlertKind = (typeof staffAlertKinds)[number];

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
   * dropped it is removed. Each channel is logged in the message log; a
   * failed staff alert is never retried nor escalated to a call row.
   */
  sendStaffAlert(alert: StaffAlert): Promise<StaffAlertResult>;
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
   */
  tagihanTerbit(input: TagihanTerbitInput): Promise<TagihanTerbitResult>;
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
  /** Every logged message about one Pemesanan Makam, oldest first: what its order page shows. */
  pesanPemesanan(pemesananId: string): Promise<PesanTercatat[]>;
  /** The staff message log of one Akun Staf (its Peringatan Staf per channel), newest first. */
  pesanStaf(akunStafId: string, options?: { limit?: number }): Promise<PesanTercatat[]>;
  /** Every open "Telepon Pemesan" row, oldest first: what the Antrean's Tier 2 row reads. */
  teleponPemesanTerbuka(): Promise<TeleponPemesan[]>;
  /**
   * Whether the call to one subject has already been logged (a closed row): what
   * the Tier 1 "Saat Duka ditolak" row reads to know it is done. A subject that
   * was never called is false, whether a row is open for it or none was ever
   * opened.
   */
  teleponPemesanTercatat(subjectKind: string, subjectId: string): Promise<boolean>;
  /** An Admin Platform logs the call: the "Telepon Pemesan" row closes; audited. */
  catatPanggilan(by: Actor, input: CatatPanggilanInput): Promise<CatatPanggilanResult>;
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

  return {
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
      for (const text of [alert.push.title, alert.push.body]) {
        if (!lockScreenSafe(text)) {
          throw new Error("A Peringatan Staf push shows on the lock screen: no phone numbers or emails in its title or body");
        }
      }
      const url = staffPagePath(alert.push.url);
      if (!url) throw new Error(`A Peringatan Staf push opens a staff page (${STAFF_AREA_PATH} or ${STAFF_AREA_PATH}/…)`);

      const recipient = await deps.identity.staffRecipient(alert.to.accountId);
      if (!recipient) {
        await db.delete(notificationsPushDevice).where(eq(notificationsPushDevice.accountId, alert.to.accountId));
        return { ok: false, reason: "bukan_akun_staf" };
      }

      // Kept for the bell regardless of how the email/push sends below turn out.
      await db.insert(notificationsStaffAlert).values({
        accountId: recipient.accountId,
        title: alert.push.title,
        body: alert.push.body,
        url,
        sentAt: deps.clock.now(),
      });

      let email: "terkirim" | "gagal" | "tanpa_email" = recipient.email ? "terkirim" : "tanpa_email";
      if (recipient.email) {
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
      await db
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
      for (const device of await devicesOf(db, recipient.accountId, recipient.liveSessionIds)) {
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
          await db.delete(notificationsPushDevice).where(eq(notificationsPushDevice.id, device.id));
          push.removed++;
        }
      }
      // The staff alert's own log: one row per channel attempted. A failed
      // staff alert is never retried nor escalated to a call row.
      const now = deps.clock.now();
      await catatPesanStaf(db, {
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
      if (tried > 0) {
        await catatPesanStaf(db, {
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
      return { ok: true, email, push };
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

    async tagihanTerbit(input) {
      return tagihanTerbit(deps, input);
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

    async pesananDitolak(input) {
      return pesananDitolak(deps, input);
    },

    async pesananAlternatifDitawarkan(input) {
      return pesananAlternatifDitawarkan(deps, input);
    },

    async pesananDibatalkan(input) {
      return pesananDibatalkan(deps, input);
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

    async teleponPemesanTercatat(subjectKind, subjectId) {
      return teleponPemesanTercatat(db, subjectKind, subjectId);
    },

    async catatPanggilan(by, input) {
      return catatPanggilan(deps, by, input);
    },
  };
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

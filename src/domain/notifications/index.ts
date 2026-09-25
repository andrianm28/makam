/**
 * Notifications: WhatsApp templates, the 08:00-20:00 WIB window, retry and email fallback, the message log.
 *
 * Built so far (ticket 21): Peringatan Staf, which always go by WhatsApp and
 * also by push to each Perangkat Push of the Akun Staf, and the Perangkat Push
 * themselves. The event table, message log, retries and reminder window
 * arrive with ticket 20.
 *
 * Owns table: notifications_push_device.
 */
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { akunResource, authorize, staffRoles, type Actor, type Identity } from "@/domain/identity";
import { STAFF_AREA_PATH, staffPagePath } from "@/lib/staff-area-path";
import type { Clock } from "@/ports/clock";
import type { PushNotification, PushSubscription, WebPush } from "@/ports/web-push";
import type { WhatsAppSender } from "@/ports/whatsapp-sender";
import { notificationsPushDevice } from "./schema";

const base64urlBytes = (length: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .refine((value) => Buffer.from(value, "base64url").length === length);

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
  whatsapp: WhatsAppSender;
  webPush: WebPush;
  /** Who an Akun Staf is and which of its sessions are live: a Perangkat Push lasts as long as its session. */
  identity: Pick<Identity, "staffRecipient">;
  /** Turning push on or off is a staff write: one Entri Audit each. */
  audit: AuditLog;
}

export interface PushDevice {
  endpoint: string;
  enabledAt: Date;
}

export type EnablePushResult = { ok: true } | { ok: false; reason: "tidak_berwenang" | "perlu_totp" | "perangkat_tidak_valid" };
export type DisablePushResult = { ok: true } | { ok: false; reason: "tidak_berwenang" | "perlu_totp" };

export interface StaffAlert {
  /** The Akun Staf; its WhatsApp number is read from the Akun, never taken from the caller. */
  to: { accountId: string };
  /** The approved template (`whatsapp-templates.md`, `staf_*`) and its parameters. */
  whatsapp: { template: string; parameters: string[] };
  /** What the push shows; `url` is the staff page tapping it opens (`STAFF_AREA_PATH` or under it). */
  push: PushNotification & { url: string };
}

export type StaffAlertResult =
  | {
      ok: true;
      whatsapp: "terkirim" | "gagal";
      /** Pushes the push services accepted, and Perangkat Push removed because their browser dropped them. */
      push: { delivered: number; removed: number };
    }
  /** The Akun holds no staff role (Dinonaktifkan, or never invited): nothing is sent. */
  | { ok: false; reason: "bukan_akun_staf" };

export interface Notifications {
  /** An Akun Staf turns push on for the browser it is using (one Perangkat Push per browser); audited. */
  enablePush(by: Actor, input: { subscription: PushSubscription }): Promise<EnablePushResult>;
  /** Turns push off for one browser of the signed-in Akun Staf; audited. */
  disablePush(by: Actor, input: { endpoint: string }): Promise<DisablePushResult>;
  /** The Akun's Perangkat Push, oldest first. */
  pushDevices(accountId: string): Promise<PushDevice[]>;
  /**
   * Sends a Peringatan Staf: always by WhatsApp, and by push to each Perangkat
   * Push of the Akun (push never replaces WhatsApp). A Perangkat Push whose
   * browser dropped it is removed.
   */
  sendStaffAlert(alert: StaffAlert): Promise<StaffAlertResult>;
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
      const refusal = pushRefusal(by);
      if (refusal) return refusal;
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
          actor: { accountId: by.accountId, role: actingRole(by) },
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
      const refusal = pushRefusal(by);
      if (refusal) return refusal;
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
          actor: { accountId: by.accountId, role: actingRole(by) },
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
      const url = staffPagePath(alert.push.url);
      if (!url) throw new Error(`A Peringatan Staf push opens a staff page (${STAFF_AREA_PATH} or ${STAFF_AREA_PATH}/…)`);

      const recipient = await deps.identity.staffRecipient(alert.to.accountId);
      if (!recipient) {
        await db.delete(notificationsPushDevice).where(eq(notificationsPushDevice.accountId, alert.to.accountId));
        return { ok: false, reason: "bukan_akun_staf" };
      }

      let whatsapp: "terkirim" | "gagal" = "terkirim";
      try {
        await deps.whatsapp.sendTemplate({
          to: recipient.phoneNumber,
          template: alert.whatsapp.template,
          language: "id",
          parameters: alert.whatsapp.parameters,
        });
      } catch {
        whatsapp = "gagal";
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
      for (const device of await devicesOf(db, recipient.accountId, recipient.liveSessionIds)) {
        const subscription = { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } };
        const result = await deps.webPush.send({ subscription, notification: { ...alert.push, url } }).catch(() => null);
        if (result?.delivered) push.delivered++;
        if (result?.subscriptionGone) {
          await db.delete(notificationsPushDevice).where(eq(notificationsPushDevice.id, device.id));
          push.removed++;
        }
      }
      return { ok: true, whatsapp, push };
    },
  };
}

/** Only an Akun Staf turns push on or off, and only for itself (an Admin Platform after TOTP). */
function pushRefusal(by: Actor): { ok: false; reason: "tidak_berwenang" | "perlu_totp" } | null {
  const authorization = authorize(by, "akun.push", akunResource(by.accountId));
  if (authorization.allowed) return null;
  return { ok: false, reason: authorization.reason === "perlu_totp" ? "perlu_totp" : "tidak_berwenang" };
}

/** The role an Entri Audit names for the Akun's own push setting: its first staff role. */
function actingRole(by: Actor) {
  return staffRoles.find((role) => by.roles.includes(role)) ?? "pemesan";
}



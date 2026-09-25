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
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { akunResource, authorize, staffRoles, type Actor } from "@/domain/identity";
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
  /** Turning push on or off is a staff write: one Entri Audit each. */
  audit: AuditLog;
}

export interface PushDevice {
  endpoint: string;
  enabledAt: Date;
}

export type EnablePushResult = { ok: true } | { ok: false; reason: "tidak_berwenang" | "perlu_totp" | "langganan_tidak_valid" };
export type DisablePushResult = { ok: true } | { ok: false; reason: "tidak_berwenang" | "perlu_totp" };

export interface StaffAlert {
  /** The Akun Staf, and the WhatsApp number of that Akun. */
  to: { accountId: string; phoneNumber: string };
  /** The approved template (`whatsapp-templates.md`, `staf_*`) and its parameters. */
  whatsapp: { template: string; parameters: string[] };
  /** What the push shows; `url` is the staff page tapping it opens (under /staf). */
  push: PushNotification & { url: string };
}

export interface StaffAlertResult {
  whatsapp: "terkirim" | "gagal";
  /** Pushes the push services accepted, and Perangkat Push removed because their browser dropped them. */
  push: { delivered: number; removed: number };
}

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

  const devicesOf = (accountId: string) =>
    db
      .select()
      .from(notificationsPushDevice)
      .where(eq(notificationsPushDevice.accountId, accountId))
      .orderBy(asc(notificationsPushDevice.enabledAt), asc(notificationsPushDevice.id));

  return {
    async enablePush(by, input) {
      const refusal = pushRefusal(by);
      if (refusal) return refusal;
      const parsed = pushSubscriptionSchema.safeParse(input.subscription);
      if (!parsed.success) return { ok: false, reason: "langganan_tidak_valid" };
      const { endpoint, keys } = parsed.data;

      return deps.audit.staffWrite(db, async (tx, record) => {
        const before = await countDevices(tx, by.accountId);
        await tx
          .insert(notificationsPushDevice)
          .values({ accountId: by.accountId, endpoint, p256dh: keys.p256dh, auth: keys.auth, enabledAt: deps.clock.now() })
          .onConflictDoUpdate({
            target: notificationsPushDevice.endpoint,
            set: { accountId: by.accountId, p256dh: keys.p256dh, auth: keys.auth, enabledAt: deps.clock.now() },
          });
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
      return deps.audit.staffWrite(db, async (tx, record) => {
        const before = await countDevices(tx, by.accountId);
        await tx
          .delete(notificationsPushDevice)
          .where(
            and(eq(notificationsPushDevice.accountId, by.accountId), eq(notificationsPushDevice.endpoint, input.endpoint)),
          );
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
    },

    async pushDevices(accountId) {
      const rows = await devicesOf(accountId);
      return rows.map((row) => ({ endpoint: row.endpoint, enabledAt: row.enabledAt }));
    },

    async sendStaffAlert(alert) {
      if (!alert.push.url.startsWith("/staf")) throw new Error("A Peringatan Staf push opens a staff page (/staf…)");

      let whatsapp: StaffAlertResult["whatsapp"] = "terkirim";
      try {
        await deps.whatsapp.sendTemplate({
          to: alert.to.phoneNumber,
          template: alert.whatsapp.template,
          language: "id",
          parameters: alert.whatsapp.parameters,
        });
      } catch {
        whatsapp = "gagal";
      }

      const push = { delivered: 0, removed: 0 };
      for (const device of await devicesOf(alert.to.accountId)) {
        const subscription = { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } };
        const result = await deps.webPush.send({ subscription, notification: alert.push }).catch(() => null);
        if (result?.delivered) push.delivered++;
        if (result?.subscriptionGone) {
          await db.delete(notificationsPushDevice).where(eq(notificationsPushDevice.id, device.id));
          push.removed++;
        }
      }
      return { whatsapp, push };
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

async function countDevices(tx: Database, accountId: string): Promise<number> {
  const rows = await tx
    .select({ id: notificationsPushDevice.id })
    .from(notificationsPushDevice)
    .where(eq(notificationsPushDevice.accountId, accountId));
  return rows.length;
}


import { createECDH, randomBytes } from "node:crypto";
import { FakeWebPush } from "@/adapters/memory";
import type { Database } from "@/db/client";
import type { Billing } from "@/domain/billing";
import type { Actor, StaffRole } from "@/domain/identity";
import { createNotifications } from "@/domain/notifications";
import type { ReportError } from "@/lib/observability/report-error";
import type { EmailSender } from "@/ports/email-sender";
import type { PushSubscription, WebPush } from "@/ports/web-push";
import { TEST_PUBLIC_ORIGIN, billingOnTestDatabase } from "./billing";
import { actorOf, identityOnTestDatabase, logIn, signedInAdminPlatform } from "./identity";

/**
 * The Notifications module next to Billing and identity on the test Postgres,
 * sharing the one fake Clock, Audit Log and fake EmailSender (unless `email`
 * gives Notifications its own).
 */
export function notificationsOnTestDatabase(
  db: Database,
  options: { email?: EmailSender; webPush?: WebPush } = {},
) {
  const setup = billingOnTestDatabase(db);
  const webPush = new FakeWebPush();
  /** What error monitoring received. */
  const reported: { error: unknown; context: Parameters<ReportError>[1] }[] = [];
  const notifications = createNotifications({
    db,
    clock: setup.clock,
    email: options.email ?? setup.email,
    webPush: options.webPush ?? webPush,
    reportError: (error, context) => reported.push({ error, context }),
    identity: setup.identity,
    audit: setup.audit,
    tagihan: setup.billing,
    dokumenUrl: (link) => `${TEST_PUBLIC_ORIGIN}/dokumen/${link}`,
    pesananUrl: (nomor) => `${TEST_PUBLIC_ORIGIN}/pesanan/${nomor}`,
  });
  return { ...setup, webPush, notifications, reported };
}

/**
 * The one Billing read Notifications needs (a Tagihan's status, to stop a
 * reminder once the money is in) for a setup that composes no Billing of its
 * own: no Tagihan is ever found. Tests that issue Tagihan messages use
 * `notificationsOnTestDatabase`, which has the real module.
 */
export const TAGIHAN_TIDAK_ADA: Pick<Billing, "tagihan"> = { tagihan: async () => null };

/** An Akun Staf holding `role`, invited by the first Admin Platform and logged in with a Kode Masuk. */
export async function signedInStaff(
  setup: ReturnType<typeof identityOnTestDatabase>,
  role: Exclude<StaffRole, "admin_platform">,
  email = `${role.replace("_", ".")}@contoh.id`,
) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  return invitedStaff(setup, admin, role, email);
}

/** An Akun Staf holding `role`, invited by `admin` (a signed-in Admin Platform) and logged in with a Kode Masuk. */
export async function invitedStaff(
  setup: ReturnType<typeof identityOnTestDatabase>,
  admin: Actor,
  role: Exclude<StaffRole, "admin_platform">,
  email: string,
) {
  // An Admin Lokasi invite names its Lokasi Mitra (the identity module keeps the id as given).
  const lokasiId = role === "admin_lokasi" ? "5d1f4c2e-0000-4000-8000-000000000001" : undefined;
  const invited = await setup.identity.inviteStaff(admin, { email, phoneNumber: "082222222222", role, lokasiId });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  const { cookies } = await logIn(setup, email);
  return actorOf(setup.identity, cookies);
}

/** The same Akun logged in on another browser (a minute later, past the Kode Masuk resend wait): its own session. */
export async function loggedInOnAnotherBrowser(setup: ReturnType<typeof identityOnTestDatabase>, email: string) {
  setup.clock.advance({ minutes: 1 });
  const { cookies } = await logIn(setup, email);
  return { actor: await actorOf(setup.identity, cookies), cookies };
}

let device = 0;

/** What `pushManager.subscribe()` hands the page on one browser: a push service endpoint and the browser's keys. */
export function browserPushSubscription(): PushSubscription {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/perangkat-${++device}-${randomBytes(4).toString("hex")}`,
    keys: { p256dh: ecdh.getPublicKey("base64url"), auth: randomBytes(16).toString("base64url") },
  };
}

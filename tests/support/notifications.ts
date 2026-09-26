import { createECDH, randomBytes } from "node:crypto";
import { FakeWebPush } from "@/adapters/memory";
import type { Database } from "@/db/client";
import type { Actor, StaffRole } from "@/domain/identity";
import { createNotifications } from "@/domain/notifications";
import type { ReportError } from "@/lib/observability/report-error";
import type { PushSubscription, WebPush } from "@/ports/web-push";
import type { WhatsAppSender } from "@/ports/whatsapp-sender";
import { actorOf, identityOnTestDatabase, logInByOtp, signedInAdminPlatform } from "./identity";

/** The Notifications module next to identity on the test Postgres, sharing its Clock, Audit Log and fake WhatsApp. */
export function notificationsOnTestDatabase(
  db: Database,
  options: { whatsapp?: WhatsAppSender; webPush?: WebPush } = {},
) {
  const setup = identityOnTestDatabase(db);
  const webPush = new FakeWebPush();
  /** What error monitoring received. */
  const reported: { error: unknown; context: Parameters<ReportError>[1] }[] = [];
  const notifications = createNotifications({
    db,
    clock: setup.clock,
    whatsapp: options.whatsapp ?? setup.whatsapp,
    webPush: options.webPush ?? webPush,
    reportError: (error, context) => reported.push({ error, context }),
    identity: setup.identity,
    audit: setup.audit,
  });
  return { ...setup, webPush, notifications, reported };
}

/** An Akun Staf holding `role`, invited by the first Admin Platform and logged in by OTP. */
export async function signedInStaff(
  setup: ReturnType<typeof identityOnTestDatabase>,
  role: Exclude<StaffRole, "admin_platform">,
  phoneNumber = "082222222222",
) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  return invitedStaff(setup, admin, role, phoneNumber);
}

/** An Akun Staf holding `role`, invited by `admin` (a signed-in Admin Platform) and logged in by OTP. */
export async function invitedStaff(
  setup: ReturnType<typeof identityOnTestDatabase>,
  admin: Actor,
  role: Exclude<StaffRole, "admin_platform">,
  phoneNumber: string,
) {
  const invited = await setup.identity.inviteStaff(admin, { phoneNumber, email: `${role}@contoh.id`, role });
  if (!invited.ok) throw new Error(`invite refused: ${invited.reason}`);
  const { cookies } = await logInByOtp(setup.identity, setup.whatsapp, phoneNumber);
  return actorOf(setup.identity, cookies);
}

/** The same Akun logged in by OTP on another browser (a minute later, past the OTP resend wait): its own session. */
export async function loggedInOnAnotherBrowser(setup: ReturnType<typeof identityOnTestDatabase>, phoneNumber: string) {
  setup.clock.advance({ minutes: 1 });
  const { cookies } = await logInByOtp(setup.identity, setup.whatsapp, phoneNumber);
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

import { createECDH } from "node:crypto";
import webpush from "web-push";
import type { VapidKeys } from "@/lib/env";
import type { Clock } from "@/ports/clock";
import type { PushNotification, PushResult, PushSubscription, WebPush } from "@/ports/web-push";

/** How long the push service keeps an undelivered staff alert (the phone may be offline): 1 day. */
const TTL_SECONDS = 24 * 60 * 60;
/** VAPID tokens live 12 h (RFC 8292 allows at most 24 h). */
const VAPID_TOKEN_SECONDS = 12 * 60 * 60;
const REQUEST_TIMEOUT_MS = 10_000;

export interface VapidWebPushOptions extends VapidKeys {
  clock: Clock;
}

/**
 * The live WebPush adapter: the Web Push protocol (RFC 8030) with payload
 * encryption (RFC 8291, aes128gcm) and VAPID (RFC 8292). The `web-push`
 * library encrypts and signs; this adapter stamps the token's expiry from the
 * Clock and sends with fetch. No external account: the push service is
 * whichever one the browser subscribed with (FCM, Mozilla, Apple).
 *
 * The payload is the JSON the service worker (`public/sw.js`) reads:
 * `{ title, body, url? }`.
 */
export class VapidWebPush implements WebPush {
  readonly #options: VapidWebPushOptions;

  constructor(options: VapidWebPushOptions) {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(options.privateKey, "base64url"));
    if (ecdh.getPublicKey("base64url") !== options.publicKey) {
      throw new Error("VAPID private key does not match the public key");
    }
    this.#options = options;
  }

  async send(push: { subscription: PushSubscription; notification: PushNotification }): Promise<PushResult> {
    const { subscription, notification } = push;
    const payload = JSON.stringify({ title: notification.title, body: notification.body, url: notification.url });
    // `vapidDetails: null` (the library's documented opt-out, missing from its types) leaves
    // signing to us, so the token's expiry comes from the Clock.
    const options = { TTL: TTL_SECONDS, urgency: "high", contentEncoding: "aes128gcm", vapidDetails: null };
    const details = webpush.generateRequestDetails(
      subscription,
      payload,
      options as unknown as webpush.RequestOptions,
    ) as unknown as { headers: Record<string, unknown>; body: Buffer | null };
    const audience = new URL(subscription.endpoint).origin;
    const expiration = Math.floor(this.#options.clock.now().getTime() / 1000) + VAPID_TOKEN_SECONDS;
    const { Authorization } = webpush.getVapidHeaders(
      audience,
      this.#options.subject,
      this.#options.publicKey,
      this.#options.privateKey,
      "aes128gcm",
      expiration,
    );

    let status: number;
    try {
      const response = await fetch(subscription.endpoint, {
        method: "POST",
        headers: { ...stringHeaders(details.headers), Authorization },
        body: details.body ? new Uint8Array(details.body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      status = response.status;
      await response.body?.cancel();
    } catch {
      return { delivered: false, subscriptionGone: false };
    }
    if (status === 404 || status === 410) return { delivered: false, subscriptionGone: true };
    return { delivered: status >= 200 && status < 300, subscriptionGone: false };
  }
}

function stringHeaders(headers: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  // fetch sets Content-Length itself.
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== "content-length") result[name] = String(value);
  }
  return result;
}

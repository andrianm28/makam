import { createECDH, randomBytes, type ECDH } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import ece from "http_ece";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeClock, FakeWebPush } from "@/adapters/memory";
import { VapidWebPush } from "@/adapters/live/vapid-web-push";
import { wib } from "@/lib/time/jakarta";
import type { PushNotification, PushSubscription, WebPush } from "@/ports/web-push";

/**
 * One contract for the WebPush port, run against the in-memory fake and the
 * live VAPID adapter (the live one against a local stand-in push service that
 * decrypts what it receives with the browser's keys, as a real one would hand
 * it to the service worker).
 */
interface WebPushHarness {
  webPush: WebPush;
  /** A fresh subscription, as `pushManager.subscribe()` returns it. */
  subscribe(): PushSubscription;
  /** The push service forgets the subscription (the browser dropped it). */
  forget(subscription: PushSubscription): void;
  /** What reached each subscription, decoded. */
  received(subscription: PushSubscription): PushNotification[];
}

const VAPID = {
  publicKey: "BI9GUoKHw9z_J777Fi5TjIhzfL2qIT1Mwt43yL-4ClEIJe4nqMPuqV6N4fhPf0H0HElivGiE4yiJ63gf5uyry40",
  privateKey: "Xpgeqwz12bqNco2x4H5dpW57Hqrr1zVY6ift2jx5YYc",
  subject: "mailto:ops@makam.co.id",
};

/** The browser's side of a subscription: its P-256 key pair and auth secret. */
function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, keys: { p256dh: ecdh.getPublicKey("base64url"), auth: auth.toString("base64url") } };
}

function fakeHarness(): WebPushHarness {
  const webPush = new FakeWebPush();
  let next = 0;
  return {
    webPush,
    subscribe: () => ({ endpoint: `https://push.example/fake/${++next}`, keys: browserKeys().keys }),
    forget: (subscription) => webPush.expireSubscription(subscription.endpoint),
    received: (subscription) =>
      webPush.sent.filter((push) => push.subscription.endpoint === subscription.endpoint).map((push) => push.notification),
  };
}

interface ReceivedRequest {
  path: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** A local push service: 201 for a known subscription, 410 once forgotten, 500 on demand. */
class StandInPushService {
  readonly requests: ReceivedRequest[] = [];
  readonly gone = new Set<string>();
  readonly failing = new Set<string>();
  readonly #keys = new Map<string, { ecdh: ECDH; auth: string }>();
  #server?: Server;
  origin = "";

  async start() {
    this.#server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const path = request.url ?? "";
        this.requests.push({ path, headers: request.headers, body: Buffer.concat(chunks) });
        response.statusCode = this.gone.has(path) ? 410 : this.failing.has(path) ? 500 : 201;
        response.end();
      });
    });
    await new Promise<void>((resolve) => this.#server!.listen(0, "127.0.0.1", resolve));
    this.origin = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
  }

  async stop() {
    await new Promise((resolve) => this.#server?.close(resolve));
  }

  subscribe(): PushSubscription {
    const { ecdh, keys } = browserKeys();
    const path = `/push/${randomBytes(8).toString("hex")}`;
    this.#keys.set(path, { ecdh, auth: keys.auth });
    return { endpoint: `${this.origin}${path}`, keys };
  }

  pathOf(subscription: PushSubscription) {
    return new URL(subscription.endpoint).pathname;
  }

  received(subscription: PushSubscription): PushNotification[] {
    const path = this.pathOf(subscription);
    const { ecdh, auth } = this.#keys.get(path)!;
    return this.requests
      .filter((request) => request.path === path && !this.gone.has(path) && !this.failing.has(path))
      .map((request) =>
        JSON.parse(ece.decrypt(request.body, { version: "aes128gcm", privateKey: ecdh, authSecret: auth }).toString("utf8")),
      );
  }
}

const service = new StandInPushService();
beforeAll(() => service.start());
afterAll(() => service.stop());

/** Fixed so the VAPID token's expiry can be checked (and stays within 24 h of real time, as push services require). */
const clock = new FakeClock(wib("2026-09-01 09:00"));

function liveHarness(): WebPushHarness {
  return {
    webPush: new VapidWebPush({ ...VAPID, clock }),
    subscribe: () => service.subscribe(),
    forget: (subscription) => service.gone.add(service.pathOf(subscription)),
    received: (subscription) => service.received(subscription),
  };
}

const ALERT: PushNotification = {
  title: "Pemesanan Saat Duka baru",
  body: "MKM-2026-000123 menunggu konfirmasi Admin Lokasi",
  url: "/staf/admin-lokasi",
};

describe.each([
  ["in-memory fake", fakeHarness],
  ["live VAPID adapter", liveHarness],
])("WebPush port contract: %s", (_name, harness) => {
  it("delivers a staff alert to a subscription, with where tapping it opens", async () => {
    const { webPush, subscribe, received } = harness();
    const subscription = subscribe();

    expect(await webPush.send({ subscription, notification: ALERT })).toEqual({ delivered: true, subscriptionGone: false });
    expect(received(subscription)).toEqual([ALERT]);
  });

  it("reports a subscription the browser dropped as gone, and delivers nothing to it", async () => {
    const { webPush, subscribe, forget, received } = harness();
    const subscription = subscribe();
    forget(subscription);

    expect(await webPush.send({ subscription, notification: ALERT })).toEqual({ delivered: false, subscriptionGone: true });
    expect(received(subscription)).toEqual([]);
  });
});

describe("live VAPID adapter", () => {
  const decodeJwtPayload = (authorization: string) => {
    const token = /^vapid t=([^,]+), k=(.+)$/.exec(authorization)?.[1] ?? "";
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
  };

  it("signs each push with VAPID for the push service's origin, expiring 12 h after the Clock's now", async () => {
    const webPush = new VapidWebPush({ ...VAPID, clock });
    const subscription = service.subscribe();

    await webPush.send({ subscription, notification: ALERT });

    const request = service.requests.at(-1)!;
    expect(request.headers.authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${VAPID.publicKey}$`));
    expect(decodeJwtPayload(request.headers.authorization!)).toEqual({
      aud: service.origin,
      sub: VAPID.subject,
      exp: wib("2026-09-01 21:00").getTime() / 1000,
    });
    expect(request.headers).toMatchObject({ "content-encoding": "aes128gcm", urgency: "high" });
    expect(Number(request.headers.ttl)).toBeGreaterThan(0);
  });

  it("treats 404 like 410: the subscription is gone", async () => {
    const webPush = new VapidWebPush({ ...VAPID, clock });
    const server = createServer((_request, response) => {
      response.statusCode = 404;
      response.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/push/x`;
    try {
      expect(await webPush.send({ subscription: { endpoint, keys: browserKeys().keys }, notification: ALERT })).toEqual({
        delivered: false,
        subscriptionGone: true,
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("reports a push service failure as not delivered, keeping the subscription", async () => {
    const webPush = new VapidWebPush({ ...VAPID, clock });
    const subscription = service.subscribe();
    service.failing.add(service.pathOf(subscription));

    expect(await webPush.send({ subscription, notification: ALERT })).toEqual({ delivered: false, subscriptionGone: false });
  });

  it("refuses a private key that does not belong to the public key", () => {
    expect(
      () => new VapidWebPush({ ...VAPID, privateKey: "_ePH1MZPQEBgQ9idRe19cAhO6_v7NU8maCcgKgB1fOs", clock }),
    ).toThrow(/VAPID private key does not match the public key/);
  });
});

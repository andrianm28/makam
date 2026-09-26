/*
 * The staff area's service worker (registered with scope STAFF_AREA_PATH by
 * src/app/staf/push-panel-client.tsx). It only shows Peringatan Staf pushes and
 * opens the staff page a tapped one names; it caches nothing.
 *
 * A push's payload is the JSON the live WebPush adapter sends
 * (src/adapters/live/vapid-web-push.ts): { title, body, url }, url a /staf page.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** The staff area. Must equal STAFF_AREA_PATH in src/lib/staff-area-path.ts (checked by its test). */
const STAFF_AREA_PATH = "/staf";

/** True for the staff area itself or a page under it: `/staf`, `/staf/…`; never `/stafxyz`. */
function inStaffArea(pathname) {
  return pathname === STAFF_AREA_PATH || pathname.startsWith(STAFF_AREA_PATH + "/");
}

/**
 * Only staff pages on this site open from a push; anything else falls back to
 * the staff area's start. Mirrors staffPagePath in src/lib/staff-area-path.ts.
 */
function staffPage(url) {
  if (typeof url !== "string" || !url.startsWith("/")) return STAFF_AREA_PATH;
  let parsed;
  try {
    parsed = new URL(url, self.location.origin);
  } catch {
    return STAFF_AREA_PATH;
  }
  if (parsed.origin !== self.location.origin || !inStaffArea(parsed.pathname)) return STAFF_AREA_PATH;
  return parsed.pathname + parsed.search + parsed.hash;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Makam.co.id Area Staf";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      icon: "/icons/staf-192.png",
      badge: "/icons/staf-192.png",
      lang: "id",
      data: { url: staffPage(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(staffPage(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    (async () => {
      // An open staff window goes to the page; otherwise a new one opens (the installed app on a phone).
      const windows = await self.clients.matchAll({ type: "window" });
      for (const client of windows) {
        if (inStaffArea(new URL(client.url).pathname)) {
          const navigated = (await client.navigate(target)) || client;
          await navigated.focus().catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

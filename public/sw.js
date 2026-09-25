/*
 * The staff area's service worker (registered with scope /staf by
 * src/app/staf/push-panel-client.tsx). It only shows Peringatan Staf pushes and
 * opens the staff page a tapped one names; it caches nothing.
 *
 * A push's payload is the JSON the live WebPush adapter sends
 * (src/adapters/live/vapid-web-push.ts): { title, body, url }, url a /staf page.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** Only staff pages open from a push; anything else falls back to the staff area's start. */
function staffPage(url) {
  return typeof url === "string" && url.startsWith("/staf") ? url : "/staf";
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
        if (new URL(client.url).pathname.startsWith("/staf")) {
          const navigated = (await client.navigate(target)) || client;
          await navigated.focus().catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

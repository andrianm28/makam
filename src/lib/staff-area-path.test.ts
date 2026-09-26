import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { STAFF_AREA_PATH, staffPagePath } from "./staff-area-path";

const ORIGIN = "https://makam.co.id";

/** Where the service worker (`public/sw.js`) opens a tapped push naming `url`, run with a stand-in `self`. */
async function serviceWorkerOpens(url: unknown): Promise<string> {
  const listeners = new Map<string, (event: unknown) => void>();
  const opened: string[] = [];
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    skipWaiting: () => undefined,
    registration: { showNotification: async () => undefined },
    clients: {
      claim: async () => undefined,
      matchAll: async () => [],
      openWindow: async (target: string) => {
        opened.push(target);
      },
    },
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self, URL });
  let done: Promise<unknown> = Promise.resolve();
  listeners.get("notificationclick")?.({
    notification: { data: { url }, close: () => undefined },
    waitUntil: (promise: Promise<unknown>) => {
      done = promise;
    },
  });
  await done;
  const [target] = opened;
  if (!target) throw new Error("the service worker opened nothing");
  return target.slice(ORIGIN.length);
}

/** Each push `url`, and the page a tap opens: the staff page itself, or the staff area's start. */
const cases: [string, string][] = [
  ["/staf", "/staf"],
  ["/staf/admin-lokasi", "/staf/admin-lokasi"],
  ["/staf/petugas-lapangan?tugas=12#peta", "/staf/petugas-lapangan?tugas=12#peta"],
  ["/stafxyz", "/staf"],
  ["/staffing/admin-lokasi", "/staf"],
  ["/akun", "/staf"],
  ["/staf/../akun", "/staf"],
  ["//contoh.example/staf", "/staf"],
  ["/\\contoh.example/staf", "/staf"],
  ["https://contoh.example/staf", "/staf"],
  ["staf/admin-lokasi", "/staf"],
];

describe("the staff area path", () => {
  it.each(cases)("a push naming %s opens %s", (url, opens) => {
    expect(staffPagePath(url) ?? STAFF_AREA_PATH).toBe(opens);
  });

  it.each(cases)("the service worker agrees: a tapped push naming %s opens %s", async (url, opens) => {
    expect(await serviceWorkerOpens(url)).toBe(opens);
  });

  it("is the one the service worker names", () => {
    const literal = /const STAFF_AREA_PATH = "([^"]*)";/.exec(readFileSync("public/sw.js", "utf8"))?.[1];
    expect(literal).toBe(STAFF_AREA_PATH);
  });

  it("is the installed staff app's id, start and scope", () => {
    const manifest = JSON.parse(readFileSync("public/staf.webmanifest", "utf8"));
    expect([manifest.id, manifest.start_url, manifest.scope]).toEqual([STAFF_AREA_PATH, STAFF_AREA_PATH, STAFF_AREA_PATH]);
  });
});

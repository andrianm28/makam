import { existsSync } from "node:fs";

/**
 * A headless Chromium for the real PdfRenderer test: CHROMIUM_PATH, else the
 * image's chromium-headless-shell, a system Chromium, or Google Chrome (which
 * GitHub's ubuntu runners have). Throws when there is none, so the test fails
 * instead of skipping.
 */
export function findChromium(): string {
  const candidates = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium-headless-shell",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ].filter((path): path is string => Boolean(path));
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error(`No Chromium found for the PdfRenderer test; set CHROMIUM_PATH (tried ${candidates.join(", ")})`);
  return found;
}

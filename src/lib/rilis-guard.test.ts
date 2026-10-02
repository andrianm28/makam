import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { scheduledTicks } from "@/domain/scheduler";
import { fiturUntukRute, fiturUntukTick } from "./rilis-peta";

const appDir = join(__dirname, "..", "app");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

/** `(site)/akun/[x]/page.tsx` becomes `/akun/[x]`: route groups are not in the URL. */
function routeOf(file: string): string {
  const parts = relative(appDir, file).split(sep).slice(0, -1).filter((part) => !part.startsWith("(")).filter((part) => !part.startsWith("_"));
  return `/${parts.join("/")}`;
}

describe("Release gate guard (ADR 0006)", () => {
  it("every page has a release: a new page under an unmapped area fails here until it is added to the map", () => {
    const unmapped = pages(appDir)
      .map(routeOf)
      .filter((route) => fiturUntukRute(route) === undefined);
    expect(unmapped).toEqual([]);
  });

  it("every scheduled tick has a release", () => {
    const unmapped = scheduledTicks.map((tick) => tick.name).filter((name) => fiturUntukTick(name) === undefined);
    expect(unmapped).toEqual([]);
  });
});

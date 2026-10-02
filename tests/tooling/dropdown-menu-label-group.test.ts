import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("DropdownMenuLabel (Base UI GroupLabel)", () => {
  it("is only used in a file that also uses DropdownMenuGroup, or Base UI error #31 crashes the open menu", () => {
    const offenders = tsxFiles(join(process.cwd(), "src"))
      .filter((f) => !f.endsWith(join("components", "ui", "dropdown-menu.tsx")))
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return (
          text.includes("<DropdownMenuLabel") &&
          !text.includes("<DropdownMenuGroup")
        );
      });
    expect(offenders).toEqual([]);
  });
});

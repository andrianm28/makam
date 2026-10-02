import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Count of `<DropdownMenuLabel>` elements with no `<DropdownMenuGroup>` ancestor. */
function bareLabels(source: string): number {
  const file = ts.createSourceFile("x.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let bare = 0;
  const tagName = (n: ts.Node) =>
    ts.isJsxElement(n) ? n.openingElement.tagName.getText(file) : ts.isJsxSelfClosingElement(n) ? n.tagName.getText(file) : null;
  const visit = (node: ts.Node, grouped: boolean) => {
    const tag = tagName(node);
    if (tag === "DropdownMenuLabel" && !grouped) bare += 1;
    const inside = grouped || tag === "DropdownMenuGroup";
    node.forEachChild((c) => visit(c, inside));
  };
  visit(file, false);
  return bare;
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("DropdownMenuLabel (Base UI GroupLabel) sits inside a DropdownMenuGroup, or Base UI error #31 crashes the open menu", () => {
  it("accepts a Label inside a Group", () => {
    expect(bareLabels(`const a = <Menu><DropdownMenuGroup><DropdownMenuLabel>A</DropdownMenuLabel></DropdownMenuGroup></Menu>;`)).toBe(0);
  });

  it("rejects a bare Label even when another menu in the same file is grouped", () => {
    const source = `
      const a = <DropdownMenuGroup><DropdownMenuLabel>A</DropdownMenuLabel></DropdownMenuGroup>;
      const b = <DropdownMenuContent><DropdownMenuLabel>B</DropdownMenuLabel></DropdownMenuContent>;`;
    expect(bareLabels(source)).toBe(1);
  });

  it("holds for every component under src", () => {
    const offenders = tsxFiles(join(process.cwd(), "src"))
      .filter((f) => !f.endsWith(join("components", "ui", "dropdown-menu.tsx")))
      .filter((f) => bareLabels(readFileSync(f, "utf8")) > 0);
    expect(offenders).toEqual([]);
  });
});

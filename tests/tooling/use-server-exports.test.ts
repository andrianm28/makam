import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const isAsyncFn = (n: ts.Node | undefined): boolean =>
  !!n &&
  (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
  !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

const hasMod = (n: ts.Node, k: ts.SyntaxKind) =>
  ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === k);

/** Runtime exports of a "use server" file that Next.js rejects (E352). */
function badExports(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const first = sf.statements[0];
  if (
    !first ||
    !ts.isExpressionStatement(first) ||
    !ts.isStringLiteral(first.expression) ||
    first.expression.text !== "use server"
  ) {
    return [];
  }
  const asyncLocals = new Set<string>();
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.name && hasMod(s, ts.SyntaxKind.AsyncKeyword)) {
      asyncLocals.add(s.name.text);
    }
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && isAsyncFn(d.initializer)) asyncLocals.add(d.name.text);
      }
    }
  }
  const bad: string[] = [];
  for (const s of sf.statements) {
    const exported = hasMod(s, ts.SyntaxKind.ExportKeyword);
    if (ts.isFunctionDeclaration(s) && exported && !hasMod(s, ts.SyntaxKind.AsyncKeyword)) {
      bad.push(`export function ${s.name?.text ?? "default"} is not async`);
    } else if (ts.isVariableStatement(s) && exported) {
      for (const d of s.declarationList.declarations) {
        if (!isAsyncFn(d.initializer)) bad.push(`export ${d.name.getText(sf)} is not an async function`);
      }
    } else if ((ts.isClassDeclaration(s) || ts.isEnumDeclaration(s)) && exported) {
      bad.push(`export ${s.name?.text ?? "default"} is not a function`);
    } else if (ts.isExportAssignment(s) && !isAsyncFn(s.expression)) {
      const e = s.expression;
      if (!(ts.isIdentifier(e) && asyncLocals.has(e.text))) bad.push("export default is not an async function");
    } else if (ts.isExportDeclaration(s) && !s.isTypeOnly) {
      if (!s.exportClause || ts.isNamespaceExport(s.exportClause) || s.moduleSpecifier) {
        bad.push(`re-export ${s.getText(sf)}`);
      } else {
        for (const el of s.exportClause.elements) {
          if (!el.isTypeOnly && !asyncLocals.has((el.propertyName ?? el.name).text)) {
            bad.push(`export { ${el.getText(sf)} } is not an async function`);
          }
        }
      }
    }
  }
  return bad;
}

describe("Server Action files", () => {
  it('a "use server" file exports only async functions (Next.js E352)', () => {
    const files = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f));
    const offenders = files.flatMap((f) => badExports(f).map((b) => `${f}: ${b}`));
    expect(offenders).toEqual([]);
  });
});

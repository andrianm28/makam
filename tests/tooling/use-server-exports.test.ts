import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const isAsyncFunction = (node: ts.Node | undefined): boolean =>
  !!node &&
  (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
  !!node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword);

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((modifier) => modifier.kind === kind);

function startsWithUseServer(source: ts.SourceFile): boolean {
  const firstStatement = source.statements[0];
  return (
    !!firstStatement &&
    ts.isExpressionStatement(firstStatement) &&
    ts.isStringLiteral(firstStatement.expression) &&
    firstStatement.expression.text === "use server"
  );
}

const readSource = (file: string) => ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);

const trackedSourceFiles = () =>
  execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
    .split("\n")
    .filter((path) => /\.(ts|tsx)$/.test(path));

/** Runtime exports of a "use server" file that Next.js rejects (E352). */
function nonFunctionExports(file: string): string[] {
  const source = readSource(file);
  if (!startsWithUseServer(source)) return [];
  const asyncFunctionNames = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && hasModifier(statement, ts.SyntaxKind.AsyncKeyword)) {
      asyncFunctionNames.add(statement.name.text);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && isAsyncFunction(declaration.initializer)) asyncFunctionNames.add(declaration.name.text);
      }
    }
  }
  const offences: string[] = [];
  for (const statement of source.statements) {
    const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
    if (ts.isFunctionDeclaration(statement) && exported && !hasModifier(statement, ts.SyntaxKind.AsyncKeyword)) {
      offences.push(`export function ${statement.name?.text ?? "default"} is not async`);
    } else if (ts.isVariableStatement(statement) && exported) {
      for (const declaration of statement.declarationList.declarations) {
        if (!isAsyncFunction(declaration.initializer)) offences.push(`export ${declaration.name.getText(source)} is not an async function`);
      }
    } else if ((ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && exported) {
      offences.push(`export ${statement.name?.text ?? "default"} is not a function`);
    } else if (ts.isExportAssignment(statement) && !isAsyncFunction(statement.expression)) {
      const expression = statement.expression;
      if (!(ts.isIdentifier(expression) && asyncFunctionNames.has(expression.text))) offences.push("export default is not an async function");
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause) || statement.moduleSpecifier) {
        offences.push(`re-export ${statement.getText(source)}`);
      } else {
        for (const specifier of statement.exportClause.elements) {
          if (!specifier.isTypeOnly && !asyncFunctionNames.has((specifier.propertyName ?? specifier.name).text)) {
            offences.push(`export { ${specifier.getText(source)} } is not an async function`);
          }
        }
      }
    }
  }
  return offences;
}

describe("Server Action files", () => {
  it("the scan covers the known Server Action files", () => {
    const serverActionFiles = trackedSourceFiles().filter((path) => startsWithUseServer(readSource(path)));
    expect(serverActionFiles.length).toBeGreaterThan(0);
    expect(serverActionFiles).toContain("src/app/(site)/pesanan/[nomor]/actions.ts");
  });

  it('a "use server" file exports only async functions (Next.js E352)', () => {
    const offenders = trackedSourceFiles().flatMap((path) =>
      nonFunctionExports(path).map((offence) => `${path}: ${offence}`),
    );
    expect(offenders).toEqual([]);
  });
});

import { join } from "node:path";
import ts from "typescript";

/** Something forbidden found in copy a user or a staff member can see. */
export type CopyMention = { line: number; text: string };

/**
 * The directories whose strings and JSX text a page can end up rendering, and so
 * the ones the copy guards read: the pages themselves, the shared components they
 * compose, `src/lib` — where the public site's written copy lives, in modules a
 * page imports (`content-pages.ts`, `homepage-content.ts`) — and `src/domain`,
 * where every family-facing email body lives (`notifications/template.ts`,
 * `identity/email-templates.ts`) and every refusal message a Server Action shows.
 * A guard that stopped at `src/app` would pass without ever reading the words a
 * family reads.
 *
 * Most of `src/domain` is code rather than prose, which the AST scan survives:
 * comments and regex literals are never mistaken for copy, and the rest is
 * compared against the guards' own patterns rather than a list of strings.
 */
export function copyScanDirs(srcDir: string): string[] {
  return ["app", "components", "lib", "domain"].map((dir) => join(srcDir, dir));
}

const TICKET_NUMBER = /\btiket\s+\d+/i;

/**
 * Finds anything matching `pattern` in the text a page or action can show: string
 * and template literals and JSX text. Parsed with the TypeScript compiler, so
 * comments and regex literals are never mistaken for copy, and JSX text split
 * over lines is read as one run.
 */
export function copyMentions(source: string, fileName: string, pattern: RegExp): CopyMention[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: CopyMention[] = [];
  const visit = (node: ts.Node) => {
    const text = copyOf(node);
    if (text !== null && pattern.test(text.replace(/\s+/g, " "))) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
      found.push({ line: line + 1, text: text.replace(/\s+/g, " ").trim() });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The internal build tickets ("tiket 17") that must never reach a screen. */
export function ticketMentions(source: string, fileName: string): CopyMention[] {
  return copyMentions(source, fileName, TICKET_NUMBER);
}

function copyOf(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return node.text;
  if (ts.isJsxText(node)) return node.text;
  return null;
}

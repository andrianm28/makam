import ts from "typescript";

/** Something forbidden found in copy a user or a staff member can see. */
export type CopyMention = { line: number; text: string };

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

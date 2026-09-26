/**
 * Expand/contract for migrations (ADR 0002, ticket 71): the previous release
 * keeps running on the new schema until it is replaced, so a new migration may
 * only add. A statement that removes or reshapes what the running release uses
 * is a "contract" step and must say so with a comment directly above it (or
 * inside it):
 *
 *   -- contract: <why the running release no longer needs this>
 *   ALTER TABLE "x" DROP COLUMN "y";
 */

export interface DestructiveStatement {
  /** 1-based line of the statement's first line in the file. */
  line: number;
  /** The statement's first line, trimmed. */
  statement: string;
  reason: string;
}

interface Statement {
  /** Everything from the end of the previous statement: leading comments included. */
  text: string;
  /** The same text with comments, string literals and dollar-quoted bodies blanked out. */
  code: string;
  /** Offset of `text` in the file. */
  start: number;
}

/** The destructive statements in a migration file that carry no `-- contract: <reason>` marker. */
export function unmarkedDestructiveStatements(migration: string): DestructiveStatement[] {
  const found: DestructiveStatement[] = [];
  for (const statement of splitStatements(migration)) {
    const reason = destructiveReason(statement.code);
    if (!reason || hasContractMarker(statement.text)) continue;
    const firstCode = statement.code.search(/\S/);
    const lineStart = migration.lastIndexOf("\n", statement.start + firstCode - 1) + 1;
    const lineEnd = migration.indexOf("\n", lineStart);
    found.push({
      line: migration.slice(0, lineStart).split("\n").length,
      statement: migration.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim(),
      reason,
    });
  }
  return found;
}

const IDENT = String.raw`(?:"\s*"|\w+)`; // identifiers are blanked to "  "

/** Why a statement (comments, strings and quoted identifiers blanked) is destructive, if it is. */
function destructiveReason(code: string): string | undefined {
  // DROP NOT NULL only relaxes a column: that is expand.
  if (/\bDROP\b(?!\s+NOT\s+NULL\b)/i.test(code)) return "DROP";
  if (/\bRENAME\b/i.test(code)) return "RENAME";
  if (/\bSET\s+NOT\s+NULL\b/i.test(code)) return "SET NOT NULL";
  if (new RegExp(String.raw`\bALTER\s+COLUMN\s+${IDENT}\s+(SET\s+DATA\s+)?TYPE\b`, "i").test(code)) return "type change";
  for (const added of code.matchAll(/\bADD\s+COLUMN\b([^,;]*)/gi)) {
    if (/\bNOT\s+NULL\b/i.test(added[1]) && !/\bDEFAULT\b/i.test(added[1])) return "NOT NULL column without a default";
  }
  return undefined;
}

function hasContractMarker(text: string): boolean {
  return /--[ \t]*contract:[ \t]*\S/i.test(text);
}

/**
 * Splits SQL on `;` outside comments, quoted strings and dollar-quoted bodies,
 * keeping each statement's leading comments with it.
 */
function splitStatements(sql: string): Statement[] {
  const statements: Statement[] = [];
  let start = 0;
  let code = "";
  let i = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      code += blank(sql.slice(i, stop));
      i = stop;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      code += blank(sql.slice(i, stop));
      i = stop;
      continue;
    }
    if (sql[i] === "'") {
      let stop = i + 1;
      while (stop < sql.length && !(sql[stop] === "'" && sql[stop + 1] !== "'")) stop += sql[stop] === "'" ? 2 : 1;
      stop = Math.min(stop + 1, sql.length);
      code += blank(sql.slice(i, stop));
      i = stop;
      continue;
    }
    if (sql[i] === '"') {
      const end = sql.indexOf('"', i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      code += `"${blank(sql.slice(i + 1, stop - 1))}"`;
      i = stop;
      continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar) {
      const end = sql.indexOf(dollar[0], i + dollar[0].length);
      const stop = end === -1 ? sql.length : end + dollar[0].length;
      code += blank(sql.slice(i, stop));
      i = stop;
      continue;
    }
    code += sql[i];
    i += 1;
    if (sql[i - 1] === ";") {
      statements.push({ text: sql.slice(start, i), code, start });
      start = i;
      code = "";
    }
  }
  if (code.trim() !== "") statements.push({ text: sql.slice(start), code, start });
  return statements;
}

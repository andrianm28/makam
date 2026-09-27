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
  const statements = splitStatements(migration);
  const created = createdTables(statements.map((statement) => statement.text));
  for (const statement of statements) {
    const reason = destructiveReason(statement.code, statement.text, created);
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

/** `public."tagihan"` and `"tagihan"` both mean the table `tagihan`. */
function tableKey(name: string): string {
  return name
    .split(".")
    .pop()!
    .replace(/^"(.*)"$/, "$1")
    .toLowerCase();
}

const TABLE_NAME = String.raw`((?:"[^"]+"|\w+)(?:\s*\.\s*(?:"[^"]+"|\w+))?)`;

/**
 * Tables a migration file creates (`CREATE TABLE`), from the raw texts (quoted
 * identifiers intact). A new constraint on one of them is expand: nothing runs
 * against that table yet.
 */
function createdTables(texts: string[]): Set<string> {
  const created = new Set<string>();
  const pattern = new RegExp(String.raw`^\s*CREATE\s+(?:TEMP(?:ORARY)?\s+|UNLOGGED\s+|GLOBAL\s+|LOCAL\s+)*TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${TABLE_NAME}`, "im");
  for (const text of texts) {
    for (const line of text.split("\n")) {
      if (/^\s*--/.test(line)) continue;
      const match = pattern.exec(line);
      if (match) created.add(tableKey(match[1]));
    }
  }
  return created;
}

/** The existing table a new constraint lands on: `ALTER TABLE x ...` or `CREATE [UNIQUE] INDEX ... ON x`. */
function constraintTable(text: string): string {
  const pattern = new RegExp(
    String.raw`(?:ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+|ONLY\s+)?${TABLE_NAME}|CREATE\s+(?:UNIQUE\s+)?INDEX\b.*?\bON\s+(?:ONLY\s+)?${TABLE_NAME})`,
    "i",
  );
  const match = pattern.exec(text);
  return match ? tableKey(match[1] ?? match[2]) : "";
}
/** Why a statement (comments, strings and quoted identifiers blanked) is destructive, if it is. */
function destructiveReason(code: string, text: string, created: Set<string>): string | undefined {
  // DROP NOT NULL only relaxes a column: that is expand.
  if (/\bDROP\b(?!\s+NOT\s+NULL\b)/i.test(code)) return "DROP";
  if (/\bRENAME\b/i.test(code)) return "RENAME";
  if (/\bTRUNCATE\b/i.test(code)) return "TRUNCATE";
  if (/\bSET\s+NOT\s+NULL\b/i.test(code)) return "SET NOT NULL";
  if (new RegExp(String.raw`\bALTER\s+COLUMN\s+${IDENT}\s+(SET\s+DATA\s+)?TYPE\b`, "i").test(code)) return "type change";
  // A new constraint on an existing table breaks the running release's writes
  // (its rows may violate it): that is a contract step. A constraint on a
  // table this same migration creates is expand (nothing runs against it yet).
  const addedConstraint =
    /^\s*CREATE\s+UNIQUE\s+INDEX\b/i.test(code) ||
    /\bADD\s+(?:CONSTRAINT\b.*?)?(UNIQUE|PRIMARY\s+KEY|FOREIGN\s+KEY|REFERENCES|CHECK)\b/i.test(code);
  if (addedConstraint && !created.has(constraintTable(text))) {
    const kind = (code.match(/\bADD\s+(?:CONSTRAINT\b.*?)?(UNIQUE|PRIMARY\s+KEY|FOREIGN\s+KEY|REFERENCES|CHECK)\b/i)?.[1] ?? "UNIQUE")
      .toUpperCase()
      .replace(/\s+/g, " ");
    if (kind === "FOREIGN KEY" || kind === "REFERENCES") return "new FOREIGN KEY constraint";
    if (kind === "CHECK") return "new CHECK constraint";
    return "new UNIQUE constraint";
  }
  for (const added of code.matchAll(/\bADD\s+COLUMN\b([^,;]*)/gi)) {
    if (/\bNOT\s+NULL\b/i.test(added[1]) && !/\bDEFAULT\b/i.test(added[1])) return "NOT NULL column without a default";
  }
  return undefined;
}

/** A drizzle statement separator: neither code nor a comment, just a boundary. */
function isBreakpoint(line: string): boolean {
  return /^\s*-->\s*statement-breakpoint\s*$/.test(line);
}

function isComment(line: string): boolean {
  return /^\s*--/.test(line);
}

/**
 * Whether the statement carries a `-- contract: <reason>` marker on the
 * line(s) directly above it: the contiguous `--` comment lines just before the
 * statement's first code line. A marker above a blank line, a
 * `--> statement-breakpoint` line or another statement does not count.
 */
function hasContractMarker(text: string): boolean {
  const lines = text.split("\n");
  const firstCode = lines.findIndex((line) => line.trim() !== "" && !isComment(line) && !isBreakpoint(line));
  const header = firstCode === -1 ? lines : lines.slice(0, firstCode);
  const directlyAbove: string[] = [];
  for (let i = header.length - 1; i >= 0; i -= 1) {
    if (!isComment(header[i])) break;
    directlyAbove.unshift(header[i]);
  }
  return directlyAbove.some((line) => /--[ \t]*contract:[ \t]*\S/i.test(line));
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

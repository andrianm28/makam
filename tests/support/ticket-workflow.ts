/**
 * The ticket workflow discipline, as rules over text: a ticket file's `Status:`
 * line, the `## Comments` sections a review record may live in, the ticket rows
 * of `00-index.md` and the summary sentence that restates the counts above them.
 *
 * Every function is pure and takes strings, so the fixtures that prove a rule
 * bites are strings in memory and nothing in `.scratch/` is ever written. The
 * rules themselves, and the reason each one exists, are in the guard's test
 * (tests/tooling/ticket-workflow.test.ts).
 */
export type Ticket = {
  /** The ticket number, from the `nn-` prefix of its file name. */
  number: number;
  /** The file name inside the issues directory, e.g. `07-production-environment.md`. */
  name: string;
  /** The first `Status:` line, or null when the file declares none. */
  status: string | null;
  /** The body of every `## Comments` section, in the order they appear. */
  comments: string[];
};

/** A ticket row of `00-index.md`: `| [07](07-production-environment.md) | Title | resolved | — |`. */
export type IndexRow = { file: string; status: string };

/**
 * The first `Status:` line, on a line of its own. Only the first counts, so a
 * ticket that quotes an older status further down is read as it is now.
 */
export function ticketStatus(text: string): string | null {
  return text.match(/^Status:[ \t]*(.+?)[ \t]*$/m)?.[1] ?? null;
}

/**
 * The body of every `## Comments` section, and nothing else.
 *
 * A ticket may carry several (one is appended as each decision is made), so all
 * of them are read. A section runs to the next `## ` heading, which keeps a
 * `### ` subheading inside it and stops at whatever follows — the point being
 * that the review marker is only ever read from here, never from the acceptance
 * criteria or the notes, where the word "review" turns up as well.
 */
export function ticketComments(text: string): string[] {
  const lines = text.split("\n");
  const starts: number[] = [];
  lines.forEach((line, index) => {
    const heading = /^##[ \t]+(.*?)[ \t]*$/.exec(line);
    if (heading !== null && heading[1].toLowerCase() === "comments") starts.push(index);
  });
  return starts.map((start, index) => {
    const limit = index + 1 < starts.length ? starts[index + 1] : lines.length;
    let end = limit;
    for (let line = start + 1; line < limit; line += 1) {
      if (/^##[ \t]/.test(lines[line])) {
        end = line;
        break;
      }
    }
    return lines.slice(start + 1, end).join("\n");
  });
}

/**
 * What a ticket file's name has to be: two digits (01..99), a dash, a slug with
 * no spaces in it, and a lowercase `.md`. Exported because the reader that builds
 * the ticket list and the rule below decide the same question, and two copies of
 * one pattern is how they came to disagree — the reader used a looser one, so it
 * read files this rule then called invalid, and a message that said nothing
 * read them was wrong. One pattern, both sides.
 */
export const TICKET_FILE_NAME = /^\d\d-[^\s]+\.md$/;

/** The ticket number a ticket file's name carries: every digit before the first dash. */
export function ticketNumber(name: string): number {
  return Number(name.slice(0, name.indexOf("-")));
}

/**
 * The `.md` files of the issues directory that are not ticket files. A `100-*.md`
 * and a `07-*.MD` are the same class of problem: the readers match file names
 * exactly, so a file outside the convention is at best half-read — its index row
 * read, no file to compare it against — and at worst not read at all, which is
 * what a capital `.MD` gets today. A blind spot no test would ever report is
 * reported here instead, with the name to fix.
 *
 * The rule refuses the file rather than widening the readers to three digits.
 * Widening would make `100-*.md` readable by the Status and marker rules while
 * the rest of the guard still writes and expects two digits: the parenthetical
 * number lists in the index's summary sentence, the `01`-style ticket numbers in
 * every message, the `[nn](nn-….md)` links. One reader at three digits and the
 * rest at two is a second, quieter class of the same bug. When the plan really
 * does reach 100, the fix is one pattern here and one there, in a commit that
 * says so.
 */
export function ticketFileProblems(names: string[], index = "00-index.md"): string[] {
  return names
    .filter((name) => /[.]md$/i.test(name) && name !== index)
    .filter((name) => !TICKET_FILE_NAME.test(name))
    .map(
      (name) =>
        `${name}: not a ticket file name — one is <nn>-<slug>.md, two digits (01..99) then a dash then a slug with no spaces and a lowercase .md. The readers match that name exactly, so this one is at best half-read and at worst not read at all: rename it to fit, or move it out of the issues directory`,
    )
    .sort();
}

/**
 * Every ticket row of the index, wherever its table sits: the first block, the
 * split of a ticket, the block each later decision appended. A row whose link is
 * not a ticket file (`[Story](…)`, a number in a code span) is not a row, so a
 * table of something else cannot be read as one.
 */
export function indexRows(index: string): Map<number, IndexRow> {
  const rows = new Map<number, IndexRow>();
  for (const line of index.split("\n")) {
    const match = /^\|[ \t]*\[(\d{1,2})\]\(([^)]+\.md)\)[ \t]*\|/.exec(line);
    if (match === null) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    rows.set(Number(match[1]), { file: match[2], status: cells[3] ?? "" });
  }
  return rows;
}

/**
 * A ticket file's `Status:` and the index's copy of the same ticket have to be
 * the same value: the merge step flips both in one commit, so there is no reason
 * for them to differ, and a difference means one of the two was missed. A ticket
 * with no row, a row with no file and a row pointing at a file that was renamed
 * are the same kind of problem, so they are refused too.
 *
 * Every problem names the ticket and both values, and says which file is wrong,
 * so the fix does not have to be looked up.
 */
export function statusSyncProblems(tickets: Ticket[], index: string): string[] {
  const rows = indexRows(index);
  const problems: string[] = [];
  for (const ticket of tickets) {
    if (ticket.status === null) {
      problems.push(`ticket ${number(ticket.number)}: ${ticket.name} has no Status: line, so its state cannot be checked`);
      continue;
    }
    const row = rows.get(ticket.number);
    if (row === undefined) {
      problems.push(`ticket ${number(ticket.number)}: ${ticket.name} is not listed in 00-index.md`);
      continue;
    }
    if (row.file !== ticket.name) {
      problems.push(
        `00-index.md links ticket ${number(ticket.number)} to ${row.file}, but the file is ${ticket.name} (rename the file, or fix the link)`,
      );
    }
    if (row.status !== ticket.status) {
      problems.push(
        `ticket ${number(ticket.number)}: ${ticket.name} says Status: ${ticket.status}, 00-index.md says ${row.status} — flip both in one commit`,
      );
    }
  }
  for (const [ticket, row] of [...rows].sort((a, b) => a[0] - b[0])) {
    if (tickets.some((one) => one.number === ticket)) continue;
    problems.push(`00-index.md lists ticket ${number(ticket)} (${row.file}) but there is no such file`);
  }
  return problems;
}

/** A ticket number as the index writes it: `07`, never `7`. */
function number(ticket: number): string {
  return String(ticket).padStart(2, "0");
}

/** One `<count> <status> (<numbers>)` item of the summary sentence. */
type SummaryItem = { count: number; status: string; numbers: number[] | null };

const SUMMARY = /(\d+) tickets \(as of (\d{4}-\d{2}-\d{2})\):/;
const SUMMARY_ITEM = /(\d+) ([a-z][a-z-]*)(?:[ \t]*\(([^)]*)\))?/y;
/**
 * The shape the rule reads, and nothing else: no counts, no statuses spelled
 * out, no date. The first version of this string quoted a real sentence from the
 * index, counts and all, and that is how a stale number reaches a reader who is
 * chasing a red build: they take the message for what the index should say and
 * write those numbers, which were already wrong the day the message was written.
 * The problems that do name counts below quote both sides of the comparison, so
 * they cannot mislead; this one only has to say what shape the sentence has to be
 * in to be read at all.
 */
const EXPECTED =
  'expected the summary sentence to read "<count> tickets (as of YYYY-MM-DD): <count> resolved, <count> ready-for-agent, …"';

/**
 * The index states its own counts in a sentence above the table, written by
 * hand, so it goes stale the moment a Status is flipped and the sentence is not
 * re-read — a table in step with every ticket file and a sentence that is not.
 * This reads the sentence and compares it with the ticket files: the total, the
 * count of every status, and the numbers in parentheses where the sentence lists
 * them.
 *
 * The format is strict, and a sentence in any other format is refused rather
 * than skipped, because a rule that cannot read what is there would sit green on
 * the exact failure it exists to catch.
 */
export function summaryProblems(index: string, tickets: Ticket[]): string[] {
  const sentence = SUMMARY.exec(index);
  if (sentence === null) {
    return [`00-index.md: no summary sentence to check; the first line of prose is at ${where(index, firstProse(index))} (${EXPECTED})`];
  }
  // The item list starts where the header ends, so that is the quote a reader
  // needs: a format problem is always in the list, never in the header.
  const listStart = sentence.index + sentence[0].length;
  const parsed = parseItems(index.slice(listStart));
  if (parsed.at !== null) {
    return [`00-index.md: the summary sentence is not in the format this rule reads; it stops parsing at ${where(index, listStart + parsed.at)} (${EXPECTED})`];
  }
  const items = parsed.items;

  const counts = new Map<string, number>();
  const numbers = new Map<string, number[]>();
  const problems: string[] = [];
  for (const ticket of tickets) {
    if (ticket.status === null) {
      problems.push(`ticket ${number(ticket.number)}: ${ticket.name} has no Status: line, so it cannot be counted`);
      continue;
    }
    counts.set(ticket.status, (counts.get(ticket.status) ?? 0) + 1);
    numbers.set(ticket.status, [...(numbers.get(ticket.status) ?? []), ticket.number]);
  }
  if (Number(sentence[1]) !== tickets.length) {
    problems.push(`00-index.md: the summary sentence says ${sentence[1]} tickets, the tree has ${tickets.length}`);
  }
  const stated = new Map(items.map((item) => [item.status, item]));
  for (const status of [...new Set([...counts.keys(), ...stated.keys()])].sort()) {
    const actual = counts.get(status) ?? 0;
    const item = stated.get(status);
    if (item === undefined) {
      problems.push(`00-index.md: the summary sentence has no count for status ${status} (the tree has ${actual})`);
      continue;
    }
    if (item.count !== actual) {
      problems.push(`00-index.md: the summary sentence says ${item.count} ${status}, the ticket files have ${actual}`);
    }
    if (item.numbers === null) continue;
    const listed = list(item.numbers);
    const actualListed = list([...(numbers.get(status) ?? [])].sort((a, b) => a - b));
    if (listed !== actualListed) {
      problems.push(`00-index.md: the summary sentence lists ${status} tickets (${listed}), the tree has (${actualListed})`);
    }
  }
  return problems;
}

/** `02, 03, 04` — how a status's tickets are written inside parentheses. */
function list(tickets: number[]): string {
  return tickets.map(number).join(", ");
}

/**
 * The sentence's item list, and where parsing gave up on it (`at` is the offset
 * into `rest`, so the caller can point at the exact spot in the index). The
 * offset is the point of this: a format problem the message only describes in
 * the abstract is a problem the reader has to find by eye.
 */
function parseItems(rest: string): { items: SummaryItem[]; at: number | null } {
  const start = rest.length - rest.trimStart().length;
  let skipped = 0;
  let text = rest.trim();
  const items: SummaryItem[] = [];
  for (;;) {
    SUMMARY_ITEM.lastIndex = 0;
    const match = SUMMARY_ITEM.exec(text);
    if (match === null) return { items, at: start + skipped };
    const numbers = match[3] === undefined ? null : match[3].split(",").map((part) => Number(part.trim()));
    if (numbers !== null && numbers.some((value) => !Number.isInteger(value))) return { items, at: start + skipped };
    items.push({ count: Number(match[1]), status: match[2], numbers });
    const after = text.slice(SUMMARY_ITEM.lastIndex);
    if (after === "" || after.startsWith(".")) return { items, at: null };
    if (!after.startsWith(", ")) return { items, at: start + skipped + SUMMARY_ITEM.lastIndex };
    skipped += SUMMARY_ITEM.lastIndex + 2;
    text = after.slice(2).trim();
  }
}

/**
 * `line 3: "…"` — which line a message is about, and a short quote from where
 * the reading stopped. The quote starts at the offset rather than at the
 * beginning of the line, because the index's paragraph is one long line and the
 * part worth quoting is the tail of it.
 */
function where(index: string, offset: number): string {
  const at = Math.max(0, offset);
  const line = index.slice(0, at).split("\n").length;
  const text = index.slice(at).split("\n")[0].trim();
  return `line ${line}: "${text.length <= 72 ? text : `${text.slice(0, 71)}…`}"`;
}

/** The offset of the first line of prose, which is where the sentence has to be. */
function firstProse(index: string): number {
  const lines = index.split("\n");
  const at = lines.findIndex((line) => line.trim() !== "" && !line.startsWith("#"));
  return at < 0 ? 0 : lines.slice(0, at).join("\n").length + (at === 0 ? 0 : 1);
}

/**
 * The ticket numbers that resolved at or above `ratchetFrom` and carry no
 * `marker` in their `## Comments`. The caller compares them with the list of
 * gaps that predate the guard: an offender that is not on that list is a merge
 * without a review record, a name on it that is no longer an offender is a gap
 * that is gone and has to leave the list.
 */
export function reviewMarkerProblems(tickets: Ticket[], ratchetFrom: number, marker: string): number[] {
  return tickets
    .filter((ticket) => ticket.status === "resolved" && ticket.number >= ratchetFrom)
    .filter((ticket) => !ticket.comments.some((section) => section.includes(marker)))
    .map((ticket) => ticket.number)
    .sort((a, b) => a - b);
}

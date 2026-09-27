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
const EXPECTED = 'expected the summary sentence to read "87 tickets (as of 2026-09-27): 36 resolved, 43 ready-for-agent"';

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
  if (sentence === null) return [`00-index.md: no summary sentence to check (${EXPECTED})`];
  const items = parseItems(index.slice(sentence.index + sentence[0].length));
  if (items === null) return [`00-index.md: the summary sentence is not in the format this rule reads (${EXPECTED})`];

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

/** The sentence's item list, or null when it is not in the format this reads. */
function parseItems(rest: string): SummaryItem[] | null {
  let text = rest.trim();
  const items: SummaryItem[] = [];
  for (;;) {
    SUMMARY_ITEM.lastIndex = 0;
    const match = SUMMARY_ITEM.exec(text);
    if (match === null) return null;
    const numbers = match[3] === undefined ? null : match[3].split(",").map((part) => Number(part.trim()));
    if (numbers !== null && numbers.some((number) => !Number.isInteger(number))) return null;
    items.push({ count: Number(match[1]), status: match[2], numbers });
    const after = text.slice(SUMMARY_ITEM.lastIndex);
    if (after === "" || after.startsWith(".")) return items;
    if (!after.startsWith(", ")) return null;
    text = after.slice(2).trim();
  }
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

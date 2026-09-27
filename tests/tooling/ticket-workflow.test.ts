import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  indexRows,
  reviewMarkerProblems,
  statusSyncProblems,
  summaryProblems,
  ticketComments,
  ticketStatus,
  type Ticket,
} from "../support/ticket-workflow";

/**
 * The ticket workflow discipline, which until now lived only in prose: every
 * branch goes through the two-axis `code-review` before it merges, and the
 * Status a merge flips is flipped in the ticket file *and* in `00-index.md` in
 * the same commit (AGENTS.md, "Merging"). Prose that nothing checks gets skipped
 * quietly, so these are checks in the shape of the repo's other build-failing
 * guards: tests/tooling/image-retention.test.ts and tests/trivyignore.test.ts.
 *
 * Nothing here writes a file. Every rule is a pure function over text, so the
 * fixtures that prove a rule bites are strings in memory, and the ticket files
 * are only ever read.
 */
const ISSUES = new URL("../../.scratch/makam-v1-build/issues/", import.meta.url);
const INDEX = "00-index.md";

/**
 * The literal string every merge has to write into the ticket's `## Comments`.
 *
 * Not "two-axis review", not "Standards review", not "review fixes": wording
 * that varies per ticket cannot be audited, so a record in another wording
 * counts as no record. The word "review" on its own is all over the tickets
 * (titles, acceptance criteria, prose), which is why the marker is matched
 * exactly, and only inside `## Comments`.
 */
const MARKER = "Two-axis review";

/**
 * Tickets from this number up are inside the two-axis discipline, so every one
 * of them that resolves has to carry the marker. It is a ratchet: it bites
 * forward only, and it is here to stop the *next* merge from merging without a
 * review record, not to grade history.
 *
 * 43 is the boundary, and the tickets below it are the ones that merged before
 * the discipline had a marker at all (18 of them resolved: 7 already carry the
 * marker, 11 do not). Those gaps are historical and are not reconstructed here.
 *
 * Above 43 the discipline *was* in force when those tickets merged, so they are
 * what a plain `>= 43` rule would fail on today. GRACE below names them: 17
 * tickets at or above the boundary that resolved before this guard existed, so
 * no marker was ever written for them. Their record is left exactly as the
 * merges left it — several carry review evidence in another wording, some carry
 * nothing at all, and none of that is invented here. A test holds the list to
 * equality, so it can only shrink (a ticket that gains the marker leaves it),
 * and a new offender fails the build instead of joining it.
 *
 * Do not lower RATCHET_FROM: the tickets below 43 merged before the marker
 * existed, so a lower boundary fails the build on history rather than on a live
 * violation.
 */
const RATCHET_FROM = 43;

/** The resolved tickets at or above RATCHET_FROM that predate this guard. */
const GRACE = [60, 61, 63, 66, 67, 68, 70, 71, 73, 75, 76, 77, 78, 80, 82, 83, 85];

/** Every ticket file in the tree, in number order (the order on disk is read into nothing). */
function readTickets(): Ticket[] {
  return readdirSync(ISSUES)
    .filter((name) => /^\d\d-.*\.md$/.test(name) && name !== INDEX)
    .map((name) => {
      const text = readFileSync(new URL(name, ISSUES), "utf8");
      return { number: Number(name.slice(0, 2)), name, status: ticketStatus(text), comments: ticketComments(text) };
    })
    .sort((a, b) => a.number - b.number);
}

const indexText = readFileSync(new URL(INDEX, ISSUES), "utf8");
const tickets = readTickets();
const offenders = reviewMarkerProblems(tickets, RATCHET_FROM, MARKER);

describe("the ticket workflow discipline", () => {
  it("reads every ticket in the tree before it checks anything", () => {
    // A guard that read nothing would pass on every violation it exists to
    // catch, so the files it is about are checked rather than assumed: as many
    // as the index has rows, one Status each, one file per number, and every
    // file's name carrying the number it was read under.
    const rows = indexRows(indexText);
    expect(tickets.length, "no ticket files were read").toBeGreaterThan(0);
    expect(tickets.length, "a ticket file the index lists was not read").toBe(rows.size);
    expect(tickets.map((ticket) => ticket.number)).toEqual([...new Set(tickets.map((ticket) => ticket.number))].sort((a, b) => a - b));
    for (const ticket of tickets) {
      expect(ticket.status, `${ticket.name} declares no Status:`).not.toBeNull();
      expect(ticket.name.startsWith(`${String(ticket.number).padStart(2, "0")}-`), `${ticket.name} is read under the wrong number`).toBe(true);
    }
  });

  it("keeps every ticket file's Status the same as 00-index.md's", () => {
    // The merge step flips both in one commit, so the two copies cannot differ,
    // and a difference means one of them was missed. Each problem names the
    // ticket, both values and the file that is wrong.
    expect(statusSyncProblems(tickets, indexText)).toEqual([]);
  });

  it("keeps the counts 00-index.md's own summary sentence states", () => {
    // The sentence is a hand-written restatement of the table below it, so it
    // goes stale the moment a Status is flipped and the sentence is not re-read.
    // No counts are written here on purpose: the sentence is the tree's, and a
    // number copied into a test goes stale the same way the sentence does.
    expect(summaryProblems(indexText, tickets)).toEqual([]);
  });

  it("requires every resolved ticket at or above the ratchet to carry the marker", () => {
    // Equality in both directions: an offender that is not in GRACE is a merge
    // without a review record, and a name left in GRACE is a gap that no longer
    // exists and has to come off the list.
    expect(offenders, "a resolved ticket at or above the ratchet has no review marker; write it, or name it in GRACE if it predates the guard").toEqual(GRACE);
  });

  it("keeps GRACE sorted, unique, inside the ratchet and made of real resolved tickets", () => {
    expect([...GRACE].sort((a, b) => a - b)).toEqual(GRACE);
    expect(new Set(GRACE).size).toBe(GRACE.length);
    for (const number of GRACE) {
      expect(number, `${number} is below RATCHET_FROM, so the rule spares it already and naming it hides a change`).toBeGreaterThanOrEqual(RATCHET_FROM);
      const ticket = tickets.find((one) => one.number === number);
      expect(ticket, `${number} is in GRACE but there is no such ticket`).toBeDefined();
      expect(ticket?.status, `${number} is in GRACE but it is not resolved`).toBe("resolved");
    }
  });
});

/**
 * The three checks above are green, and a green check is worth nothing unless it
 * can be red. So each one is run again here against the *real* tree with a
 * single violation introduced in memory — the tree's own tickets, the tree's own
 * index text, one thing changed — and has to come back with that violation in
 * the message. Nothing is written: the changes are copies in memory.
 */
describe("each check on the real tree, with one violation added in memory", () => {
  /** A real ticket, chosen by what it is rather than by its number, so the fixture cannot rot. */
  const realTicket = (predicate: (ticket: Ticket) => boolean, what: string): Ticket => {
    const found = tickets.find(predicate);
    expect(found, `no real ticket ${what} to build the fixture from`).toBeDefined();
    return found as Ticket;
  };

  it("Status sync: a real ticket whose Status is changed away from the index's copy", () => {
    const ticket = realTicket((one) => one.status === "resolved" && one.number >= RATCHET_FROM, "has resolved");
    const flipped = tickets.map((one) => (one.number === ticket.number ? { ...one, status: "in-progress" } : one));
    const problems = statusSyncProblems(flipped, indexText);
    expect(problems).toEqual([
      `ticket ${String(ticket.number).padStart(2, "0")}: ${ticket.name} says Status: in-progress, 00-index.md says resolved — flip both in one commit`,
    ]);
  });

  it("summary counts: the tree's own sentence with one count moved by one", () => {
    // The count is read out of the tree's sentence and bumped, so the numbers in
    // the message are the tree's own and cannot be wrong here.
    const stated = Number(/(\d+) resolved/.exec(indexText)?.[1]);
    expect(stated, "the index sentence has no resolved count to bump").toBeGreaterThan(0);
    const actual = tickets.filter((one) => one.status === "resolved").length;
    const bumped = indexText.replace(/(\d+) resolved/, (_all, count) => `${Number(count) + 1} resolved`);
    expect(summaryProblems(bumped, tickets)).toEqual([
      `00-index.md: the summary sentence says ${stated + 1} resolved, the ticket files have ${actual}`,
    ]);
  });

  it("ratchet: a real merged ticket with its ## Comments entry removed in memory", () => {
    // The strongest form of it: take a ticket that carries the marker today, take
    // the marker out of its Comments, and the same file has to come back an
    // offender. A ticket that never merged with the marker, like the ones in
    // GRACE, would not show that the rule reads the section at all.
    const recorded = realTicket(
      (one) => one.number >= RATCHET_FROM && one.status === "resolved" && one.comments.some((section) => section.includes(MARKER)),
      "carries the review marker",
    );
    const stripped = tickets.map((one) =>
      one.number === recorded.number ? { ...one, comments: one.comments.map((section) => section.split(MARKER).join("a review record")) } : one,
    );
    expect(reviewMarkerProblems(stripped, RATCHET_FROM, MARKER)).toContain(recorded.number);
  });

  it("ratchet: a real file in GRACE is read, and spared only by the name", () => {
    // GRACE is a list of numbers, so the rule could be reaching nothing at all in
    // those files and the list would look like it works. It does not: the rule
    // finds every one of them an offender, and only the list stands between that
    // and a red build.
    const grandfathared = GRACE.map((number) =>
      realTicket((one) => one.number === number, `numbered ${number} (in GRACE)`),
    );
    expect(grandfathared.every((one) => one.status === "resolved")).toBe(true);
    expect(reviewMarkerProblems(tickets, RATCHET_FROM, MARKER)).toEqual(expect.arrayContaining(GRACE));
  });
});

describe("the Status-sync rule", () => {
  const index = ["# index", "", "| # | Title | Status | Blocked by |", "|---|---|---|---|", "| [07](07-production.md) | Seven | resolved | — |", ""].join("\n");
  const seven: Ticket = { number: 7, name: "07-production.md", status: "resolved", comments: [] };

  it("accepts a ticket whose Status matches the index", () => {
    expect(statusSyncProblems([seven], index)).toEqual([]);
  });

  it("names the ticket, both values and the file that is wrong when they differ", () => {
    expect(statusSyncProblems([{ ...seven, status: "in-progress" }], index)).toEqual([
      "ticket 07: 07-production.md says Status: in-progress, 00-index.md says resolved — flip both in one commit",
    ]);
  });

  it("refuses a ticket file the index does not list", () => {
    const problems = statusSyncProblems([seven, { number: 8, name: "08-otp.md", status: "resolved", comments: [] }], index);
    expect(problems).toEqual(["ticket 08: 08-otp.md is not listed in 00-index.md"]);
  });

  it("refuses an index row whose ticket file is gone", () => {
    expect(statusSyncProblems([], index)).toEqual(["00-index.md lists ticket 07 (07-production.md) but there is no such file"]);
  });

  it("refuses an index row whose link points at a file that was renamed", () => {
    const renamed = index.replace("(07-production.md)", "(07-production-environment.md)");
    expect(statusSyncProblems([seven], renamed)).toEqual([
      "00-index.md links ticket 07 to 07-production-environment.md, but the file is 07-production.md (rename the file, or fix the link)",
    ]);
  });

  it("refuses a ticket file with no Status line at all", () => {
    expect(statusSyncProblems([{ ...seven, status: null }], index)).toEqual([
      "ticket 07: 07-production.md has no Status: line, so its state cannot be checked",
    ]);
  });

  it("reports a file that was renamed and a status that differs, one line each", () => {
    const problems = statusSyncProblems([{ ...seven, status: "wontfix" }], index.replace("(07-production.md)", "(07-other.md)"));
    expect(problems).toHaveLength(2);
  });
});

describe("the index summary-sentence rule", () => {
  const one = (status: string, ticket = 7): Ticket => ({ number: ticket, name: `0${ticket}.md`, status, comments: [] });
  const sentence = (total: number, body: string) => `# index\n\n${total} tickets (as of 2026-09-27): ${body}. The rest of the prose.\n`;

  it("accepts a sentence whose counts and numbers match the ticket files", () => {
    expect(summaryProblems(sentence(2, "1 resolved, 1 ready-for-agent"), [one("resolved"), one("ready-for-agent")])).toEqual([]);
  });

  it("catches a count the ticket files no longer agree with", () => {
    // Two counts of the same sentence move together, so one stale count is
    // reported as a pair (the statuses in alphabetical order).
    const problems = summaryProblems(sentence(3, "2 resolved, 1 ready-for-agent"), [
      one("resolved"),
      one("ready-for-agent", 8),
      one("ready-for-agent", 9),
    ]);
    expect(problems).toEqual([
      "00-index.md: the summary sentence says 1 ready-for-agent, the ticket files have 2",
      "00-index.md: the summary sentence says 2 resolved, the ticket files have 1",
    ]);
  });

  it("catches a total the ticket files no longer agree with", () => {
    expect(summaryProblems(sentence(2, "1 resolved"), [one("resolved")])).toEqual([
      "00-index.md: the summary sentence says 2 tickets, the tree has 1",
    ]);
  });

  it("catches a status the sentence does not mention at all", () => {
    expect(summaryProblems(sentence(2, "1 resolved"), [one("resolved"), one("in-progress", 8)])).toEqual([
      "00-index.md: the summary sentence has no count for status in-progress (the tree has 1)",
    ]);
  });

  it("catches a named number list that has gone stale", () => {
    // The index names the tickets of some statuses in parentheses; those lists
    // go stale the same way the counts do, and the real index has one wrong
    // today (in-progress says (87), and 72 is in progress too).
    expect(summaryProblems(sentence(2, "1 resolved, 1 in-progress (07)"), [one("resolved"), one("in-progress", 8)])).toEqual([
      "00-index.md: the summary sentence lists in-progress tickets (07), the tree has (08)",
    ]);
  });

  it("catches a number list that grew a ticket", () => {
    expect(summaryProblems(sentence(2, "1 resolved, 1 in-progress (08, 09)"), [one("resolved"), one("in-progress", 8)])).toEqual([
      "00-index.md: the summary sentence lists in-progress tickets (08, 09), the tree has (08)",
    ]);
  });

  it("refuses to guess when the item list is not the format it reads", () => {
    // A sentence the rule cannot read would sit green on the exact failure it
    // exists to catch, so the format is refused rather than skipped.
    const problems = summaryProblems(sentence(2, "1 resolved and 1 ready-for-agent"), [one("resolved"), one("ready-for-agent")]);
    expect(problems[0]).toContain("not in the format this rule reads");
    expect(problems[0]).toContain('expected the summary sentence to read "<count> tickets (as of YYYY-MM-DD): <count> resolved, <count> ready-for-agent, …"');
  });

  it("never puts a count in the message that says which format it reads", () => {
    // Whoever chases a red build copies what the message says, so a message
    // that names counts becomes an instruction to write numbers that were
    // already stale. The problems that do quote counts name both sides.
    const unreadable = ["# index\n\nNothing counted here.\n", "# index\n\n87 tickets (as of 2026-09-27): 1 resolved and 1 ready-for-agent.\n"];
    for (const index of unreadable) {
      const message = summaryProblems(index, [one("resolved")])[0];
      expect(message).toMatch(/<count>|no summary sentence/);
      expect(message, `a frozen count in the format hint: ${message}`).not.toMatch(/\d+ (resolved|ready-for-agent|ready-for-human|wontfix|in-progress)/);
    }
  });

  it("refuses a count written where a name should be", () => {
    expect(summaryProblems(sentence(2, "resolved, 1 ready-for-agent"), [one("resolved"), one("ready-for-agent")])[0]).toContain(
      "not in the format this rule reads",
    );
  });

  it("refuses a sentence whose header is not the format it reads", () => {
    expect(summaryProblems("# index\n\n87 tickets as of 2026-09-27: 1 resolved.\n", [one("resolved")])[0]).toContain("no summary sentence to check");
  });

  it("refuses a sentence that is not there at all", () => {
    const problems = summaryProblems("# index\n\nNothing counted here.\n", [one("resolved")]);
    expect(problems[0]).toContain("no summary sentence to check");
  });

  it("will not count a ticket it cannot read a Status from", () => {
    const blind: Ticket = { number: 8, name: "08.md", status: null, comments: [] };
    const problems = summaryProblems(sentence(2, "1 resolved"), [one("resolved"), blind]);
    expect(problems).toEqual(["ticket 08: 08.md has no Status: line, so it cannot be counted"]);
  });
});

describe("the review-marker rule", () => {
  const merged = (comments: string[], status = "resolved"): Ticket => ({ number: 88, name: "88-next.md", status, comments });

  it("accepts a merged ticket that carries the marker in ## Comments", () => {
    expect(reviewMarkerProblems([merged(["- 2026-09-27 — Two-axis review: Standards clean, Spec clean."])], 43, MARKER)).toEqual([]);
  });

  it("refuses a merged ticket with no ## Comments section at all", () => {
    expect(reviewMarkerProblems([merged([])], 43, MARKER)).toEqual([88]);
  });

  it("refuses a merged ticket whose Comments never mention the marker", () => {
    expect(reviewMarkerProblems([merged(["- 2026-09-27 — Re-review clean."])], 43, MARKER)).toEqual([88]);
  });

  it("refuses a marker written in any other wording", () => {
    // The wordings in the tree today: the record is real, but prose that varies
    // per ticket cannot be audited, so it counts as no record.
    for (const note of [
      "- 2026-09-26 — Re-review after fixes: Standards 0 hard findings.",
      "- **Review fixes**, test-first.",
      "- Standards and Spec both clean.",
      "- two-axis review, both axes clean.",
    ]) {
      expect(reviewMarkerProblems([merged([note])], 43, MARKER), `this counts as a record: ${note}`).toEqual([88]);
    }
  });

  it("ignores a marker written outside ## Comments", () => {
    // The word review is everywhere else in a ticket, acceptance criteria and
    // notes included, so only the Comments section is read. The ticket text is
    // parsed the way the tree's files are, so this is the real read.
    const text = [
      "# A ticket",
      "",
      "Status: resolved",
      "",
      "## Acceptance criteria",
      "",
      "- [x] The Two-axis review is recorded somewhere.",
      "",
      "## Notes",
      "",
      "- Two-axis review, from the notes.",
      "",
      "## Comments",
      "",
      "- merged, nothing written here",
    ].join("\n");
    expect(reviewMarkerProblems([{ number: 88, name: "88-next.md", status: ticketStatus(text), comments: ticketComments(text) }], 43, MARKER)).toEqual([88]);
  });

  it("reads every ## Comments section, since a ticket may carry several", () => {
    expect(reviewMarkerProblems([merged(["first", "- Two-axis review (Standards and Spec)."])], 43, MARKER)).toEqual([]);
  });

  it("leaves a ticket that is not resolved alone", () => {
    for (const status of ["ready-for-agent", "in-progress", "wontfix", "ready-for-human"]) {
      expect(reviewMarkerProblems([merged([], status)], 43, MARKER), `${status} does not merge`).toEqual([]);
    }
  });

  it("leaves a resolved ticket below the ratchet alone", () => {
    const old: Ticket = { number: 12, name: "12-tariffs.md", status: "resolved", comments: [] };
    expect(reviewMarkerProblems([old], 43, MARKER)).toEqual([]);
  });

  it("spreads the numbers back in number order, whatever order the files came in", () => {
    const tickets: Ticket[] = [
      { number: 50, name: "50.md", status: "resolved", comments: [] },
      { number: 44, name: "44.md", status: "resolved", comments: [] },
      { number: 49, name: "49.md", status: "resolved", comments: [MARKER] },
    ];
    expect(reviewMarkerProblems(tickets, 43, MARKER)).toEqual([44, 50]);
  });
});

describe("reading a ticket file", () => {
  const text = [
    "# Title",
    "",
    "Status: resolved",
    "Blocked by: —",
    "",
    "## Acceptance criteria",
    "",
    "- [ ] something",
    "",
    "## Comments",
    "",
    "- first note",
    "",
    "### a subheading",
    "- the marker lives here too",
    "",
    "## Notes",
    "- the marker outside Comments",
    "",
    "## Comments",
    "",
    "- later note",
  ].join("\n");

  it("takes the first Status line, whatever the file's own style is", () => {
    expect(ticketStatus(text)).toBe("resolved");
    expect(ticketStatus("Status: wontfix\n")).toBe("wontfix");
    expect(ticketStatus("# Title\n\nStatus:   ready-for-agent  \n")).toBe("ready-for-agent");
    expect(ticketStatus("Status: ready-for-agent\nStatus: resolved\n")).toBe("ready-for-agent");
  });

  it("has no Status when the file declares none", () => {
    expect(ticketStatus("# Title\n\nBlocked by: —\n")).toBeNull();
  });

  it("does not mistake prose mentioning a status for the Status line", () => {
    expect(ticketStatus("# Title\n\nThe Status: line is required.\n")).toBeNull();
  });

  it("reads every ## Comments section and nothing else", () => {
    const comments = ticketComments(text);
    expect(comments).toHaveLength(2);
    expect(comments[0]).toContain("first note");
    expect(comments[0]).toContain("a subheading");
    expect(comments[1]).toContain("later note");
    expect(comments.join("\n")).not.toContain("outside Comments");
    expect(comments.join("\n")).not.toContain("## Acceptance criteria");
  });

  it("has no Comments section when the file has none", () => {
    expect(ticketComments("# Title\n\n## Acceptance criteria\n\n- [x] done\n")).toEqual([]);
  });

  it("reads a ticked and an unticked acceptance criterion the same way", () => {
    // Nothing here depends on a checkbox: the guard reads Status and Comments,
    // so `- [x]` and `- [ ]` in the tree make no difference to it.
    const ticked = text.replace("- [ ] something", "- [x] something");
    expect(ticketStatus(ticked)).toBe(ticketStatus(text));
    expect(ticketComments(ticked)).toEqual(ticketComments(text));
  });
});

describe("reading 00-index.md", () => {
  it("reads a status out of every ticket row, wherever its table sits", () => {
    const index = [
      "| # | Title | Status | Blocked by |",
      "|---|---|---|---|",
      "| [01](01-walking-skeleton.md) | Walking skeleton | resolved | — |",
      "prose in between, and a second table below it",
      "| [64](64-backups-s3-jakarta.md) | Backups | resolved | 03, 07 |",
      "",
    ].join("\n");
    const rows = indexRows(index);
    expect([...rows.keys()].sort((a, b) => a - b)).toEqual([1, 64]);
    expect(rows.get(1)).toEqual({ file: "01-walking-skeleton.md", status: "resolved" });
    expect(rows.get(64)?.status).toBe("resolved");
  });

  it("reads nothing out of a table that is not a list of tickets", () => {
    expect(indexRows("# index\n\n| Story | Ticket(s) |\n|---|---|\n| 1 | 26 |\n").size).toBe(0);
  });

  it("reads nothing out of a file with no tables at all", () => {
    expect(indexRows("# index\n\nNo tables.\n").size).toBe(0);
  });
});

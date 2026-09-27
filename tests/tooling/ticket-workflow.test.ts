import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  indexRows,
  reviewMarkerProblems,
  statusSyncProblems,
  summaryProblems,
  ticketComments,
  ticketFileProblems,
  ticketStatus,
  TICKET_FILE_NAME,
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
 * the discipline had a marker at all. How many of them carry no record at all is
 * a measurement of history, so it is measured in a test below rather than only
 * written here. AGENTS.md's prose said nine where the tree said eleven, and this
 * comment repeated the nine; the correction landed in the file that states the
 * number and left every copy of it behind, which is what a number that lives
 * only in prose does. The number in the test is *not* a copy of AGENTS.md, and
 * nothing keeps the two in step: they are two statements of one measurement,
 * and the test is the one that moves when the tree does, which is why the prose
 * is updated in the same commit. Those gaps are historical and are not
 * reconstructed here.
 *
 * Above 43 the discipline *was* in force when those tickets merged, so they are
 * what a plain `>= 43` rule would fail on today. GRACE below names them: 17
 * tickets at or above the boundary that resolved before this guard existed, so
 * no marker was ever written for them. Their record is left exactly as the
 * merges left it — several carry review evidence in another wording, some carry
 * nothing at all, and none of that is invented here.
 *
 * What the tests below actually guarantee about the list, and no more: every
 * name is a real ticket, resolved, at or above RATCHET_FROM; the list is sorted
 * and free of duplicates; and the rule's output is compared with it by
 * `toEqual`, so an offender that is not on the list fails the build, and a gap
 * that no longer exists has to come off the list. What they do not do is stop
 * the next person from typing one more number into GRACE and going green again
 * — a test cannot forbid a list it is comparing against. That edit is visible in
 * the diff, in a commit whose message says why, which is the guarantee here:
 * the decision to spare a ticket is auditable, not impossible.
 *
 * Do not lower RATCHET_FROM: the tickets below 43 merged before the marker
 * existed, so a lower boundary fails the build on history rather than on a live
 * violation.
 */
const RATCHET_FROM = 43;

/** The resolved tickets at or above RATCHET_FROM that predate this guard. */
const GRACE = [60, 61, 63, 66, 67, 68, 70, 71, 73, 75, 76, 77, 78, 80, 82, 83, 85];

/**
 * The tree the guard reads, or the reason it could not be read.
 *
 * `.scratch/` is tracked, so on any real checkout it is there; a CI image or a
 * shallow export that leaves it out would otherwise throw ENOENT from module
 * scope, which fails the whole file at *collection* with a stack trace and
 * takes the other 49 tests with it, saying nothing about tickets. So the read
 * answers with a message instead, and every check below starts from that
 * message: a tree that could not be read is not a tree with nothing wrong in
 * it, and a green check over an empty list would be the exact failure this
 * guard is for.
 */
type Tree = { issueFiles: string[]; indexText: string; tickets: Ticket[]; problem: string | null };

function readTree(issues: URL = ISSUES): Tree {
  const empty: Tree = { issueFiles: [], indexText: "", tickets: [], problem: null };
  try {
    const issueFiles = readdirSync(issues);
    // The reader and the naming rule share one pattern (TICKET_FILE_NAME), so
    // they cannot disagree about which files are tickets — which is how the
    // first version came to read files the rule called invalid.
    const tickets = issueFiles
      .filter((name) => TICKET_FILE_NAME.test(name) && name !== INDEX)
      .map((name) => {
        const text = readFileSync(new URL(name, issues), "utf8");
        return { number: Number(name.slice(0, 2)), name, status: ticketStatus(text), comments: ticketComments(text) };
      })
      .sort((a, b) => a.number - b.number);
    return { issueFiles, indexText: readFileSync(new URL(INDEX, issues), "utf8"), tickets, problem: null };
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code ?? "unknown error";
    return {
      ...empty,
      problem: `00-index.md / the issues directory could not be read at ${fileURLToPath(issues)} (${code}) — the guard needs the tracked .scratch/ tree, so this is a checkout problem, not a ticket problem`,
    };
  }
}

const tree = readTree();
const { issueFiles, indexText, tickets } = tree;
const offenders = reviewMarkerProblems(tickets, RATCHET_FROM, MARKER);

/** The rule's problems, behind the reason the tree may not have been readable. */
function treeProblems<T>(problems: T[]): (T | string)[] {
  return tree.problem === null ? problems : [tree.problem, ...problems];
}

describe("the ticket workflow discipline", () => {
  it("reads the tree, or says why it could not be read", () => {
    // The three checks below are wrapped in this, so a checkout without the
    // tracked .scratch/ tree fails all of them with the reason rather than
    // passing three of them over an empty list.
    expect(tree.problem, tree.problem ?? "the tree was read").toBeNull();
  });

  it("reads every ticket in the tree before it checks anything", () => {
    // A guard that read nothing would pass on every violation it exists to
    // catch, so the files it is about are checked rather than assumed: as many
    // as the index has rows, one Status each, one file per number, and every
    // file's name carrying the number it was read under.
    const rows = indexRows(indexText);
    expect(treeProblems([])).toEqual([]);
    expect(tickets.length, "no ticket files were read").toBeGreaterThan(0);
    expect(tickets.length, "a ticket file the index lists was not read").toBe(rows.size);
    // The naming rule is handed the directory listing, not a filtered one, and
    // that listing is the one the tickets above came from — so a green naming
    // rule is a tree with nothing to catch, not a rule handed nothing.
    expect(issueFiles.filter((name) => name.endsWith(".md"))).toHaveLength(tickets.length + 1);
    expect(ticketFileProblems(issueFiles), "a ticket file is named outside the two-digit convention, so it is invisible to every other check").toEqual([]);
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
    expect(treeProblems(statusSyncProblems(tickets, indexText))).toEqual([]);
  });

  it("keeps the counts 00-index.md's own summary sentence states", () => {
    // The sentence is a hand-written restatement of the table below it, so it
    // goes stale the moment a Status is flipped and the sentence is not re-read.
    // No counts are written here on purpose: the sentence is the tree's, and a
    // number copied into a test goes stale the same way the sentence does.
    // What the rule compares, today: the total, the count of every status, and
    // the numbers in parentheses where the sentence lists them (ready-for-human,
    // wontfix and in-progress) — all of which the current index states correctly.
    expect(treeProblems(summaryProblems(indexText, tickets))).toEqual([]);
  });

  it("requires every resolved ticket at or above the ratchet to carry the marker", () => {
    // Equality in both directions: an offender that is not in GRACE is a merge
    // without a review record, and a name left in GRACE is a gap that no longer
    // exists and has to come off the list.
    expect(treeProblems(offenders), "a resolved ticket at or above the ratchet has no review marker; write it, or name it in GRACE if it predates the guard").toEqual(GRACE);
  });

  it("keeps the history it claims below the ratchet, as a number and not a comment", () => {
    // The comment on RATCHET_FROM says how much review history is missing below
    // the boundary, and that number has drifted in prose before: AGENTS.md said
    // nine where the tree said eleven, and a comment here repeated the nine. So
    // it is measured here, and the two halves are counted separately because they
    // mean different things: records that exist in another wording, and tickets
    // whose merge left nothing.
    //
    // There is deliberately no sum of the buckets here. They are a partition of
    // one list, so the sum equals its own length by construction and cannot
    // fail — an assertion that cannot fail is a claim of safety with nothing
    // behind it, which is what the re-review caught in the first version.
    const under = (withMarker: boolean): Ticket[] =>
      tickets.filter(
        (ticket) => ticket.status === "resolved" && ticket.number < RATCHET_FROM && ticket.comments.some((section) => section.includes(MARKER)) === withMarker,
      );
    // Both counts move when a pre-ratchet ticket gains its marker, and that is the
    // point: writing the record is a visible act, so the number that watches it
    // moves. Ticket 26 took this from 7 to 8, and ticket 23 from 8 to 9, both on
    // 2026-09-27. The half that has no record at all never moves downwards on its
    // own — only a real merge can.
    expect(under(true).length, "records below the ratchet, in the marker's wording").toBe(9);
    expect(under(false).length, "resolved tickets below the ratchet with no review record at all").toBe(11);
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

describe("the ticket-file naming rule", () => {
  it("catches the ticket file both other readers cannot see", () => {
    // `100-*.md` is invisible on both sides at once: the two-digit filter drops
    // it from the ticket list, and a three-digit number is not an index row
    // either. So the two readers below are shown dropping it, and this rule is
    // the one thing left that sees it.
    const names = [INDEX, "07-production.md", "100-catalog.md"];
    expect(names.filter((name) => TICKET_FILE_NAME.test(name) && name !== INDEX)).toEqual(["07-production.md"]);
    expect(indexRows("| [100](100-catalog.md) | Catalog | resolved | — |\n").size).toBe(0);
    expect(ticketFileProblems(names)).toEqual([
      "100-catalog.md: not a ticket file name — one is <nn>-<slug>.md, two digits (01..99) then a dash then a slug with no spaces and a lowercase .md. The readers match that name exactly, so this one is at best half-read and at worst not read at all: rename it to fit, or move it out of the issues directory",
    ]);
  });

  it("catches a capital extension, which no reader and no rule used to notice", () => {
    // A `.MD` file sat in the same blind spot as a 100, for the same reason: the
    // reader asked for `.md` and the rule asked for `.md`, so both said no and
    // the file was in the tree with nothing checking it. The rule now looks for
    // the extension case-insensitively, and the two readers are shown not
    // reading it.
    const names = [INDEX, "07-x.MD", "08-y.Md"];
    expect(names.filter((name) => TICKET_FILE_NAME.test(name) && name !== INDEX)).toEqual([]);
    expect(indexRows("| [07](07-x.MD) | X | resolved | — |\n").size).toBe(0);
    const problems = ticketFileProblems(names);
    expect(problems.map((problem) => problem.split(":")[0])).toEqual(["07-x.MD", "08-y.Md"]);
    for (const problem of problems) {
      expect(problem).toContain("lowercase .md");
      expect(problem).toContain("rename it to fit, or move it out of the issues directory");
    }
  });

  it("catches a space in the name, which the reader read and the rule refused", () => {
    // The two answers disagreed: the reader's pattern was looser than the rule's,
    // so `07- a.md` was read as a ticket and then reported as an invalid name.
    // One pattern decides both now, and this is what says so.
    for (const name of ["07- a.md", "07-a b.md", "9-late.md", "notes.md"]) {
      expect(TICKET_FILE_NAME.test(name), `${name} is read as a ticket file`).toBe(false);
      expect(ticketFileProblems([name]), `${name} is not refused`).toHaveLength(1);
    }
  });

  it("leaves a two-digit ticket and the index alone", () => {
    expect(ticketFileProblems([INDEX, "01-walking-skeleton.md", "87-cloud-session-readiness.md"])).toEqual([]);
  });

  it("reports the files in one order however the directory lists them", () => {
    expect(ticketFileProblems(["100-a.md", "9-b.md", "01-c.md"])).toEqual(ticketFileProblems(["9-b.md", "01-c.md", "100-a.md"]));
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
    // The index names the tickets of some statuses in parentheses (today:
    // ready-for-human, wontfix and in-progress), and those lists go stale the
    // same way the counts do — a ticket that changes status leaves its number
    // behind in the sentence.
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
    // exists to catch, so the format is refused rather than skipped. The message
    // points at the line and quotes the part it stopped on, because a format
    // described only in the abstract is a problem the reader has to find by eye.
    const problems = summaryProblems(sentence(2, "1 resolved and 1 ready-for-agent"), [one("resolved"), one("ready-for-agent")]);
    expect(problems[0]).toContain("not in the format this rule reads");
    expect(problems[0]).toContain('expected the summary sentence to read "<count> tickets (as of YYYY-MM-DD): <count> resolved, <count> ready-for-agent, …"');
    expect(problems[0]).toContain("line 3:");
    expect(problems[0]).toMatch(/"and 1 ready-for-agent/);
  });

  it("quotes the line it could not read, from where it stopped", () => {
    // The index's paragraph is one long line, so a quote has to start where the
    // reading stopped: a quote of the line's first 72 characters would show the
    // reader the header they have already read and cut off the part that failed.
    const problems = summaryProblems(sentence(2, "1 resolved, 2 ready-for-agent and 1 wontfix"), [one("resolved")]);
    expect(problems[0]).toMatch(/line 3: "and 1 wontfix/);
    expect(problems[0], "the quote starts at the sentence header, so it hides the part that failed").not.toMatch(/line 3: "2 tickets/);
  });

  it("points at the prose line when there is no sentence at all", () => {
    const problems = summaryProblems("# index\n\nNothing counted here.\n", [one("resolved")]);
    expect(problems[0]).toContain("no summary sentence to check");
    expect(problems[0]).toContain('line 3: "Nothing counted here."');
  });

  it("never puts a count in the message that says which format it reads", () => {
    // Whoever chases a red build copies what the message says, so a message
    // that names counts as the expected value becomes an instruction to write
    // numbers that were already stale. Quoting the file's own text is the
    // opposite: that is what the file says, not what it should say.
    const message = summaryProblems("# index\n\nNothing counted here.\n", [one("resolved")])[0];
    expect(message).toMatch(/<count>|no summary sentence/);
    expect(message, `a frozen count in the format hint: ${message}`).not.toMatch(/\d+ (resolved|ready-for-agent|ready-for-human|wontfix|in-progress)/);
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

  it("refuses a sentence whose header is not the format it reads", () => {
    const problems = summaryProblems("# index\n\n87 tickets as of 2026-09-27: 1 resolved.\n", [one("resolved")]);
    expect(problems[0]).toContain("no summary sentence to check");
    expect(problems[0]).toMatch(/line 3: "87 tickets as of 2026-09-27: 1 resolved\."/);
  });
});

describe("reading the tree", () => {
  it("answers with a message when the issues directory is not there", () => {
    // A checkout without the tracked .scratch/ tree used to throw ENOENT from
    // module scope, which fails the file at collection and takes every other
    // test with it, saying nothing about tickets. The message has to name the
    // path it looked at, so the reader can tell which tree is missing.
    const missing = readTree(new URL("file:///tmp/makam-no-such-scratch-9f21/"));
    expect(missing.problem).toContain("/tmp/makam-no-such-scratch-9f21/");
    expect(missing.problem).toContain("the guard needs the tracked .scratch/ tree");
    expect(missing.problem).toContain("ENOENT");
    expect(missing.tickets).toEqual([]);
    expect(missing.indexText).toBe("");
  });

  it("fails the checks over an unreadable tree instead of passing them empty", () => {
    // The failure mode this exists to stop: the three rules handed an empty list
    // find nothing wrong in it, and a green build then says the tree is clean.
    // Over the real tree the same wrapper adds nothing, which is the other half
    // of the claim — asserted in "reads every ticket in the tree".
    const missing = readTree(new URL("file:///tmp/makam-no-such-scratch-9f21/"));
    const reported = <T,>(problems: T[]): (T | string)[] => (missing.problem === null ? problems : [missing.problem, ...problems]);
    expect(reported(statusSyncProblems(missing.tickets, missing.indexText))).toEqual([missing.problem]);
    // The summary rule complains about the empty text as well, on top of the
    // reason it could not be read; the reason comes first either way.
    expect(reported(summaryProblems(missing.indexText, missing.tickets))[0]).toBe(missing.problem);
    expect(reported(reviewMarkerProblems(missing.tickets, RATCHET_FROM, MARKER))).toEqual([missing.problem]);
    // And the rules on their own really do return nothing, or next to nothing,
    // over an empty list — which is why the wrapper is what turns a missing tree
    // into a red build.
    expect(statusSyncProblems(missing.tickets, missing.indexText)).toEqual([]);
    expect(reviewMarkerProblems(missing.tickets, RATCHET_FROM, MARKER)).toEqual([]);
  });

  it("reads the real tree, so the three checks above are not passing an empty list", () => {
    expect(tree.problem, tree.problem ?? "the tree was read").toBeNull();
    expect(tickets.length).toBeGreaterThan(0);
    expect(indexText).toContain("tickets (as of");
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
    // `wontfix` is exempt by design, not by accident: a ticket closed as
    // not-doing was never built, so there is no code that a review could have
    // looked at. `in-progress` is not a merge yet. The other two are not merged
    // either.
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

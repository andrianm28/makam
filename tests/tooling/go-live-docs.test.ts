import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ticketComments } from "../support/ticket-workflow";

/**
 * The go-live documents (ticket 113): the decision records, the spec's Release
 * plan, the runbook's go-live procedures and the gate checklist. They are prose,
 * so each test holds one load-bearing fact (a number, a command, an order, a
 * word the owner decided), never a sentence: the wording may be improved, the
 * decision may not drift.
 */
const repo = path.join(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");

/** A `## ` section of a markdown file: its heading line (matched by prefix) up to the next `## ` heading. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}`);
  expect(start, `no "## ${heading}" section`).toBeGreaterThanOrEqual(0);
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

/** A `### ` subsection of a section's text, up to the next `### ` (or `## `) heading. */
function subsection(text: string, heading: string): string {
  const start = text.indexOf(`\n### ${heading}`);
  expect(start, `no "### ${heading}" subsection`).toBeGreaterThanOrEqual(0);
  const rest = text.slice(start + 1);
  const next = rest.search(/\n##+ /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("ADR 0006's Amendment (2026-10-04)", () => {
  const adr = read("docs/adr/0006-release-gate-per-environment.md");
  const amendment = adr.slice(adr.indexOf("## Amendment (2026-10-04"));

  it("comes after the 2026-10-03 amendment, which stays as history", () => {
    expect(adr).toContain("## Amendment (2026-10-03, owner decision)");
    expect(adr.indexOf("## Amendment (2026-10-04")).toBeGreaterThan(adr.indexOf("## Amendment (2026-10-03"));
  });

  it("switches production at Rilis 1, written explicitly in prod.env, reversing the 2026-10-03 choice of 3", () => {
    expect(amendment).toMatch(/switches at `RILIS_TERBUKA=1`/);
    expect(amendment).toMatch(/`prod\.env`/);
    expect(amendment).toMatch(/explicit/i);
    expect(amendment).toMatch(/revers[^\n]*2026-10-03|2026-10-03[^\n]*revers/i);
  });

  it("opens Rilis 3 only once the UAT at 3 is signed, as a host setting and not a new promotion", () => {
    expect(amendment).toMatch(/opens? `?3`?[^\n]*(after|once)[^\n]*UAT[^\n]*signed|UAT at 3[^\n]*signed/i);
    expect(amendment).toMatch(/not a new (image|promotion)|never a new (image|promotion)/i);
  });

  it("leaves ticket 84 (Pintu Masuk) ungated", () => {
    expect(amendment).toMatch(/[Tt]icket 84[^\n]*ungated|ungated[^\n]*84/);
  });
});

describe("ADR 0007, the production beta shows marked example data", () => {
  // A missing file reads as empty, so each test below fails on its own fact instead of the suite failing to load.
  const adr = (() => {
    try {
      return read("docs/adr/0007-production-beta-shows-marked-example-data.md");
    } catch {
      return "";
    }
  })();

  it("is the one ADR numbered 0007, and the numbering has no gap", () => {
    const numbers = readdirSync(path.join(repo, "docs/adr"))
      .filter((name) => /^\d{4}-.+\.md$/.test(name))
      .map((name) => Number(name.slice(0, 4)))
      .sort((a, b) => a - b);
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
    expect(adr.split("\n")[0]).toBe("# The production beta shows marked example data");
  });

  it("records the beta on the sandbox: no real orders, no real Pencairan and no real refund transfer", () => {
    expect(adr).toMatch(/sandbox/i);
    expect(adr).toMatch(/no real orders?/i);
    expect(adr).toMatch(/Pencairan/);
    expect(adr).toMatch(/refund transfer/i);
  });

  it("records Data Contoh as visible '(Contoh)' records for every Rilis, prices included", () => {
    expect(adr).toContain("Data Contoh");
    expect(adr).toContain("(Contoh)");
    expect(adr).toMatch(/every (Rilis|release)|all (Rilis|releases)/i);
    expect(adr).toMatch(/prices/i);
  });

  it("makes `cabut` mandatory before real operation, and names the preflight guard", () => {
    expect(adr).toMatch(/`cabut`/);
    expect(adr).toMatch(/before real operation/i);
    expect(adr).toMatch(/preflight/i);
    expect(adr).toMatch(/FAIL/);
  });

  it("allows production seeding only for the Data Contoh command", () => {
    expect(adr).toMatch(/only (through|for|by) the Data Contoh command|Data Contoh command[^\n]*only/i);
    expect(adr).toContain("seed-contoh-publik");
  });

  it("is a recorded decision, not a glossary: it names the alternatives it rejected", () => {
    expect(adr).toMatch(/## Considered options/);
    expect(adr).toMatch(/## Consequences/);
  });
});

describe("CONTEXT.md", () => {
  const context = read("CONTEXT.md");
  const start = context.indexOf("**Data Contoh**:");
  const entry = context.slice(start, context.indexOf("\n\n", start));

  it("defines Data Contoh as a glossary term with an Avoid line", () => {
    expect(start, "no Data Contoh entry").toBeGreaterThanOrEqual(0);
    expect(entry).toMatch(/\n_Avoid_: /);
    expect(entry).toContain("(Contoh)");
  });

  it("keeps the entry a glossary entry: no command, flag, path or code in it", () => {
    expect(start, "no Data Contoh entry").toBeGreaterThanOrEqual(0);
    expect(entry).not.toMatch(/`|--|dist\/|\bcabut\b|\btanam\b/);
  });
});

describe("the spec's Release plan", () => {
  const spec = read(".scratch/makam-v1/spec.md");
  const from = spec.indexOf("### Release plan");
  const plan = spec.slice(from, spec.indexOf("\n## ", from));

  it("says production switches at Rilis 1 on the sandbox and opens 3 after a signed UAT at 3", () => {
    expect(plan).toMatch(/2026-10-04/);
    expect(plan).toMatch(/`RILIS_TERBUKA=1`/);
    expect(plan).toMatch(/sandbox/i);
    expect(plan).toMatch(/UAT at 3[^\n]*signed|signed[^\n]*UAT at 3/i);
    expect(plan).toMatch(/no real orders/i);
  });

  it("says production shows Data Contoh, removable before real operation, and points at ADR 0006 and ADR 0007", () => {
    expect(plan).toContain("Data Contoh");
    expect(plan).toMatch(/ADR 0007/);
    expect(plan).toMatch(/ADR 0006[^\n]*(amend|2026-10-04)/i);
  });

  it("lists the backup and monitoring gates of the switch", () => {
    expect(plan).toMatch(/backups?/i);
    expect(plan).toMatch(/restore test/i);
    expect(plan).toMatch(/uptime/i);
    expect(plan).toMatch(/GlitchTip/);
  });

  it("names tickets 106 to 113", () => {
    for (let ticket = 106; ticket <= 113; ticket += 1) expect(plan, `ticket ${ticket}`).toMatch(new RegExp(`\\b${ticket}\\b`));
  });
});

describe("the pointers to the 2026-10-04 amendment", () => {
  const index = read(".scratch/makam-v1-build/issues/00-index.md");

  it("00-index.md's 2026-10-03 release plan entry points to ADR 0006's Amendment (2026-10-04)", () => {
    const entry = index.split("\n").find((line) => line.startsWith("- 2026-10-03 — **Owner decisions (option tool): the go-live opens all three releases"));
    expect(entry, "the 2026-10-03 entry is gone").toBeDefined();
    expect(entry).toMatch(/Amendment \(2026-10-04\)/);
  });

  it("00-index.md records the 2026-10-04 decisions above it", () => {
    const entries = index.split("\n").filter((line) => line.startsWith("- 2026-10-0"));
    expect(entries[0]).toMatch(/^- 2026-10-04 — /);
    expect(entries[0]).toMatch(/RILIS_TERBUKA=1/);
    expect(entries[0]).toMatch(/ADR 0007/);
  });

  it("ticket 65's Comments point to it", () => {
    const comments = ticketComments(read(".scratch/makam-v1-build/issues/65-production-switch-makam-co-id.md")).join("\n");
    expect(comments).toMatch(/Amendment \(2026-10-04\)/);
    expect(comments).toMatch(/makam-nonprod-postgres-1/);
  });
});

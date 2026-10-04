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

/** The text with every run of whitespace as one space: the runbook is hard-wrapped, so a phrase may break across two lines. */
const flat = (text: string): string => text.replace(/\s+/g, " ");

/**
 * A `## ` section of a markdown file: its heading line (matched by prefix) up to the next `## ` heading.
 * A section that is not there reads as empty, so the tests of a section nobody has written yet fail
 * one by one on the fact they hold, instead of the whole suite failing to load.
 */
function section(text: string, heading: string): string {
  const start = text.indexOf(`\n## ${heading}`);
  if (start < 0) return "";
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

/** A `### ` subsection of a section's text, up to the next heading of its level or above; empty when it is not there. */
function subsection(text: string, heading: string): string {
  const start = text.indexOf(`\n### ${heading}`);
  if (start < 0) return "";
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

const runbook = read("docs/ops/runbook.md");

describe('the runbook "Hari switch", for gate G3 of the go-live checklist', () => {
  const text = section(runbook, "Hari switch");
  const steps = text.split(/\n(?=\d+\. \*\*)/).slice(1);
  /** The numbered step whose bold title matches, so a step may move without every test knowing its number. */
  const stepTitled = (title: RegExp): string => {
    const found = steps.find((step) => title.test(step.split("\n")[0]));
    expect(found, `no step titled ${title}`).toBeDefined();
    return flat(found as string);
  };

  it("writes production's RILIS_TERBUKA=1 in prod.env and checks it before anything deploys", () => {
    expect(text).toMatch(/RILIS_TERBUKA=1/);
    expect(text).toContain("prod.env");
  });

  it("promotes with promote.yml and pre-pulls the digest from ghcr, so the deploy does not depend on one slow pull", () => {
    const step = stepTitled(/Promote/);
    expect(step).toContain("promote.yml");
    expect(step).toMatch(/docker pull ghcr\.io\/andrianm28\/makam@sha256:/);
  });

  it("deploys with makam-deploy --env prod --digest, after a forced rollback of the new digest back to the running one", () => {
    const step = stepTitled(/Deploy/);
    expect(step).toContain("makam-deploy --env prod --digest");
    expect(step).toContain("MAKAM_HEALTH_WAIT=0");
    expect(step.indexOf("MAKAM_HEALTH_WAIT=0")).toBeLessThan(step.lastIndexOf("makam-deploy --env prod --digest"));
  });

  it("leaves seed:admin, the launch data and the second install-host.sh to the rehearsal, and says how to check them", () => {
    const step = stepTitled(/Deploy/);
    expect(step).toContain("seed-admin");
    expect(step).toContain("import-data-peluncuran");
    expect(step).toContain("install-host.sh");
  });

  it("plants the Rilis 1 Data Contoh with the production allowance, as a dry run first and then with --tulis", () => {
    const step = stepTitled(/Data Contoh/);
    expect(step).toContain("data-contoh.mjs tanam --set rilis1 --izinkan-production");
    expect(step).toContain("--tulis");
    expect(step).toContain("data-contoh.mjs status");
  });

  it("runs the preflight with --rilis 1 and names the SKIP lines that may stay", () => {
    const step = stepTitled(/Preflight/);
    expect(step).toContain("makam-preflight --env prod");
    expect(step).toContain("--rilis 1");
    for (const skip of ["sandbox", "uptime", "nginx"]) expect(step.toLowerCase(), skip).toContain(skip);
  });

  it("archives the old app from its Postgres container, makam-nonprod-postgres-1", () => {
    expect(stepTitled(/Archive/)).toContain("makam-arsip-app-lama --container makam-nonprod-postgres-1");
  });

  it("looks with makam-switch --cek before it switches with --ke v1", () => {
    const step = stepTitled(/Switch/);
    expect(step.indexOf("makam-switch --cek")).toBeGreaterThan(-1);
    expect(step.indexOf("makam-switch --cek")).toBeLessThan(step.indexOf("makam-switch --ke v1"));
  });

  it("moves the SumoPod webhook from dev.makam.co.id to makam.co.id and ends with Save & Test", () => {
    const step = stepTitled(/webhook/i);
    expect(step).toContain("https://dev.makam.co.id/api/webhooks/pembayaran");
    expect(step).toContain("https://makam.co.id/api/webhooks/pembayaran");
    expect(step).toContain("Save & Test");
    expect(step).toMatch(/staging[^\n]*(not confirmed|no longer)/i);
  });

  it("checks the site: health with environment, release and rilisTerbuka, the banner, Pengaturan Operator, TOTP and one order at a Lokasi (Contoh)", () => {
    const step = stepTitled(/Checks/);
    expect(step).toContain("https://makam.co.id/api/health");
    for (const word of ["environment", "release", "rilisTerbuka", "PEMBAYARAN UJI COBA", "Pengaturan Operator", "TOTP", "(Contoh)", "data-contoh.mjs status"]) {
      expect(step, word).toContain(word);
    }
  });

  it("watches production with the external uptime monitor and a GlitchTip alert test", () => {
    const step = stepTitled(/Monitoring/);
    expect(step).toContain("UptimeRobot");
    expect(step).toContain("sentry-check");
  });

  it("falls back to the maintenance page, and deletes the old app only afterwards", () => {
    expect(stepTitled(/Fallback/)).toContain("makam-switch --ke pemeliharaan");
    const deletion = stepTitled(/Delete/);
    expect(deletion).toContain("--hapus");
    expect(deletion).toContain("makam-nonprod-postgres-1");
  });

  it("no longer points at a step by its number, which drifts whenever the order does", () => {
    expect(runbook).not.toMatch(/"Hari\s+switch" step \d/);
  });
});

describe('the runbook "Which release is open"', () => {
  const text = section(runbook, "Which release is open");

  it("opens Rilis 1 on production at the switch and 3 after the signed UAT at 3, not from the go-live", () => {
    expect(text).toMatch(/\| production \| `1`/);
    expect(text).not.toMatch(/`3` from the go-live/);
    expect(text).toMatch(/UAT at 3[^\n]*signed|signed[^\n]*UAT at 3/i);
  });

  it("gives this host's exact command: /opt/makam-v1/prod, compose.yml, prod.env and deployed.env, never docker-compose.prod.yml", () => {
    expect(text).toContain("cd /opt/makam-v1/prod");
    expect(text).toContain("docker compose -p makam-prod -f compose.yml --env-file prod.env --env-file deployed.env");
    expect(text).toContain("up -d --force-recreate web worker");
    expect(text).not.toContain("docker-compose.prod.yml");
  });

  it("checks the opening with the worker's start line, no skipped tick, the health body and the preflight", () => {
    expect(text).toContain("started (RILIS_TERBUKA=");
    expect(text).toMatch(/skipped/);
    expect(text).toContain("rilisTerbuka");
    expect(text).toMatch(/makam-preflight --env prod[^\n]*--rilis 3/);
  });
});

describe('the runbook "Production (ticket 65)"', () => {
  it("lists RILIS_TERBUKA=1 among the settings prod.env is created with", () => {
    expect(section(runbook, "Production (ticket 65)")).toMatch(/`RILIS_TERBUKA=1`/);
  });
});

describe("the runbook's rules while production pays through the sandbox", () => {
  const text = section(runbook, "Production on SumoPod's sandbox");

  it("takes no real orders and makes no Pencairan or refund transfer, because Simulate Payment can be pressed by anyone", () => {
    const rules = flat(text);
    expect(rules).toMatch(/no real orders/i);
    expect(rules).toMatch(/Pencairan/);
    expect(rules).toMatch(/refund transfer/i);
    expect(rules).toContain("Simulate Payment");
  });

  it("gives CS a script, in Bahasa Indonesia, for turning a real order away without money moving", () => {
    const script = text
      .split("\n")
      .filter((line) => line.startsWith("> "))
      .join(" ");
    expect(script, "no quoted CS script").not.toBe("");
    expect(script).toMatch(/uji coba/);
    expect(script).toMatch(/tidak ada uang/);
  });

  it("has staff review the Antrean every day and close every order that is not the owner's UAT", () => {
    expect(flat(text)).toMatch(/Antrean[^.]*every day|every day[^.]*Antrean/i);
  });
});

describe('the runbook\'s "Going live" (leaving the beta)', () => {
  const going = flat(subsection(section(runbook, "Production on SumoPod's sandbox"), "Going live"));

  it("retires the Data Contoh, closes the beta orders and only then installs the live keys", () => {
    const order = ["data-contoh.mjs cabut", "beta orders", "SUMOPOD_API_KEY"].map((marker) => going.indexOf(marker));
    expect(order.every((at) => at >= 0), `markers missing: ${order}`).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("removes the SUMOPOD_BASE_URL line, redeploys, and ends with the preflight and its data contoh line", () => {
    expect(going).toContain("SUMOPOD_BASE_URL");
    expect(going).toMatch(/redeploy/i);
    expect(going.lastIndexOf("makam-preflight")).toBeGreaterThan(going.indexOf("SUMOPOD_API_KEY"));
    expect(going).toContain("data contoh");
  });

  it("says a contoh price must already be replaced by a real one, or cabut exits 1", () => {
    expect(going).toMatch(/exit(s)? 1/);
    expect(going).toMatch(/real (price|version)/i);
  });
});

describe("the runbook's Data Contoh section", () => {
  const text = section(runbook, "Data Contoh");

  it("documents tanam --set rilis1|rilis3, cabut and status, each a dry run unless --tulis", () => {
    for (const command of ["tanam --set rilis1", "tanam --set rilis3", "cabut", "status"]) expect(text, command).toContain(command);
    expect(text).toContain("--tulis");
    expect(flat(text)).toMatch(/dry run/i);
  });

  it("needs the allowance of the environment and an Admin Platform from seed:admin first", () => {
    expect(text).toContain("--izinkan-staging");
    expect(text).toContain("--izinkan-production");
    expect(text).toContain("seed:admin");
  });

  it("is the only way example data reaches production, and points at ADR 0007", () => {
    expect(flat(text)).toMatch(/only way example data reaches production/i);
    expect(text).toContain("ADR 0007");
  });

  it("has a data contoh line in the production preflight's table: SKIP on the sandbox, FAIL when live", () => {
    const preflight = section(runbook, "Production preflight");
    expect(preflight).toMatch(/\| data contoh \|[^\n]*SKIP[^\n]*FAIL[^\n]*\|/);
  });
});

describe("the runbook's rehearsal of the first production deploy (gate G1)", () => {
  const text = section(runbook, "Rehearsal");

  it("runs promote, deploy, seed:admin, the launch data, install-host.sh again and the preflight --rilis 1, in that order", () => {
    const order = ["promote.yml", "makam-deploy --env prod --digest", "seed-admin.mjs", "import-data-peluncuran.mjs", "install-host.sh", "--rilis 1"].map((marker) => text.indexOf(marker));
    expect(order.every((at) => at >= 0), `markers missing: ${order}`).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("says why: the preflight FAILs until the production timers exist, and they exist only after the first deploy", () => {
    expect(flat(text)).toMatch(/FAILs? until the[^.]*timers/);
  });

  it("refuses an image signed only with the staging key: exit 77, nothing touched", () => {
    expect(flat(text)).toMatch(/exit 77/i);
    expect(flat(text)).toMatch(/staging key|signed only/i);
  });

  it("forces a rollback with MAKAM_HEALTH_WAIT=0 and --force: exit 1, a failed Deployment, and a normal deploy to finish", () => {
    expect(text).toMatch(/MAKAM_HEALTH_WAIT=0[^\n]*--force/);
    expect(flat(text)).toMatch(/exit 1/i);
    expect(flat(text)).toMatch(/failure/);
  });

  it("proves the backups: a dump, the FileStore tar and the restore test, and four production timers", () => {
    for (const word of ["makam-backup-db --env prod", "makam-backup-files --env prod", "makam-restore-test --env prod", "makam-prod-"]) expect(text, word).toContain(word);
  });
});

describe('the runbook "Promoting to production" and the host\'s automatic rollback', () => {
  const text = section(runbook, "Promoting to production");

  it("lists the refusals in the order promote.yml makes them: owner, tag, a full SHA ref, the host's healthy status, the smoke result", () => {
    const workflow = read(".github/workflows/promote.yml");
    const inWorkflow = [
      "github.actor != github.repository_owner",
      'RELEASE_TAG_INPUT" != "$expected"',
      "^[0-9a-f]{40}$",
      '") healthy"',
      "smoke test against dev.makam.co.id for",
    ].map((snippet) => workflow.indexOf(snippet));
    expect(inWorkflow.every((at) => at >= 0), `promote.yml no longer holds: ${inWorkflow}`).toBe(true);
    expect(inWorkflow).toEqual([...inWorkflow].sort((a, b) => a - b));

    const list = flat(text.slice(text.indexOf("1. `github.actor`"), text.indexOf("Then, in this order")));
    const inRunbook = [/repository owner/, /release tag/, /full commit SHA/, /healthy/, /smoke/].map((pattern) => list.search(pattern));
    expect(inRunbook.every((at) => at >= 0), `the runbook's list misses one: ${inRunbook}`).toBe(true);
    expect(inRunbook).toEqual([...inRunbook].sort((a, b) => a - b));
  });

  it("says an automatic rollback leaves the failed digest's Deployment the newest, so promotion refuses until a healthy redeploy", () => {
    const prose = flat(text);
    expect(prose).toMatch(/automatic roll ?back/i);
    expect(prose).toMatch(/stays the newest/i);
    expect(prose).toMatch(/refuses until/i);
    expect(prose).toContain("--force");
  });

  it("says /api/health reads sha-<commit> after an automatic rollback, so release equals the Deployment's ref only after a normal deploy", () => {
    const reading = section(runbook, "Reading a deploy in GitHub");
    expect(flat(reading)).toMatch(/automatic roll ?back/i);
    expect(flat(reading)).toMatch(/release[^.]*reads `sha-<commit>`/);
  });
});

describe("the runbook's monitoring of production", () => {
  it("watches https://makam.co.id/api/health from outside, with a keyword monitor on \"ok\":true", () => {
    const uptime = section(runbook, "Uptime alarm");
    expect(uptime).toContain("UptimeRobot");
    expect(uptime).toContain("`https://makam.co.id/api/health`");
    expect(uptime).toContain('"ok":true');
    expect(flat(uptime)).toMatch(/production monitor/i);
  });

  it("sends GlitchTip's alerts by email: EMAIL_URL through the SumoPod relay (smtp+ssl), and the rule 'Error baru (email)' on both projects", () => {
    const errors = section(runbook, "errors.makam.co.id");
    for (const word of ["EMAIL_URL", "smtp+ssl", "DEFAULT_FROM_EMAIL", "Error baru (email)", "makam-staging", "makam-prod", "sentry-check"]) {
      expect(errors, word).toContain(word);
    }
  });
});

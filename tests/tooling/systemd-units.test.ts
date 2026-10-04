import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Production's backups, restore check and health watchdog (ticket 108). The
// host runs one set of systemd units per environment, and until this ticket
// only staging had the backup, restore and health ones: production's uploads
// and database would have had no backup at all. Nothing here needs systemd,
// Docker or the host: the units are read as files, and install-host.sh runs
// against a fake sudo and systemctl that only write down what they were asked,
// so it can never touch the machine the test runs on.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const unitsDir = path.join(repo, "deploy/systemd");
const read = (relative: string): string => readFileSync(path.join(repo, relative), "utf8");

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

type Directive = readonly [key: string, value: string];
/** Section name to its directives, in file order (ExecStart may repeat, and its order is meaningful). */
type Unit = Record<string, Directive[]>;

/** Comments and blank lines are dropped; every other line must be a section heading or `Key=Value`. */
function parseUnit(name: string, text: string): Unit {
  const unit: Unit = {};
  let section = "";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const heading = /^\[(\w+)\]$/.exec(line);
    if (heading) {
      section = heading[1];
      unit[section] = [];
      continue;
    }
    const eq = line.indexOf("=");
    if (!section || eq < 1) throw new Error(`${name}: not a section or a directive: ${line}`);
    unit[section].push([line.slice(0, eq), line.slice(eq + 1)]);
  }
  return unit;
}

const unitFile = (name: string): string => path.join(unitsDir, name);
const loadUnit = (name: string): Unit => parseUnit(name, readFileSync(unitFile(name), "utf8"));
const values = (unit: Unit, section: string, key: string): string[] =>
  (unit[section] ?? []).filter(([k]) => k === key).map(([, v]) => v);
function only(list: string[], what: string): string {
  expect(list, `${what}: expected exactly one`).toHaveLength(1);
  return list[0];
}

// The staging units that back up, restore-check or watch an environment. The
// deploy pair is not one of them: production's own deploy unit exists since
// ticket 65 and is deliberately never enabled by the installer.
const WATCHED_STAGING = [
  "makam-staging-db-backup.service",
  "makam-staging-db-backup.timer",
  "makam-staging-files-backup.service",
  "makam-staging-files-backup.timer",
  "makam-staging-restore-test.service",
  "makam-staging-restore-test.timer",
  "makam-staging-health.service",
  "makam-staging-health.timer",
];
/** Found on disk, so a staging unit added later is held to the same rule without anybody editing this file. */
const stagingUnits = readdirSync(unitsDir).filter(
  (file) => file.startsWith("makam-staging-") && /(backup|restore|health)/.test(file) && /\.(service|timer)$/.test(file),
);
const prodTwin = (staging: string): string => staging.replace("makam-staging-", "makam-prod-");

/** Local, so it is the same whether or not nginx and TLS are up: nginx still serves the old app until the switch. */
const PROD_HEALTH_URL = "http://127.0.0.1:3100/api/health";
const STAGING_HEALTH_URL = "https://dev.makam.co.id/api/health";

/** What a staging directive must say once the unit is production's. */
function asProd(value: string): string {
  return value
    .replaceAll("makam-staging-", "makam-prod-")
    .replaceAll("--env staging", "--env prod")
    .replaceAll(STAGING_HEALTH_URL, PROD_HEALTH_URL);
}

/** The words that name a unit and the hour it runs: these differ by design, everything else must not. */
const DIFFERS_BY_DESIGN = new Set(["Description", "OnCalendar"]);
function comparable(unit: Unit, transform: (value: string) => string): Unit {
  return Object.fromEntries(
    Object.entries(unit).map(([section, directives]) => [
      section,
      directives.filter(([key]) => !DIFFERS_BY_DESIGN.has(key)).map(([key, value]) => [key, transform(value)] as const),
    ]),
  );
}

describe("every staging backup, restore-check and health unit", () => {
  it("is found, so the sweep below is not an empty one", () => {
    expect(stagingUnits).toEqual(expect.arrayContaining(WATCHED_STAGING));
  });

  it.each(stagingUnits)("%s has a production twin", (staging) => {
    expect(existsSync(unitFile(prodTwin(staging))), `${prodTwin(staging)} is missing from deploy/systemd`).toBe(true);
  });

  it.each(stagingUnits)("%s: its production twin says the same except for the environment, the URL and the hour", (staging) => {
    expect(comparable(loadUnit(prodTwin(staging)), (value) => value)).toEqual(comparable(loadUnit(staging), asProd));
  });

  it.each(stagingUnits)("%s: its production twin never names staging in a directive", (staging) => {
    const unit = loadUnit(prodTwin(staging));
    const naming = Object.values(unit)
      .flat()
      .filter(([, value]) => /staging/i.test(value));
    expect(naming).toEqual([]);
  });

  it.each(["makam-prod-db-backup.service", "makam-prod-files-backup.service", "makam-prod-restore-test.service", "makam-prod-health.service"])(
    "%s has the same hardening as staging's, and does not run as root",
    (name) => {
      const prod = loadUnit(name);
      const staging = loadUnit(name.replace("makam-prod-", "makam-staging-"));
      // The comparison above would pass if both had lost a line; these four, and the
      // user, are what the units are for.
      for (const key of ["NoNewPrivileges", "PrivateTmp", "ProtectSystem", "ProtectHome", "User", "Group"]) {
        const stagingValue = only(values(staging, "Service", key), `${name.replace("makam-prod-", "makam-staging-")} ${key}`);
        expect(only(values(prod, "Service", key), `${name} ${key}`), key).toBe(stagingValue);
      }
      expect(values(prod, "Service", "User")).toEqual(["ubuntu"]);
      expect(values(prod, "Service", "NoNewPrivileges")).toEqual(["yes"]);
      expect(values(prod, "Service", "ProtectSystem")).toEqual(["strict"]);
    },
  );
});

describe("the makam-prod units", () => {
  it("run the three scripts with --env prod, the way staging's run them with --env staging", () => {
    expect(values(loadUnit("makam-prod-db-backup.service"), "Service", "ExecStart")).toEqual(["/opt/makam-v1/bin/makam-backup-db --env prod"]);
    expect(values(loadUnit("makam-prod-files-backup.service"), "Service", "ExecStart")).toEqual(["/opt/makam-v1/bin/makam-backup-files --env prod"]);
    expect(values(loadUnit("makam-prod-restore-test.service"), "Service", "ExecStart")).toEqual(["/opt/makam-v1/bin/makam-restore-test --env prod"]);
  });

  it("restore-check the production Dump only after production's own database backup has had its turn", () => {
    expect(values(loadUnit("makam-prod-restore-test.service"), "Unit", "After")).toEqual([
      "network-online.target docker.service makam-prod-db-backup.service",
    ]);
  });

  it("run the health watchdog every minute against the production web on port 3100, app check first and disk check second", () => {
    const service = loadUnit("makam-prod-health.service");
    expect(values(service, "Service", "ExecStart")).toEqual([
      `/opt/makam-v1/bin/makam-healthcheck ${PROD_HEALTH_URL}`,
      "/opt/makam-v1/bin/makam-diskcheck /",
    ]);
    const timer = loadUnit("makam-prod-health.timer");
    expect(values(timer, "Timer", "OnUnitActiveSec")).toEqual(["1min"]);
    expect(values(timer, "Timer", "OnBootSec")).toHaveLength(1);
  });

  it("are timers wanted by timers.target and survive a reboot that missed their hour", () => {
    for (const name of ["db-backup", "files-backup", "restore-test", "health"]) {
      expect(values(loadUnit(`makam-prod-${name}.timer`), "Install", "WantedBy"), name).toEqual(["timers.target"]);
    }
    for (const name of ["db-backup", "files-backup", "restore-test"]) {
      expect(values(loadUnit(`makam-prod-${name}.timer`), "Timer", "Persistent"), name).toEqual(["true"]);
    }
  });
});

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

/** Minutes after midnight WIB of an `OnCalendar` that is a daily or weekly time in Asia/Jakarta. */
function calendarMinute(onCalendar: string): number {
  const match = /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) )?\*-\*-\* (\d{2}):(\d{2}):00 Asia\/Jakarta$/.exec(onCalendar);
  if (!match) throw new Error(`OnCalendar=${onCalendar} is not a daily or weekly time in Asia/Jakarta`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesOf(span: string): number {
  const match = /^(\d+)(s|min)$/.exec(span);
  if (!match) throw new Error(`cannot read ${span} as seconds or minutes`);
  return match[2] === "min" ? Number(match[1]) : Number(match[1]) / 60;
}

type Job = { name: string; start: number; end: number };

/**
 * When each job may be running, at its worst: from its hour, through the random
 * delay the timer adds, to the longest the service is allowed to run. A weekly
 * job is counted as if it ran every day, which is stricter than the truth.
 */
function jobs(env: "staging" | "prod"): Job[] {
  return ["db-backup", "files-backup", "restore-test"].map((family) => {
    const name = `makam-${env}-${family}`;
    const timer = loadUnit(`${name}.timer`);
    const service = loadUnit(`${name}.service`);
    const start = calendarMinute(only(values(timer, "Timer", "OnCalendar"), `${name} OnCalendar`));
    const delay = minutesOf(only(values(timer, "Timer", "RandomizedDelaySec"), `${name} RandomizedDelaySec`));
    const timeout = minutesOf(only(values(service, "Service", "TimeoutStartSec"), `${name} TimeoutStartSec`));
    return { name, start, end: start + delay + timeout };
  });
}

describe("the makam-prod backup and restore-check times (WIB)", () => {
  const onCalendar = (name: string): string => only(values(loadUnit(`${name}.timer`), "Timer", "OnCalendar"), `${name} OnCalendar`);

  it("put the database Dump at 01:15, the FileStore tar at 01:45 and the restore check on Mondays at 05:15", () => {
    expect(onCalendar("makam-prod-db-backup")).toBe("*-*-* 01:15:00 Asia/Jakarta");
    expect(onCalendar("makam-prod-files-backup")).toBe("*-*-* 01:45:00 Asia/Jakarta");
    expect(onCalendar("makam-prod-restore-test")).toBe("Mon *-*-* 05:15:00 Asia/Jakarta");
  });

  it("never let a production job run while another production or staging job may be running", () => {
    const staging = jobs("staging");
    const prod = jobs("prod");
    const clashes: string[] = [];
    for (const job of prod) {
      for (const other of [...staging, ...prod]) {
        if (other === job) continue;
        if (job.start < other.end && other.start < job.end) clashes.push(`${job.name} and ${other.name}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("start the restore check only after the same night's Dump has finished, at its worst", () => {
    const [database, , restore] = jobs("prod");
    expect(restore.start).toBeGreaterThanOrEqual(database.end);
  });

  it("stay inside one calendar day, so the overlap sum above does not wrap past midnight", () => {
    for (const job of jobs("prod")) expect(job.end, job.name).toBeLessThan(24 * 60);
  });
});

// ---------------------------------------------------------------------------
// deploy/install-host.sh
// ---------------------------------------------------------------------------

const PROD_TIMERS = ["makam-prod-db-backup.timer", "makam-prod-files-backup.timer", "makam-prod-restore-test.timer", "makam-prod-health.timer"];
const STAGING_TIMERS = [
  "makam-staging-deploy.timer",
  "makam-staging-health.timer",
  "makam-staging-files-backup.timer",
  "makam-staging-db-backup.timer",
  "makam-staging-restore-test.timer",
];
const DIGEST = `sha256:${"d".repeat(64)}`;
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** A host that is only a temp directory: sudo and systemctl write down their arguments and do nothing. */
function host() {
  const base = mkdtempSync(path.join(tmpdir(), "makam-install-"));
  dirs.push(base);
  const root = path.join(base, "opt-makam-v1");
  const fakebin = path.join(base, "fakebin");
  const log = path.join(base, "calls.log");
  mkdirSync(fakebin);
  for (const command of ["sudo", "systemctl"]) {
    writeFileSync(path.join(fakebin, command), `#!/usr/bin/env bash\necho "${command} $*" >> "${log}"\n`);
    chmodSync(path.join(fakebin, command), 0o755);
  }
  const calls = (): string[] => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : []);
  return {
    root,
    calls,
    /** What `systemctl enable` was asked for, by the installer, as unit names. */
    enabled: (): string[] =>
      calls()
        .filter((call) => call.startsWith("sudo systemctl enable"))
        .flatMap((call) => call.split(" ").filter((word) => word.endsWith(".timer"))),
    /** What the deploy script writes when a release is running. */
    deployed: (text: string) => {
      mkdirSync(path.join(root, "prod"), { recursive: true });
      writeFileSync(path.join(root, "prod/deployed.env"), text);
    },
    install: () => {
      const result = spawnSync("bash", [path.join(repo, "deploy/install-host.sh"), "--allow-branch"], {
        encoding: "utf8",
        env: { ...process.env, MAKAM_ROOT: root, PATH: `${fakebin}:${process.env.PATH}` },
      });
      return { status: result.status, output: `${result.stdout}${result.stderr}`, lines: `${result.stdout}${result.stderr}`.split("\n") };
    },
  };
}

const releaseRecord = (digest: string): string =>
  `MAKAM_TAG=sha-0123456789abcdef0123456789abcdef01234567\nMAKAM_DIGEST=${digest}\nMAKAM_DEPLOY_REF=:sha-0123@${digest}\nMAKAM_RELEASE=0123456\nPREVIOUS_TAG=\nDEPLOYED_AT=2026-10-04T01:00:00+07:00\n`;

describe("deploy/install-host.sh and the makam-prod timers", () => {
  it("installs the eight makam-prod backup, restore-check and health units whether or not production has been deployed", () => {
    const h = host();
    const result = h.install();
    expect(result.status, result.output).toBe(0);
    for (const unit of [...PROD_TIMERS, ...PROD_TIMERS.map((timer) => timer.replace(/\.timer$/, ".service"))]) {
      expect(
        h.calls().some((call) => call.startsWith("sudo install ") && call.includes(`/deploy/systemd/${unit} `) && call.endsWith(" /etc/systemd/system/")),
        `${unit} is not installed into /etc/systemd/system`,
      ).toBe(true);
    }
  });

  const gateClosed: [string, string | undefined][] = [
    ["has no prod/deployed.env at all", undefined],
    ["has an empty prod/deployed.env, what a first deploy that was rolled back leaves", ""],
    ["has a prod/deployed.env with no MAKAM_DIGEST line", "MAKAM_TAG=sha-abc\nPREVIOUS_TAG=\n"],
    ["has a prod/deployed.env whose MAKAM_DIGEST is blank", "MAKAM_TAG=\nMAKAM_DIGEST=\n"],
  ];
  it.each(gateClosed)("enables no makam-prod timer, and says how to enable them later, when production %s", (_case, record) => {
    const h = host();
    if (record !== undefined) h.deployed(record);
    const result = h.install();
    expect(result.status, result.output).toBe(0);

    expect(h.enabled().filter((timer) => timer.startsWith("makam-prod-"))).toEqual([]);
    // Staging is untouched by the gate.
    expect(h.enabled()).toEqual(expect.arrayContaining(STAGING_TIMERS));

    const note = result.lines.find((line) => line.startsWith("NOTE") && line.includes("MAKAM_DIGEST"));
    expect(note, result.output).toBeDefined();
    expect(note).toContain("install-host.sh");
    for (const timer of PROD_TIMERS) expect(note, timer).toContain(timer);
    expect(note).toContain("systemctl enable --now");
  });

  it("enables the four makam-prod timers, after daemon-reload, once prod/deployed.env has a MAKAM_DIGEST", () => {
    const h = host();
    h.deployed(releaseRecord(DIGEST));
    const result = h.install();
    expect(result.status, result.output).toBe(0);

    expect(h.enabled()).toEqual(expect.arrayContaining([...STAGING_TIMERS, ...PROD_TIMERS]));
    expect(result.lines.filter((line) => line.startsWith("NOTE") && line.includes("MAKAM_DIGEST"))).toEqual([]);

    const calls = h.calls();
    const reload = calls.indexOf("sudo systemctl daemon-reload");
    const prodEnable = calls.findIndex((call) => call.startsWith("sudo systemctl enable") && call.includes("makam-prod-health.timer"));
    expect(reload).toBeGreaterThanOrEqual(0);
    expect(prodEnable).toBeGreaterThan(reload);
  });

  it("never enables makam-prod-deploy.timer, gate or no gate: production follows an explicit digest until the owner says otherwise", () => {
    for (const record of [undefined, releaseRecord(DIGEST)]) {
      const h = host();
      if (record !== undefined) h.deployed(record);
      h.install();
      expect(h.enabled()).not.toContain("makam-prod-deploy.timer");
    }
  });

  it("enables them when it is run again after the first production deploy", () => {
    const h = host();
    expect(h.install().status).toBe(0);
    expect(h.enabled().filter((timer) => timer.startsWith("makam-prod-"))).toEqual([]);

    h.deployed(releaseRecord(DIGEST));
    expect(h.install().status).toBe(0);
    expect(h.enabled()).toEqual(expect.arrayContaining(PROD_TIMERS));
  });
});

// ---------------------------------------------------------------------------
// Runbook
// ---------------------------------------------------------------------------

describe("the runbook's backup and uptime sections", () => {
  const runbook = read("docs/ops/runbook.md");
  function section(heading: string): string {
    const start = runbook.indexOf(`\n## ${heading}`);
    expect(start, `no "## ${heading}" section in the runbook`).toBeGreaterThanOrEqual(0);
    const next = runbook.indexOf("\n## ", start + 1);
    return runbook.slice(start, next === -1 ? undefined : next);
  }

  it("describe production's database backup, its restore check, their hours, how to look at them and when the installer enables them", () => {
    const text = section("Database backup and restore");
    for (const word of [
      "makam-prod-db-backup.timer",
      "makam-prod-restore-test.timer",
      "01:15",
      "05:15",
      "/opt/makam-v1/prod/backups/db",
      "makam-restore-test --env prod",
      "list-timers 'makam-prod-",
      "MAKAM_DIGEST",
      "install-host.sh",
    ]) {
      expect(text, word).toContain(word);
    }
    expect(text).not.toContain("Only the `makam-staging-*` units are installed");
  });

  it("describe production's FileStore backup, its hour and how to look at it", () => {
    const text = section("File storage");
    for (const word of ["makam-prod-files-backup.timer", "01:45", "/opt/makam-v1/prod/backups/files"]) {
      expect(text, word).toContain(word);
    }
  });

  it("describe production's local watchdog, the address it checks and how to read its failures", () => {
    const text = section("Uptime alarm");
    for (const word of ["makam-prod-health.timer", PROD_HEALTH_URL, "journalctl -t makam-health", "makam-prod-health.service"]) {
      expect(text, word).toContain(word);
    }
  });
});

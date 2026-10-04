import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const unit = (name: string) => read(`deploy/systemd/${name}`);

const KINDS = ["db-backup", "files-backup", "restore-test", "health"] as const;
const HARDENING = ["NoNewPrivileges", "PrivateTmp", "ProtectSystem", "ProtectHome", "ReadWritePaths"];

function directives(text: string, keys: string[]): string[] {
  return text
    .split("\n")
    .filter((line) => keys.some((key) => line.startsWith(`${key}=`)))
    .sort();
}

function calendar(text: string): string {
  const line = text.split("\n").find((l) => l.startsWith("OnCalendar="));
  if (!line) throw new Error("no OnCalendar");
  return line.slice("OnCalendar=".length);
}

describe("production backup, restore-test and health units", () => {
  for (const kind of KINDS) {
    describe(kind, () => {
      it("has a prod service and timer twin of the staging unit", () => {
        expect(() => unit(`makam-prod-${kind}.service`)).not.toThrow();
        expect(() => unit(`makam-prod-${kind}.timer`)).not.toThrow();
      });

      it("has the same hardening as the staging service", () => {
        const staging = directives(unit(`makam-staging-${kind}.service`), HARDENING);
        expect(staging.length).toBeGreaterThan(0);
        expect(directives(unit(`makam-prod-${kind}.service`), HARDENING)).toEqual(staging);
      });

      it("names no staging environment", () => {
        const text = unit(`makam-prod-${kind}.service`) + unit(`makam-prod-${kind}.timer`);
        expect(text.replace(/^#.*$/gm, "")).not.toMatch(/staging/);
      });
    });
  }

  for (const kind of ["db-backup", "files-backup", "restore-test"] as const) {
    it(`runs the ${kind} script with --env prod`, () => {
      const service = unit(`makam-prod-${kind}.service`);
      const script = kind === "db-backup" ? "makam-backup-db" : kind === "files-backup" ? "makam-backup-files" : "makam-restore-test";
      expect(service).toContain(`ExecStart=/opt/makam-v1/bin/${script} --env prod`);
    });
  }

  it("restore test waits for the prod database backup", () => {
    expect(unit("makam-prod-restore-test.service")).toMatch(/^After=.*makam-prod-db-backup\.service/m);
  });

  it("schedules the prod DB at 01:15, files at 01:45 and the restore test Monday 05:15 WIB", () => {
    expect(calendar(unit("makam-prod-db-backup.timer"))).toBe("*-*-* 01:15:00 Asia/Jakarta");
    expect(calendar(unit("makam-prod-files-backup.timer"))).toBe("*-*-* 01:45:00 Asia/Jakarta");
    expect(calendar(unit("makam-prod-restore-test.timer"))).toBe("Mon *-*-* 05:15:00 Asia/Jakarta");
  });

  it("never shares a time with the staging timers", () => {
    const times = ["db-backup", "files-backup", "restore-test"].flatMap((kind) =>
      ["staging", "prod"].map((env) => calendar(unit(`makam-${env}-${kind}.timer`)).replace(/^Mon /, "")),
    );
    expect(new Set(times).size).toBe(times.length);
  });

  it("checks /api/health on 127.0.0.1:3100 every minute", () => {
    expect(unit("makam-prod-health.service")).toContain(
      "ExecStart=/opt/makam-v1/bin/makam-healthcheck http://127.0.0.1:3100/api/health",
    );
    expect(unit("makam-prod-health.timer")).toMatch(/^OnUnitActiveSec=1min$/m);
  });
});

describe("install-host.sh and the production timers", () => {
  const install = read("deploy/install-host.sh");

  it("installs every unit in deploy/systemd (the prod ones included)", () => {
    expect(install).toMatch(/deploy\/systemd\/\*\.service/);
    expect(install).toMatch(/deploy\/systemd\/\*\.timer/);
  });

  it("enables the four prod timers only behind a MAKAM_DIGEST gate on prod/deployed.env", () => {
    const enable = install.indexOf("makam-prod-db-backup.timer");
    expect(enable).toBeGreaterThan(-1);
    for (const kind of KINDS) expect(install).toContain(`makam-prod-${kind}.timer`);
    const gate = install.search(/grep -q[^\n]*\^MAKAM_DIGEST=[^\n]*prod\/deployed\.env/);
    expect(gate).toBeGreaterThan(-1);
    const enableCall = install.search(/systemctl enable[^\n]*\\?\n?[^\n]*makam-prod-db-backup\.timer/);
    expect(enableCall).toBeGreaterThan(gate);
    // enable --now of a prod timer sits inside the `if` block, never at top level
    const block = install.slice(gate);
    expect(block).toMatch(/^\s*if [\s\S]*?\bthen\b[\s\S]*?systemctl enable --now[\s\S]*?makam-prod-health\.timer[\s\S]*?\belse\b[\s\S]*?NOTE:/m);
  });

  it("prints a NOTE saying how to enable them later", () => {
    expect(install).toMatch(/NOTE:[^\n]*prod[^\n]*(re-run|Re-run)/i);
  });

  it("does not enable the prod deploy timer", () => {
    expect(install).not.toMatch(/systemctl enable[^\n]*makam-prod-deploy\.timer/);
  });
});

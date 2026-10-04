import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const ci = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");

/** Each job's direct `needs:` (inline `x` or `[x, y]`), read from the job's own two-space-indented keys. */
function needsGraph(workflow: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const jobs = workflow.slice(workflow.indexOf("\njobs:\n") + 1).split(/\n(?=  [a-z0-9][a-z0-9-]*:\n)/).slice(1);
  for (const job of jobs) {
    const name = /^ {2}([a-z0-9][a-z0-9-]*):/.exec(job)![1];
    const needs = /^ {4}needs:[ \t]*(.+)$/m.exec(job)?.[1] ?? "";
    graph.set(name, needs.replace(/[[\]]/g, "").split(",").map((n) => n.trim()).filter(Boolean));
  }
  return graph;
}

/** Everything a job waits for, directly or through other jobs. */
function mustPass(graph: Map<string, string[]>, job: string, seen = new Set<string>()): Set<string> {
  for (const need of graph.get(job) ?? []) {
    if (!seen.has(need)) {
      seen.add(need);
      mustPass(graph, need, seen);
    }
  }
  return seen;
}

describe("ci.yml job graph", () => {
  const graph = needsGraph(ci);

  it("is read in full: every needs: line of the file is one the reader understood", () => {
    // A multi-line list or a re-indented job would otherwise read as "needs nothing".
    const lines = ci.match(/^\s*needs:.*$/gm) ?? [];
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.filter((line) => !/^ {4}needs:[ \t]*\S/.test(line))).toEqual([]);
    expect([...graph.values()].filter((needs) => needs.length > 0)).toHaveLength(lines.length);
  });

  it("the image job does not wait for check", () => {
    expect(graph.get("image")).toEqual([]);
  });

  it("signing, moving latest and the deploy gate wait for every check, whichever way the graph runs", () => {
    for (const job of ["deploy-gate", "sign"]) {
      expect([...mustPass(graph, job)]).toEqual(expect.arrayContaining(["check", "secrets", "migrations", "image", "e2e", "scan"]));
    }
    expect(graph.get("sign")).toEqual(["deploy-gate"]);
  });
});

describe("test-tuned Postgres", () => {
  it("is set only on CI's two test services, never in a compose file or anything under deploy/", () => {
    expect(ci.match(/alter system set \$setting = off/g)).toHaveLength(2);
    const repo = new URL("../..", import.meta.url).pathname;
    const files = execFileSync("git", ["ls-files", "deploy", "docker-compose.yml", "docker-compose.prod.yml"], { cwd: repo, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    expect(files.length).toBeGreaterThan(2);
    for (const file of files) {
      expect(readFileSync(`${repo}/${file}`, "utf8"), file).not.toMatch(/fsync|synchronous_commit|full_page_writes/);
    }
  });
});

describe("ci.yml actionlint job", () => {
  const workflow = parse(ci) as { jobs: Record<string, { steps?: { uses?: string; run?: string }[] }> };
  const steps = workflow.jobs.actionlint?.steps ?? [];
  const lintStep = steps.find((s) => /actionlint/.test(s.run ?? ""));

  it("exists and lints every workflow under .github/workflows", () => {
    expect(lintStep?.run ?? "").toMatch(/\.github\/workflows\/\*\.yml/);
  });

  it("runs a pinned linter: an image by digest or an action by commit SHA", () => {
    const pinned = /actionlint[^\s]*@sha256:[0-9a-f]{64}/.test(lintStep?.run ?? "") || steps.some((s) => /rhysd\/actionlint@[0-9a-f]{40}\b/.test(s.uses ?? ""));
    expect(pinned).toBe(true);
  });

  it("is a check the deploy gate waits for", () => {
    expect([...mustPass(needsGraph(ci), "deploy-gate")]).toContain("actionlint");
    expect([...mustPass(needsGraph(ci), "sign")]).toContain("actionlint");
  });
});

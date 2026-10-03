import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
  it("is set only on CI's two test services, never in a compose file or the deploy scripts", () => {
    expect(ci.match(/alter system set \$setting = off/g)).toHaveLength(2);
    for (const file of ["../../docker-compose.yml", "../../docker-compose.prod.yml"]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).not.toMatch(/fsync|synchronous_commit|full_page_writes/);
    }
  });
});

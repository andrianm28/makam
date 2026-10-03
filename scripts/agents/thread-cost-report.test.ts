import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(__dirname, "thread-cost-report.py");
const fx = (name: string) => join(__dirname, "fixtures", "thread-cost", name);

function run(args: string[]) {
  const r = spawnSync("python3", [script, ...args], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const json = (args: string[]) => {
  const r = run([...args, "--json"]);
  expect(r.err).toBe("");
  expect(r.code).toBe(0);
  return JSON.parse(r.out);
};

describe("thread cost report: sessions", () => {
  it("lists each thread's role, ticket and cost, the total per ticket, the coordinator's cost and the grand total", () => {
    const r = json([fx("sessions.json")]);
    expect(r.coordinator_cost).toBe(10);
    expect(r.tickets["aos-05"]).toBe(2);
    expect(r.tickets["48"]).toBe(2);
    expect(r.threads.find((t: { session_id: string }) => t.session_id === "sess-a")).toMatchObject({ role: "builder", ticket: "aos-05", cost_usd: 1.5 });
    expect(r.total).toBe(15);
  });

  it("derives a missing role and ticket from the title, else unknown", () => {
    const r = json([fx("sessions.json")]);
    const d = r.threads.find((t: { session_id: string }) => t.session_id === "sess-d");
    expect(d).toMatchObject({ role: "builder", ticket: "aos-07" });
    const e = r.threads.find((t: { session_id: string }) => t.session_id === "sess-e");
    expect(e).toMatchObject({ role: "unknown", ticket: "unknown" });
  });

  it("counts a missing cost as 0 and flags it, and lists sessions whose parent is not the coordinator apart, uncounted", () => {
    const r = json([fx("sessions.json")]);
    expect(r.threads.find((t: { session_id: string }) => t.session_id === "sess-e")).toMatchObject({ cost_usd: 0, no_cost: true });
    expect(r.threads.find((t: { session_id: string }) => t.session_id === "sess-a").no_cost).toBe(false);
    expect(r.other_sessions.map((o: { session_id: string }) => o.session_id)).toEqual(["sess-f"]);
    expect(r.total).toBe(15);
    const text = run([fx("sessions.json")]);
    expect(text.out).toContain("no cost");
    expect(text.out).toContain("other sessions");
    expect(text.out).toContain("sess-f");
  });
});

describe("thread cost report: coordinator wake causes", () => {
  it("splits the coordinator's cost by what woke it: watcher, report-back, hourly-poll, owner, other", () => {
    const r = json([fx("sessions.json"), "--transcript", fx("coordinator.jsonl")]);
    const c = r.causes;
    expect(Object.keys(c).sort()).toEqual(["hourly-poll", "other", "owner", "report-back", "watcher"]);
    expect(c.watcher).toMatchObject({ units: 4350, wakes: 2 });
    expect(c["report-back"]).toMatchObject({ units: 500, wakes: 1 });
    expect(c["hourly-poll"]).toMatchObject({ units: 200, wakes: 1 });
    expect(c.owner).toMatchObject({ units: 2500, wakes: 1 });
    expect(c.other).toMatchObject({ units: 100, wakes: 1 });
    expect(c.watcher.share).toBeCloseTo(56.86, 1);
    expect(c.watcher.usd).toBeCloseTo(5.686, 2);
  });
});

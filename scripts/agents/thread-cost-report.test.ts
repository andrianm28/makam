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

  it("takes its marker rules from --markers when given", () => {
    const r = json([fx("sessions.json"), "--transcript", fx("coordinator.jsonl"), "--markers", fx("markers.json")]);
    // the file replaces the report-back patterns: the "ticket 12" turn is now a report-back, the "done: <sha>" turn no longer is
    expect(r.causes["report-back"]).toMatchObject({ units: 2500, wakes: 1 });
    expect(r.causes.owner).toMatchObject({ units: 500, wakes: 1 });
  });
});

describe("thread cost report: a week", () => {
  it("keeps only the threads created and the wakes that happened between --since and --until (whole days)", () => {
    const r = json([fx("sessions.json"), "--transcript", fx("coordinator.jsonl"), "--since", "2026-10-02", "--until", "2026-10-08"]);
    expect(r.threads.map((t: { session_id: string }) => t.session_id).sort()).toEqual(["sess-b", "sess-d", "sess-e"]);
    expect(r.tickets).toEqual({ "aos-05": 0.5, "aos-07": 1, unknown: 0 });
    expect(r.total).toBe(11.5);
    expect(r.causes.watcher).toMatchObject({ units: 1100, wakes: 1 });
    expect(r.causes["hourly-poll"]).toMatchObject({ units: 200, wakes: 1 });
    expect(r.causes.owner).toBeUndefined();
  });

  it("--compare prints the change in total, per-ticket and per-cause cost against a previous --json run", () => {
    const args = [fx("sessions.json"), "--transcript", fx("coordinator.jsonl"), "--compare", fx("previous.json")];
    const c = json(args).compare;
    expect(c.total).toEqual({ previous: 10, current: 15, delta: 5 });
    expect(c.tickets["aos-05"].delta).toBe(1);
    expect(c.tickets["48"].delta).toBe(-1);
    expect(c.tickets["aos-07"]).toEqual({ previous: 0, current: 1, delta: 1 });
    expect(c.causes.watcher.units.delta).toBe(3350);
    expect(c.causes.owner.units.delta).toBe(1500);
    expect(c.causes["report-back"].units).toEqual({ previous: 0, current: 500, delta: 500 });
    const text = run(args).out;
    expect(text).toContain("+5.00");
    expect(text).toContain("-1.00");
  });
});

describe("thread cost report: coordinator cost in a window", () => {
  const windowed = (extra: string[] = []) => [fx("sessions-window.json"), "--transcript", fx("coordinator.jsonl"), "--since", "2026-10-02", "--until", "2026-10-08", ...extra];

  it("charges a windowed run only the coordinator's cost since the window start (cost_usd minus cost_usd_at_window_start)", () => {
    const r = json(windowed());
    expect(r.coordinator_cost).toBe(6);
    expect(r.total).toBe(7.5);
    expect(r.causes.watcher.usd).toBeCloseTo((6 * 1100) / 1300, 5);
    expect(r.causes["hourly-poll"].usd).toBeCloseTo((6 * 200) / 1300, 5);
    expect(run(windowed()).out).toContain("Coordinator 6.00");
  });

  it("labels the coordinator USD and total as cumulative, not windowed, when a window has no start value", () => {
    const args = [fx("sessions.json"), "--transcript", fx("coordinator.jsonl"), "--since", "2026-10-02"];
    const text = run(args).out;
    expect(text).toMatch(/Coordinator 10\.00.*cumulative, not windowed/);
    expect(text).toMatch(/Total 11\.50.*cumulative, not windowed/);
    expect(json(args).coordinator_cumulative).toBe(true);
    expect(run([fx("sessions.json")]).out).not.toContain("cumulative");
  });

  it("--compare does not treat a cumulative coordinator cost as a delta", () => {
    const args = [fx("sessions.json"), "--transcript", fx("coordinator.jsonl"), "--since", "2026-10-02", "--compare", fx("previous.json")];
    const text = run(args).out;
    expect(text).not.toMatch(/total .* \+/);
    expect(text).toContain("not comparable");
    expect(json(args).compare.total).toBeNull();
  });
});

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
});

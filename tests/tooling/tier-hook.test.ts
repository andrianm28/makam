import { describe, expect, it } from "vitest";
import { runHook } from "../support/hook";

const agent = (tool_input: Record<string, unknown>) => runHook("require-subagent-model.sh", { tool_name: "Agent", tool_input });

const createSession = (tool_input: Record<string, unknown>) =>
  runHook("require-subagent-model.sh", {
    tool_name: "mcp__bf7c680d-5fdc-5ef4-b4a0-abadb619bf0a__create_session",
    tool_input,
  });

describe("create_session tier hook", () => {
  it("refuses a thread started without a model, and the message names the tier rule", () => {
    const r = createSession({ title: "Build ticket 12: perpanjangan", prompt: "go" });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/model/);
    expect(r.stderr).toMatch(/sonnet/);
    expect(r.stderr).toMatch(/opus/);
  });

  it("accepts a full model id, which is how create_session names a model", () => {
    for (const model of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5-20251001", "sonnet"]) {
      expect(createSession({ title: "Build ticket 12: perpanjangan", model }).status, model).toBe(0);
    }
  });
});

describe("review tier matrix", () => {
  it("makes a review of money code name opus, for the reviewer agent and for a review thread alike", () => {
    const a = agent({ subagent_type: "reviewer", description: "Review ticket 61", prompt: "Review the Billing Tagihan branch" });
    expect(a.status).toBe(2);
    expect(a.stderr).toMatch(/opus/);
    expect(agent({ subagent_type: "reviewer", description: "Review ticket 61", prompt: "Review Billing", model: "sonnet" }).status).toBe(2);
    expect(createSession({ title: "Review ticket 61: refund", prompt: "go", model: "claude-sonnet-5-5" }).status).toBe(2);
    expect(agent({ subagent_type: "reviewer", description: "Review ticket 61", prompt: "Review Billing", model: "opus" }).status).toBe(0);
    expect(createSession({ title: "Review ticket 61: refund", prompt: "go", model: "claude-opus-5-5" }).status).toBe(0);
  });

  it("leaves a review of other code on the reviewer's own sonnet", () => {
    expect(agent({ subagent_type: "reviewer", description: "Review ticket 48", prompt: "Review perpanjangan" }).status).toBe(0);
  });
});

describe("haiku", () => {
  it("is refused for a review, and allowed for a doc sweep", () => {
    const r = agent({ subagent_type: "reviewer", description: "Review ticket 48", prompt: "x", model: "haiku" });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/haiku/);
    expect(createSession({ title: "Re-review ticket 48", prompt: "x", model: "claude-haiku-4-5-20251001" }).status).toBe(2);
    expect(agent({ description: "Docs sweep", prompt: "rename a term", model: "haiku" }).status).toBe(0);
  });
});


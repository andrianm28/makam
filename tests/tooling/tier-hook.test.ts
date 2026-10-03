import { describe, expect, it } from "vitest";
import { runHook } from "../support/hook";

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

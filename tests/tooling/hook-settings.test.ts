import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../support/hook";

type Entry = { matcher?: string; hooks: { type: string; command: string }[] };
const settings = JSON.parse(readFileSync(path.join(repoRoot, ".claude/settings.json"), "utf8")) as {
  hooks: Record<string, Entry[]>;
  permissions?: { deny?: string[] };
};

/** The commands Claude Code would run before `tool`: a matcher of letters and `|` is an exact-name list, any other is a regex. */
function preToolUse(tool: string): string[] {
  return settings.hooks.PreToolUse.filter((e) => {
    const m = e.matcher ?? "";
    return /^[A-Za-z0-9_|]*$/.test(m) ? m.split("|").includes(tool) : new RegExp(m).test(tool);
  }).flatMap((e) => e.hooks.map((h) => h.command));
}

describe("settings.json registrations", () => {
  it("runs the model hook before a create_session call from any MCP server", () => {
    expect(preToolUse("mcp__bf7c680d-5fdc-5ef4-b4a0-abadb619bf0a__create_session").join("\n")).toContain(
      "require-subagent-model.sh",
    );
  });
});

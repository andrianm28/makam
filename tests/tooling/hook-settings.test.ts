import { existsSync, readFileSync } from "node:fs";
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

  it("denies the GitHub MCP tools that open, merge or update pull requests or write files and branches through the API", () => {
    const deny = settings.permissions?.deny ?? [];
    for (const tool of [
      "mcp__github__create_pull_request",
      "mcp__github__merge_pull_request",
      "mcp__github__update_pull_request",
      "mcp__github__update_pull_request_branch",
      "mcp__github__enable_pr_auto_merge",
      "mcp__github__push_files",
      "mcp__github__create_or_update_file",
      "mcp__github__delete_file",
      "mcp__github__create_branch",
    ]) {
      expect(deny, tool).toContain(tool);
    }
    // Rules with parentheses are skipped for MCP tools: only bare tool names.
    expect(deny.filter((r) => r.startsWith("mcp__") && r.includes("("))).toEqual([]);
  });

  it("runs the git guard before every Bash command", () => {
    expect(preToolUse("Bash").join("\n")).toContain("guard-git.sh");
  });

  it("does not ship .claude/main-writers: the merge thread of ticket 87 creates it, and its arrival ends bootstrap mode", () => {
    expect(existsSync(path.join(repoRoot, ".claude/main-writers"))).toBe(false);
  });
});

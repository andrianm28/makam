#!/usr/bin/env bash
# PreToolUse hook: every subagent call must name its model (AGENTS.md "Model tiering").
# sonnet: building, first reviews, re-reviews, research, prototypes; opus: reviews and re-reviews of
# money code, and hard security, money or concurrency code after sonnet failed; haiku: doc sweeps and
# mechanical edits only, never a review (owner, 2026-10-03).
# Exit 2 blocks the call and shows stderr to the agent.
node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c)).on("end", () => {
  let input = {};
  try { input = JSON.parse(raw).tool_input ?? {}; } catch { process.exit(0); }
  const model = input.model;
  if (["sonnet", "haiku", "opus"].includes(model)) process.exit(0);
  // The project agents in .claude/agents (builder, reviewer) name their own model in their frontmatter.
  if (["builder", "reviewer"].includes(input.subagent_type)) process.exit(0);
  process.stderr.write(
    `Subagent call blocked: pass model ("sonnet" | "haiku" | "opus"), got ${JSON.stringify(model ?? null)}. ` +
    "AGENTS.md model tiering: sonnet for building, first reviews, re-reviews, research and prototypes; " +
    "opus for reviews and re-reviews of money code, and hard security, money or concurrency code when sonnet failed; " +
    "haiku only for doc sweeps and mechanical edits, never a review.\n"
  );
  process.exit(2);
});
'

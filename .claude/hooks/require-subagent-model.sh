#!/usr/bin/env bash
# PreToolUse hook: every subagent call (Agent) and every thread start (create_session) must name its
# model (AGENTS.md "Model tiering"). An omitted create_session model defaults to Opus; an omitted
# Agent model falls back to the agent's own (sonnet for builder and reviewer).
# sonnet: building, first reviews, re-reviews, research, prototypes; opus: reviews and re-reviews of
# money code, and hard security, money or concurrency code after sonnet failed; haiku: doc sweeps and
# mechanical edits only, never a review (owner, 2026-10-03).
# Exit 2 blocks the call and shows stderr to the agent.
node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c)).on("end", () => {
  let input = {};
  try { input = JSON.parse(raw).tool_input ?? {}; } catch { process.exit(0); }
  // Agent calls take an alias; create_session takes an alias or a full id such as claude-opus-5-5.
  const tier = ["sonnet", "haiku", "opus"].find((t) => typeof input.model === "string" && input.model.includes(t));
  if (tier) process.exit(0);
  // The project agents in .claude/agents (builder, reviewer) name their own model in their frontmatter.
  if (["builder", "reviewer"].includes(input.subagent_type)) process.exit(0);
  process.stderr.write(
    `Subagent or thread call blocked: pass model ("sonnet" | "haiku" | "opus", or a full id for create_session), got ${JSON.stringify(input.model ?? null)}. ` +
    "AGENTS.md model tiering: sonnet for building, first reviews, re-reviews, research and prototypes; " +
    "opus for reviews and re-reviews of money code, and hard security, money or concurrency code when sonnet failed; " +
    "haiku only for doc sweeps and mechanical edits, never a review.\n"
  );
  process.exit(2);
});
'

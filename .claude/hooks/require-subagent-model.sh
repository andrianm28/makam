#!/usr/bin/env bash
# PreToolUse hook: every subagent call must name its model (AGENTS.md "Model tiering").
# sonnet: building, first reviews, research, prototypes; haiku: re-reviews of a fix list,
# doc sweeps, mechanical edits; opus: only hard security, money or concurrency code after sonnet failed.
# Exit 2 blocks the call and shows stderr to the agent.
node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c)).on("end", () => {
  let input = {};
  try { input = JSON.parse(raw).tool_input ?? {}; } catch { process.exit(0); }
  const model = input.model;
  if (["sonnet", "haiku", "opus"].includes(model)) process.exit(0);
  process.stderr.write(
    `Subagent call blocked: pass model ("sonnet" | "haiku" | "opus"), got ${JSON.stringify(model ?? null)}. ` +
    "AGENTS.md model tiering: sonnet for building, first reviews, research and prototypes; " +
    "haiku for re-reviews of a fix list, doc sweeps and mechanical edits; " +
    "opus only for hard security, money or concurrency code when sonnet failed.\n"
  );
  process.exit(2);
});
'
